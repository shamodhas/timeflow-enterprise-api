import { Response } from "express"
import {
  Employee,
  Attendance,
  LeaveType,
  LeaveRequest,
  LeaveLedger
} from "../models"
import { AuthRequest } from "../middlewares/authenticate"
import { hashPassword } from "../utils/password"

export const importEmployees = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { employees } = req.body
    if (!Array.isArray(employees) || employees.length === 0) {
      res.status(400).json({
        message: "Invalid data format. Expected an array of employees."
      })
      return
    }

    const createdEmployees = []
    for (const emp of employees) {
      const hashedPassword = await hashPassword(
        emp.password || "Default@123"
      )
      const newEmp = await Employee.create({
        employeeCode: emp.employeeCode,
        fullName: emp.fullName,
        email: emp.email,
        passwordHash: hashedPassword,
        role: emp.role || "EMPLOYEE",
        departmentId: emp.departmentId || null
      })
      createdEmployees.push(newEmp)
    }

    res.status(201).json({
      message: `Successfully imported ${createdEmployees.length} employees.`
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const importAttendance = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { attendanceLogs } = req.body

    if (!Array.isArray(attendanceLogs) || attendanceLogs.length === 0) {
      res.status(400).json({ message: "Invalid data format." })
      return
    }

    let importedCount = 0
    for (const log of attendanceLogs) {
      const employee: any = await Employee.findOne({
        where: { employeeCode: log.employeeCode }
      })
      if (employee) {
        await Attendance.create({
          employeeId: employee.id,
          clockIn: new Date(log.clockIn),
          clockOut: log.clockOut ? new Date(log.clockOut) : null,
          status: log.status || "PRESENT"
        })
        importedCount++
      }
    }

    res.status(201).json({
      message: `Successfully imported ${importedCount} attendance records.`
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const importLeaves = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { leaveRecords } = req.body
    if (!Array.isArray(leaveRecords) || leaveRecords.length === 0) {
      res.status(400).json({ message: "Invalid data format." })
      return
    }

    let importedCount = 0
    for (const rec of leaveRecords) {
      const employee: any = await Employee.findOne({
        where: { employeeCode: rec.employeeCode }
      })
      const leaveType: any = await LeaveType.findOne({
        where: { name: rec.leaveTypeName }
      })

      if (employee && leaveType) {
        const leaveReq: any = await LeaveRequest.create({
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          startDate: rec.startDate,
          endDate: rec.endDate,
          totalDays: parseFloat(rec.totalDays),
          session: "FULL" as any,
          reason: rec.reason || "Legacy Data Import",
          status: rec.status || "APPROVED"
        })

        const reqStatus = leaveReq.status
        const reqId = leaveReq.id

        if (reqStatus === "APPROVED") {
          await LeaveLedger.create({
            employeeId: employee.id,
            leaveTypeId: leaveType.id,
            amount: parseFloat(rec.totalDays),
            transactionType: "DEDUCTION" as any,
            referenceId: reqId
          })
        }
        importedCount++
      }
    }

    res.status(201).json({
      message: `Successfully imported ${importedCount} leave records.`
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}
