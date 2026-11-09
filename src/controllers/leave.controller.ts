import { Response } from "express"
import { LeaveRequest, LeaveLedger, LeaveType, Employee } from "../models"
import { sequelize } from "../config/database"
import { AuthRequest } from "../middlewares/authenticate"
import { TransactionType } from "../types/database.enums"
import { Holiday } from "../models/Holiday"
import { Op } from "sequelize"

const getTotalBalance = async (employeeId: string): Promise<number> => {
  const rows: any[] = await sequelize.query(
    `SELECT COALESCE(SUM(CASE WHEN transaction_type = 'ACCRUAL' THEN amount ELSE 0 END), 0) -
            COALESCE(SUM(CASE WHEN transaction_type = 'DEDUCTION' THEN amount ELSE 0 END), 0) AS balance
     FROM leave_ledger WHERE employee_id = :employeeId`,
    { replacements: { employeeId }, type: "SELECT" }
  )
  return Number(rows[0]?.balance ?? 0)
}

export const requestLeave = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const {
      leaveTypeId,
      startDate,
      endDate,
      session,
      reason,
      actingEmployeeId
    } = req.body
    const employeeId = req.user?.id as string

    if (endDate < startDate) {
      res.status(400).json({ message: "End date cannot be before start date." })
      return
    }
    if (session !== "FULL" && startDate !== endDate) {
      res.status(400).json({
        message: "Short and half-day leave must be for a single date."
      })
      return
    }
    // Short leave = 0.25 day, half day = 0.5 day; full-day count comes from the request
    const totalDays =
      session === "SHORT" ? 0.25 : session === "FULL" ? req.body.totalDays : 0.5
    if (!(totalDays > 0)) {
      res.status(400).json({ message: "Total days is required." })
      return
    }
    const holidayCount = await Holiday.count({
      where: { date: { [Op.between]: [startDate, endDate] } }
    })
    const spanDays =
      (Date.parse(endDate) - Date.parse(startDate)) / 86400000 + 1 - holidayCount
    if (spanDays <= 0) {
      res.status(400).json({
        message: "Selected dates are holidays (non-working days)."
      })
      return
    }
    if (totalDays > spanDays) {
      res.status(400).json({
        message: `Total days exceeds the working days in the selected range (${spanDays}).`
      })
      return
    }

    const leaveType = await LeaveType.findByPk(leaveTypeId)
    if (!leaveType) {
      res.status(400).json({ message: "Invalid leave type." })
      return
    }

    if (actingEmployeeId) {
      if (actingEmployeeId === employeeId) {
        res
          .status(400)
          .json({ message: "You cannot select yourself as acting person." })
        return
      }
      const acting = await Employee.findOne({
        where: { id: actingEmployeeId, status: "ACTIVE" as any }
      })
      if (!acting) {
        res.status(400).json({ message: "Invalid acting employee." })
        return
      }
    }

    const balance = await getTotalBalance(employeeId)
    const pending: any[] = await sequelize.query(
      `SELECT COALESCE(SUM(total_days), 0) AS days FROM leave_requests
       WHERE employee_id = :employeeId AND status = 'PENDING'`,
      { replacements: { employeeId }, type: "SELECT" }
    )
    if (Number(totalDays) + Number(pending[0]?.days ?? 0) > balance) {
      res.status(400).json({
        message: `Insufficient leave balance (available: ${balance}).`
      })
      return
    }

    const request = await LeaveRequest.create({
      employeeId,
      leaveTypeId,
      startDate,
      endDate,
      totalDays,
      session,
      reason,
      actingEmployeeId: actingEmployeeId ?? null
    } as any)
    res.status(201).json(request)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const getMyLeaveRequests = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const requests = await LeaveRequest.findAll({
      where: { employeeId: req.user?.id as string },
      include: [
        { model: LeaveType, as: "leaveType", attributes: ["name"] },
        { model: Employee, as: "actingEmployee", attributes: ["fullName"] }
      ],
      order: [["createdAt", "DESC"]]
    })
    res.status(200).json(requests)
  } catch (error: any) {
    console.error(error)
    res.status(500).json({ error: error.message })
  }
}

export const getActingCandidates = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const employees = await Employee.findAll({
      where: { status: "ACTIVE" as any },
      attributes: ["id", "fullName", "employeeCode"],
      order: [["fullName", "ASC"]]
    })
    res.status(200).json(employees.filter((e: any) => e.id !== req.user?.id))
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}
export const approveLeave = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const transaction = await sequelize.transaction()
  try {
    const { id } = req.params
    const { status } = req.body

    const leaveReq: any = await LeaveRequest.findByPk(id)
    const currentStatus = leaveReq?.status
    if (!leaveReq || currentStatus !== "PENDING") {
      res
        .status(400)
        .json({ message: "Invalid or already processed leave request" })
      return
    }

    await LeaveRequest.update(
      {
        status,
        approvedBy: req.user?.id as string
      },
      { where: { id }, transaction }
    )

    if (status === "APPROVED") {
      const empId = leaveReq.employeeId
      const lTypeId = leaveReq.leaveTypeId
      const tDays = leaveReq.totalDays

      await LeaveLedger.create(
        {
          employeeId: empId,
          leaveTypeId: lTypeId,
          transactionType: TransactionType.DEDUCTION,
          amount: tDays,
          referenceId: leaveReq.id
        },
        { transaction }
      )
    }

    await transaction.commit()
    const updatedLeaveReq = await LeaveRequest.findByPk(id)
    res.status(200).json({
      message: `Leave ${status} successfully`,
      leaveReq: updatedLeaveReq
    })
  } catch (error: any) {
    await transaction.rollback()
    res.status(500).json({ error: error.message })
  }
}

export const getLeaveBalance = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const employeeId = req.user?.id
    const totalBalance = await getTotalBalance(employeeId as string)
    const taken = await sequelize.query(
      `SELECT lt.id AS "leaveTypeId", lt.name AS "leaveType",
              COALESCE(SUM(lr.total_days), 0) AS taken
       FROM leave_types lt
       LEFT JOIN leave_requests lr ON lr.leave_type_id = lt.id
         AND lr.employee_id = :employeeId AND lr.status = 'APPROVED'
       GROUP BY lt.id, lt.name ORDER BY lt.name`,
      { replacements: { employeeId }, type: "SELECT" }
    )
    res.status(200).json({ totalBalance, taken })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const getAllLeaveRequests = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const requests = await LeaveRequest.findAll({
      include: [
        {
          model: Employee,
          as: "employee",
          attributes: ["fullName", "employeeCode"]
        },
        { model: LeaveType, as: "leaveType", attributes: ["name"] },
        { model: Employee, as: "actingEmployee", attributes: ["fullName"] }
      ],
      order: [["createdAt", "DESC"]]
    })
    res.status(200).json(requests)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const getEmployeeLeaveDetails = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { employeeId } = req.params

    const totalBalance = await getTotalBalance(employeeId)
    const balances = await sequelize.query(
      `SELECT lt.id AS "leaveTypeId", lt.name AS "leaveType",
              COALESCE(SUM(lr.total_days), 0) AS balance
       FROM leave_types lt
       LEFT JOIN leave_requests lr ON lr.leave_type_id = lt.id
         AND lr.employee_id = :employeeId AND lr.status = 'APPROVED'
       GROUP BY lt.id, lt.name ORDER BY lt.name`,
      { replacements: { employeeId }, type: "SELECT" }
    )

    const requests = await LeaveRequest.findAll({
      where: { employeeId },
      include: [{ model: LeaveType, as: "leaveType", attributes: ["name"] }],
      order: [["createdAt", "DESC"]]
    })

    const employee = await Employee.findByPk(employeeId, {
      attributes: ["id", "employeeCode", "fullName", "email", "role"]
    })

    res.status(200).json({ employee, balances, totalBalance, requests })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const getLeaveTypes = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const leaveTypes = await LeaveType.findAll({
      attributes: ["id", "name", "defaultQuota"]
    })
    res.status(200).json(leaveTypes)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const createLeaveType = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const name = String(req.body.name || "").trim()
    const defaultQuota = Number(req.body.defaultQuota ?? 0)
    if (!name || !(defaultQuota >= 0)) {
      res
        .status(400)
        .json({ message: "Name and a valid default quota are required." })
      return
    }
    const existing = await LeaveType.findOne({ where: { name } })
    if (existing) {
      res.status(400).json({ message: "Leave type already exists." })
      return
    }
    const leaveType = await LeaveType.create({ name, defaultQuota })
    res.status(201).json(leaveType)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

export const adjustEmployeeLeaveBalance = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { employeeId } = req.params
    const { leaveTypeId, amount, adjustmentType } = req.body

    const numAmount = Number(amount)
    if (!leaveTypeId || !(numAmount > 0) || !adjustmentType) {
      res.status(400).json({ message: "Missing required fields." })
      return
    }

    const transactionType =
      adjustmentType === "ADD"
        ? TransactionType.ACCRUAL
        : TransactionType.DEDUCTION

    await LeaveLedger.create({
      employeeId,
      leaveTypeId,
      amount: numAmount,
      transactionType
    })

    res.status(200).json({ message: "Leave balance adjusted successfully." })
  } catch (error: any) {
    res.status(500).json({ message: error.message, error: error.message })
  }
}
