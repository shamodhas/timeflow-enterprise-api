import { Response } from "express"
import { Attendance, LeaveRequest, LeaveLedger, LeaveType, Employee } from "../models"
import { Op } from "sequelize"
import { AuthRequest } from "../middlewares/authenticate"
import { TransactionType } from "../types/database.enums"
import { getCurrentLKDateString, getDayBoundsUTC } from "../utils/time"
import { cacheService } from "../services/cache.service"
import { getCurrentTenantId } from "../config/tenantContext"

// Company Overview Stats (Admin & HR) - Cached for 30s with instant invalidation on mutations
export const getDashboardStats = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const tenantId = getCurrentTenantId()
    const todayDateStr = getCurrentLKDateString()

    const stats = await cacheService.getOrSet(
      `tenant:${tenantId}:dashboard:overview:${todayDateStr}`,
      30,
      async () => {
        const { startUTC, endUTC } = getDayBoundsUTC(todayDateStr)

        const [presentTodayCount, pendingCount, onLeaveCount, totalEmployees] =
          await Promise.all([
            Attendance.count({
              where: { createdAt: { [Op.between]: [startUTC, endUTC] } }
            }),
            LeaveRequest.count({ where: { status: "PENDING" } }),
            LeaveRequest.count({
              where: {
                status: "APPROVED",
                startDate: { [Op.lte]: todayDateStr },
                endDate: { [Op.gte]: todayDateStr }
              }
            }),
            Employee.count()
          ])

        return {
          presentToday: presentTodayCount,
          onLeave: onLeaveCount,
          pendingApprovals: pendingCount,
          totalEmployees
        }
      }
    )

    res.status(200).json(stats)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

// Personal Overview Stats (Employee & HR)
export const getMyDashboardStats = async (
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

    const [thisMonthPresent, pendingPersonalLeaves, leaveLedgers] = await Promise.all([
      Attendance.count({
        where: {
          employeeId,
          createdAt: { [Op.between]: [startOfMonthUTC, endOfMonthUTC] }
        }
      }),
      LeaveRequest.count({
        where: { employeeId, status: "PENDING" }
      }),
      LeaveLedger.findAll({ where: { employeeId } })
    ])
    const [leaveTypes, approvedRequests] = await Promise.all([
      LeaveType.findAll({ order: [["name", "ASC"]] }),
      LeaveRequest.findAll({ where: { employeeId, status: "APPROVED" } })
    ])

    let availableLeaves = 0
    let usedLeaves = 0

    const byType = new Map<string, any>()
    leaveTypes.forEach((type: any) => {
      byType.set(type.id, {
        leaveTypeId: type.id,
        name: type.name,
        available: 0,
        used: 0,
        full: 0,
        short: 0,
        half: 0
      })
    })

    leaveLedgers.forEach((ledger: any) => {
      const amount = Number(ledger.amount)
      const entry = byType.get(ledger.leaveTypeId)
      if (ledger.transactionType === TransactionType.ACCRUAL) {
        availableLeaves += amount
        if (entry) entry.available += amount
      } else if (ledger.transactionType === TransactionType.DEDUCTION) {
        availableLeaves -= amount
        usedLeaves += amount
        if (entry) {
          entry.available -= amount
          entry.used += amount
        }
      }
    })

    approvedRequests.forEach((request: any) => {
      const entry = byType.get(request.leaveTypeId)
      if (!entry) return
      if (request.session === "SHORT") entry.short += 1
      else if (request.session === "FULL") entry.full += 1
      else entry.half += 1
    })

    res.status(200).json({
      availableLeaves,
      usedLeaves,
      leaveByType: Array.from(byType.values()),
      thisMonthPresent,
      pendingPersonalLeaves
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}
