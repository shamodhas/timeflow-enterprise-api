import { Response } from "express"
import {
  Attendance,
  Branch,
  Employee
} from "../models"
import { Op } from "sequelize"
import { AuthRequest } from "../middlewares/authenticate"
import {
  getCurrentLKDateString,
  getDayBoundsUTC,
  getLKDateString
} from "../utils/time"
import {
  LocationService,
  LocationVerificationError
} from "../services/location.service"
import type { ClockInPayload } from "../types/database.types"
import { isValidCoordinates, calculateDistanceMeters } from "../utils/geo.utils"
import { UserRole, AccountStatus } from "../types/database.enums"
import {
  notifyAdminsOfLocationFailure,
  notifyEmployeeToFillReason,
  notifyAdminsReasonSubmitted
} from "../utils/email"

const hasInvalidFailureReason = (reason?: string): boolean =>
  reason !== undefined &&
  (reason.trim().length < 5 || reason.trim().length > 1000)

const MAX_OFFLINE_AGE_MS = 14 * 24 * 60 * 60 * 1000
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

// Offline-recorded events carry the time they happened on the device.
const resolveOccurredAt = (
  raw: unknown
): { date: Date; provided: boolean; error?: string } => {
  if (raw === undefined || raw === null || raw === "") {
    return { date: new Date(), provided: false }
  }
  const date = typeof raw === "string" ? new Date(raw) : new Date(NaN)
  if (Number.isNaN(date.getTime())) {
    return { date: new Date(), provided: true, error: "occurredAt must be a valid ISO date." }
  }
  const now = Date.now()
  if (date.getTime() > now + MAX_CLOCK_SKEW_MS) {
    return { date, provided: true, error: "occurredAt cannot be in the future." }
  }
  if (date.getTime() < now - MAX_OFFLINE_AGE_MS) {
    return {
      date,
      provided: true,
      error: "Offline attendance older than 14 days cannot be synced. Contact HR."
    }
  }
  return { date, provided: true }
}

interface AttendanceLocationCheckResult {
  latitude: number | null
  longitude: number | null
  distanceMeters: number | null
  locationVerified: boolean
  branchId: string | null
  branchName: string | null
  failureReason: string | null
  failedAt: Date | null
  errorMessage?: string
}

const verifyAttendanceLocation = async (
  latitude?: number,
  longitude?: number,
  locationFailureReason?: string
): Promise<AttendanceLocationCheckResult> => {
  const branches = await Branch.findAll({ where: { isActive: true } })
  const validCoords = isValidCoordinates(latitude, longitude)
  const userLat = validCoords ? Number(latitude) : null
  const userLng = validCoords ? Number(longitude) : null

  let distanceMeters: number | null = null
  let closestBranch: Branch | null = null

  if (validCoords && branches.length > 0) {
    const sorted = branches
      .map((branch) => ({
        branch,
        distance: calculateDistanceMeters(
          userLat!,
          userLng!,
          Number(branch.latitude),
          Number(branch.longitude)
        )
      }))
      .sort((a, b) => a.distance - b.distance)

    if (sorted[0]) {
      closestBranch = sorted[0].branch
      distanceMeters = sorted[0].distance
    }
  }

  const isWithinGeofence =
    validCoords &&
    closestBranch !== null &&
    distanceMeters !== null &&
    distanceMeters <= closestBranch.radiusMeters

  if (isWithinGeofence && closestBranch) {
    return {
      latitude: userLat,
      longitude: userLng,
      distanceMeters,
      locationVerified: true,
      branchId: closestBranch.id,
      branchName: closestBranch.name,
      failureReason: null,
      failedAt: null
    }
  }

  const distText = closestBranch
    ? `${distanceMeters}m from ${closestBranch.name}`
    : "no active branches configured"
  const errorMessage = !validCoords
    ? "GPS location is required. Please enable location access."
    : `You are outside all branch locations (${distText}). Enter a reason to continue and notify HR.`

  return {
    latitude: userLat,
    longitude: userLng,
    distanceMeters,
    locationVerified: false,
    branchId: closestBranch ? closestBranch.id : null,
    branchName: closestBranch ? closestBranch.name : null,
    failureReason: locationFailureReason?.trim() || null,
    failedAt: new Date(),
    errorMessage
  }
}

const resolveEmployeeTarget = (
  req: AuthRequest
): { id?: string; error?: string } => {
  const tokenUserId = req.user?.id
  const tokenUserRole = req.user?.role
  const requestedEmployeeId = req.body?.employeeId

  if (!tokenUserId) {
    return { error: "Unauthorized. User ID missing from token." }
  }

  if (requestedEmployeeId && requestedEmployeeId !== tokenUserId) {
    const managementRoles = ["SUPER_ADMIN", "ADMIN", "HR"]
    if (!tokenUserRole || !managementRoles.includes(tokenUserRole)) {
      return {
        error:
          "Forbidden. Only HR or Admins can clock in/out for other employees."
      }
    }
    return { id: requestedEmployeeId }
  }

  return { id: tokenUserId }
}

export const clockIn = async (
  req: AuthRequest & { body: ClockInPayload },
  res: Response
): Promise<void> => {
  try {
    const target = resolveEmployeeTarget(req)
    if (target.error || !target.id) {
      res.status(403).json({ message: target.error || "Unauthorized." })
      return
    }

    const employeeId: string = target.id

    const occurred = resolveOccurredAt(req.body?.occurredAt)
    if (occurred.error) {
      res.status(400).json({ code: "INVALID_OCCURRED_AT", message: occurred.error })
      return
    }
    const occurredAt = occurred.date

    // Replaying an already-synced offline event must succeed without duplicating it.
    if (occurred.provided) {
      const replay = await Attendance.findOne({
        where: { employeeId, clockIn: occurredAt }
      })
      if (replay) {
        res.status(200).json(replay)
        return
      }
    }

    const { startUTC, endUTC } = getDayBoundsUTC(getLKDateString(occurredAt))

    const existingTodayRecord = await Attendance.findOne({
      where: {
        employeeId,
        createdAt: {
          [Op.between]: [startUTC, endUTC]
        }
      }
    })

    if (existingTodayRecord) {
      res.status(400).json({
        code: "ALREADY_CLOCKED_IN",
        message: "Ada dawasata already attendance mark karala thiyenne (One shift per day)."
      })
      return
    }

    const { latitude, longitude, locationFailureReason } = req.body ?? {}
    if (hasInvalidFailureReason(locationFailureReason)) {
      res.status(400).json({
        message: "Location failure reason must be between 5 and 1000 characters."
      })
      return
    }

    const locationResult = await verifyAttendanceLocation(
      latitude,
      longitude,
      locationFailureReason
    )

    // For live clock-in requests (occurred.provided is false), if location verification
    // fails and no reason was provided, prompt user to enter a reason (HTTP 422).
    // For offline sync requests (occurred.provided is true), NEVER reject with 422:
    // record the shift with locationVerified: false, send notifications, and let employee submit reason later.
    if (
      !locationResult.locationVerified &&
      !locationResult.failureReason &&
      !occurred.provided
    ) {
      res.status(422).json({
        code: "LOCATION_VERIFICATION_FAILED",
        message:
          locationResult.errorMessage ||
          "You are outside all branch locations. Enter a reason to continue and notify HR."
      })
      return
    }

    const attendance = await Attendance.create({
      employeeId,
      clockIn: occurredAt,
      ...(occurred.provided ? { createdAt: occurredAt } : {}),
      latitude: locationResult.latitude,
      longitude: locationResult.longitude,
      distanceMeters: locationResult.distanceMeters,
      locationVerified: locationResult.locationVerified,
      branchId: locationResult.branchId,
      clockInLocationFailureReason: locationResult.failureReason,
      clockInLocationFailedAt: locationResult.failedAt
    })

    // If location verification failed, dispatch notification emails asynchronously
    if (!locationResult.locationVerified) {
      void (async () => {
        try {
          const emp = await Employee.findByPk(employeeId, {
            attributes: ["id", "fullName", "employeeCode", "email"]
          })
          if (!emp) return

          const admins = await Employee.findAll({
            where: {
              role: { [Op.in]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR] },
              status: AccountStatus.ACTIVE
            },
            attributes: ["email"]
          })
          const adminEmails = admins.map((a: any) => a.email).filter(Boolean)

          await notifyAdminsOfLocationFailure({
            adminEmails,
            employeeName: emp.fullName,
            employeeCode: emp.employeeCode,
            action: "Clock In",
            time: occurredAt.toLocaleString(),
            distanceMeters: locationResult.distanceMeters,
            branchName: locationResult.branchName,
            reason: locationResult.failureReason
          })

          if (!locationResult.failureReason && emp.email) {
            await notifyEmployeeToFillReason({
              employeeEmail: emp.email,
              employeeName: emp.fullName,
              action: "Clock In",
              time: occurredAt.toLocaleString(),
              distanceMeters: locationResult.distanceMeters,
              branchName: locationResult.branchName
            })
          }
        } catch (emailErr) {
          console.warn("Failed to send location failure notification emails for clock in:", emailErr)
        }
      })()
    }

    res.status(201).json(attendance)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const clockOut = async (
  req: AuthRequest & { body: ClockInPayload },
  res: Response
): Promise<void> => {
  try {
    const target = resolveEmployeeTarget(req)
    if (target.error || !target.id) {
      res.status(403).json({ message: target.error || "Unauthorized." })
      return
    }

    const employeeId: string = target.id

    const occurred = resolveOccurredAt(req.body?.occurredAt)
    if (occurred.error) {
      res.status(400).json({ code: "INVALID_OCCURRED_AT", message: occurred.error })
      return
    }
    const occurredAt = occurred.date

    if (occurred.provided) {
      const replay = await Attendance.findOne({
        where: { employeeId, clockOut: occurredAt }
      })
      if (replay) {
        res.status(200).json(replay)
        return
      }
    }

    const activeShift = await Attendance.findOne({
      where: { employeeId, clockOut: null },
      order: [["clockIn", "DESC"]]
    })

    if (!activeShift) {
      res.status(400).json({
        code: "NO_ACTIVE_SHIFT",
        message: "Active clock-in ekak natha. Clock out kala nohaka."
      })
      return
    }

    if (occurredAt.getTime() < new Date(activeShift.clockIn).getTime()) {
      res.status(400).json({
        code: "INVALID_OCCURRED_AT",
        message: "Clock-out time cannot be earlier than the clock-in time."
      })
      return
    }

    const { latitude, longitude, locationFailureReason } = req.body ?? {}
    if (hasInvalidFailureReason(locationFailureReason)) {
      res.status(400).json({
        message: "Location failure reason must be between 5 and 1000 characters."
      })
      return
    }

    const locationResult = await verifyAttendanceLocation(
      latitude,
      longitude,
      locationFailureReason
    )

    if (
      !locationResult.locationVerified &&
      !locationResult.failureReason &&
      !occurred.provided
    ) {
      res.status(422).json({
        code: "LOCATION_VERIFICATION_FAILED",
        message:
          locationResult.errorMessage ||
          "You are outside all branch locations. Enter a reason to continue and notify HR."
      })
      return
    }

    await Attendance.update(
      {
        clockOut: occurredAt,
        clockOutLatitude: locationResult.latitude,
        clockOutLongitude: locationResult.longitude,
        clockOutDistanceMeters: locationResult.distanceMeters,
        clockOutLocationVerified: locationResult.locationVerified,
        clockOutBranchId: locationResult.branchId,
        clockOutLocationFailureReason: locationResult.failureReason,
        clockOutLocationFailedAt: locationResult.failedAt
      },
      { where: { id: activeShift.id } }
    )

    const updatedShift = await Attendance.findOne({
      where: { id: activeShift.id }
    })

    if (!locationResult.locationVerified) {
      void (async () => {
        try {
          const emp = await Employee.findByPk(employeeId, {
            attributes: ["id", "fullName", "employeeCode", "email"]
          })
          if (!emp) return

          const admins = await Employee.findAll({
            where: {
              role: { [Op.in]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR] },
              status: AccountStatus.ACTIVE
            },
            attributes: ["email"]
          })
          const adminEmails = admins.map((a: any) => a.email).filter(Boolean)

          await notifyAdminsOfLocationFailure({
            adminEmails,
            employeeName: emp.fullName,
            employeeCode: emp.employeeCode,
            action: "Clock Out",
            time: occurredAt.toLocaleString(),
            distanceMeters: locationResult.distanceMeters,
            branchName: locationResult.branchName,
            reason: locationResult.failureReason
          })

          if (!locationResult.failureReason && emp.email) {
            await notifyEmployeeToFillReason({
              employeeEmail: emp.email,
              employeeName: emp.fullName,
              action: "Clock Out",
              time: occurredAt.toLocaleString(),
              distanceMeters: locationResult.distanceMeters,
              branchName: locationResult.branchName
            })
          }
        } catch (emailErr) {
          console.warn("Failed to send location failure notification emails for clock out:", emailErr)
        }
      })()
    }

    res.status(200).json(updatedShift)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const getMyAttendance = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const employeeId = req.user?.id

    if (!employeeId) {
      res.status(401).json({ message: "Unauthorized." })
      return
    }

    const TZ_OFFSET_MS = 5.5 * 60 * 60 * 1000
    const now = new Date()
    const lkTime = new Date(now.getTime() + TZ_OFFSET_MS)

    const year = lkTime.getUTCFullYear()
    const month = lkTime.getUTCMonth()

    const startOfMonthLK = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0))
    const endOfMonthLK = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))

    const startOfMonthUTC = new Date(startOfMonthLK.getTime() - TZ_OFFSET_MS)
    const endOfMonthUTC = new Date(endOfMonthLK.getTime() - TZ_OFFSET_MS)

    const logs = await Attendance.findAll({
      where: {
        employeeId,
        createdAt: {
          [Op.between]: [startOfMonthUTC, endOfMonthUTC]
        }
      },
      include: [
        { model: Branch, as: "branch", attributes: ["id", "name"] },
        { model: Branch, as: "clockOutBranch", attributes: ["id", "name"] }
      ],
      order: [["clockIn", "DESC"]]
    })

    const weeklyData: Record<string, any[]> = {}

    logs.forEach((log: any) => {
      const clockInUTC = new Date(log.clockIn)
      const logLkTime = new Date(clockInUTC.getTime() + TZ_OFFSET_MS)

      const date = logLkTime.getUTCDate()
      const firstDayOfMonth = new Date(Date.UTC(year, month, 1)).getUTCDay()

       const adjustedFirstDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1

      const weekNumber = Math.ceil((date + adjustedFirstDay) / 7)
      const weekKey = `Week ${weekNumber}`

      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = []
      }
      weeklyData[weekKey].push(log)
    })

    res.status(200).json(weeklyData)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const getAllAttendance = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const logs = await Attendance.findAll({
      include: [
        {
          model: Employee,
          as: "employee",
          attributes: ["fullName", "employeeCode"]
        },
        { model: Branch, as: "branch", attributes: ["id", "name"] },
        { model: Branch, as: "clockOutBranch", attributes: ["id", "name"] }
      ],
      order: [["clockIn", "DESC"]]
    })
    res.status(200).json(logs)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const getEmployeeAttendanceDetails = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { employeeId } = req.params
    const { startDate, endDate } = req.query

    let dateFilter: any = {}

    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          [Op.between]: [
            new Date(`${startDate}T00:00:00.000Z`),
            new Date(`${endDate}T23:59:59.999Z`)
          ]
        }
      }
    } else {
      const now = new Date()
      const dayOfWeek = now.getDay()
      const diffToMonday =
        now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)

      const monday = new Date(now.setDate(diffToMonday))
      monday.setHours(0, 0, 0, 0)

      const sunday = new Date(monday)
      sunday.setDate(monday.getDate() + 6)
      sunday.setHours(23, 59, 59, 999)

      dateFilter = {
        createdAt: {
          [Op.between]: [monday, sunday]
        }
      }
    }

    const attendanceRecords = await Attendance.findAll({
      where: {
        employeeId,
        ...dateFilter
      },
      include: [
        { model: Branch, as: "branch", attributes: ["id", "name"] },
        { model: Branch, as: "clockOutBranch", attributes: ["id", "name"] }
      ],
      order: [["createdAt", "DESC"]]
    })

    let totalCurrentWeekHours = 0
    attendanceRecords.forEach((att: any) => {
      if (att.clockIn && att.clockOut) {
        const inTime = new Date(att.clockIn).getTime()
        const outTime = new Date(att.clockOut).getTime()
        totalCurrentWeekHours += (outTime - inTime) / (1000 * 60 * 60)
      }
    })

    res.status(200).json({
      attendanceRecords,
      currentWeekHours: Number(totalCurrentWeekHours.toFixed(2))
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const getAllEmployeesAttendance = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { date } = req.query

    let whereClause: any = {}
    if (date) {
      const { startUTC, endUTC } = getDayBoundsUTC(date as string)

      whereClause.createdAt = {
        [Op.between]: [startUTC, endUTC]
      }
    }

    const attendanceRecords = await Attendance.findAll({
      where: whereClause,
      include: [
        {
          model: Employee,
          as: "employee",
          attributes: ["id", "employeeCode", "fullName", "email"]
        },
        { model: Branch, as: "branch", attributes: ["id", "name"] },
        { model: Branch, as: "clockOutBranch", attributes: ["id", "name"] }
      ],
      order: [["createdAt", "DESC"]]
    })

    res.status(200).json(attendanceRecords)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const getMyTodayAttendance = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const employeeId = req.user?.id
    if (!employeeId) {
      res.status(401).json({ message: "Unauthorized." })
      return
    }

   const todayDateStr = getCurrentLKDateString()
    const { startUTC, endUTC } = getDayBoundsUTC(todayDateStr)

    const todayRecord = await Attendance.findOne({
      where: {
        employeeId,
        createdAt: {
          [Op.between]: [startUTC, endUTC]
        }
      },
      include: [
        { model: Branch, as: "branch", attributes: ["id", "name"] },
        { model: Branch, as: "clockOutBranch", attributes: ["id", "name"] }
      ]
    })

    res.status(200).json(todayRecord)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}
export const submitLocationFailureReason = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params
    const { reason, type } = req.body // type: "IN" | "OUT"
    const employeeId = req.user?.id
    const userRole = req.user?.role

    if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
      res.status(400).json({ message: "Reason must be at least 5 characters." })
      return
    }

    const attendance = await Attendance.findByPk(id, {
      include: [{ model: Employee, as: "employee", attributes: ["id", "fullName", "employeeCode", "email"] }]
    })

    if (!attendance) {
      res.status(404).json({ message: "Attendance record not found." })
      return
    }

    const managementRoles = ["SUPER_ADMIN", "ADMIN", "HR"]
    if (attendance.employeeId !== employeeId && !managementRoles.includes(userRole || "")) {
      res.status(403).json({ message: "Forbidden." })
      return
    }

    const trimmedReason = reason.trim()
    const isClockOut = type === "OUT" || (!type && attendance.clockOut && !attendance.clockOutLocationFailureReason)

    if (isClockOut) {
      attendance.clockOutLocationFailureReason = trimmedReason
      if (!attendance.clockOutLocationFailedAt) {
        attendance.clockOutLocationFailedAt = new Date()
      }
    } else {
      attendance.clockInLocationFailureReason = trimmedReason
      if (!attendance.clockInLocationFailedAt) {
        attendance.clockInLocationFailedAt = new Date()
      }
    }

    await attendance.save()

    void (async () => {
      try {
        const admins = await Employee.findAll({
          where: {
            role: { [Op.in]: [UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HR] },
            status: AccountStatus.ACTIVE
          },
          attributes: ["email"]
        })
        const adminEmails = admins.map((a: any) => a.email).filter(Boolean)
        const emp = (attendance as any).employee
        if (emp) {
          await notifyAdminsReasonSubmitted({
            adminEmails,
            employeeName: emp.fullName,
            employeeCode: emp.employeeCode,
            action: isClockOut ? "Clock Out" : "Clock In",
            time: (isClockOut ? attendance.clockOut : attendance.clockIn)?.toLocaleString() || new Date().toLocaleString(),
            reason: trimmedReason
          })
        }
      } catch (notifyErr) {
        console.warn("Failed to notify admins of submitted reason:", notifyErr)
      }
    })()

    res.status(200).json(attendance)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const getLocationFailures = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const failures = await Attendance.findAll({
      where: {
        [Op.or]: [
          { locationVerified: false },
          { clockOutLocationVerified: false }
        ]
      },
      include: [
        {
          model: Employee,
          as: "employee",
          attributes: ["id", "fullName", "employeeCode", "email"]
        },
        { model: Branch, as: "branch", attributes: ["id", "name"] },
        { model: Branch, as: "clockOutBranch", attributes: ["id", "name"] }
      ],
      order: [["createdAt", "DESC"]],
      limit: 100
    })

    res.status(200).json(failures)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}
