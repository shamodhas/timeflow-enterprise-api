import { Request, Response } from "express"
import { parse } from "json2csv"
import { Attendance, Employee } from "../models"
import { Op } from "sequelize"
import type { AttendanceAttributes, EmployeeAttributes } from "../types/database.types"

export const exportAttendanceCSV = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { month } = req.query // Format: YYYY-MM

    let whereClause = {}
    if (month && typeof month === "string") {
      const startDate = new Date(`${month}-01`)
      const endDate = new Date(
        startDate.getFullYear(),
        startDate.getMonth() + 1,
        0
      )
      whereClause = { clockIn: { [Op.between]: [startDate, endDate] } }
    }

    const records = await Attendance.findAll({
      where: whereClause,
      include: [
        {
          model: Employee,
          as: "employee",
          attributes: ["employeeCode", "fullName"]
        }
      ]
    })

    if (records.length === 0) {
      res.status(404).json({ message: "No records found for the given period" })
      return
    }

    const flatRecords = records.map((attendance) => {
      const record = attendance.toJSON() as AttendanceAttributes & {
        employee?: Pick<EmployeeAttributes, "employeeCode" | "fullName">
      }
      const emp = record.employee
      const cIn = record.clockIn
      const cOut = record.clockOut

      return {
        Employee_Code: emp?.employeeCode,
        Name: emp?.fullName,
        Date: new Date(cIn).toISOString().split("T")[0],
        Clock_In: new Date(cIn).toLocaleTimeString(),
        Clock_Out: cOut ? new Date(cOut).toLocaleTimeString() : "N/A",
        Status: record.status
      }
    })

    const csv = parse(flatRecords)

    res.header("Content-Type", "text/csv")
    res.attachment(`Attendance_Report_${month || "All"}.csv`)
    res.send(csv)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}
