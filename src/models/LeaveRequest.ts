import { DataTypes, Model } from "sequelize"
import { sequelize } from "../config/database"
import type {
  LeaveRequestAttributes,
  LeaveRequestCreationAttributes
} from "../types/database.types"
import { LeaveSession, LeaveStatus } from "../types/database.enums"

export class LeaveRequest
  extends Model<LeaveRequestAttributes, LeaveRequestCreationAttributes>
  implements LeaveRequestAttributes
{
  declare public id: string
  declare public employeeId: string
  declare public leaveTypeId: string
  declare public startDate: Date
  declare public endDate: Date
  declare public totalDays: number
  declare public session: LeaveSession
  declare public reason: string
  declare public status: LeaveStatus
  declare public approvedBy: string | null
  declare public actingEmployeeId: string | null
  declare public readonly createdAt: Date
  declare public readonly updatedAt: Date
}

LeaveRequest.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    employeeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "employee_id"
    },
    leaveTypeId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "leave_type_id"
    },
    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      field: "start_date"
    },
    endDate: { type: DataTypes.DATEONLY, allowNull: false, field: "end_date" },
    totalDays: {
      type: DataTypes.DECIMAL(4, 1),
      allowNull: false,
      field: "total_days"
    },
    session: {
      type: DataTypes.ENUM(...Object.values(LeaveSession)),
      defaultValue: LeaveSession.FULL
    },
    reason: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM(...Object.values(LeaveStatus)),
      defaultValue: LeaveStatus.PENDING
    },
    approvedBy: { type: DataTypes.UUID, allowNull: true, field: "approved_by" },
    actingEmployeeId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "acting_employee_id"
    }
  },
  {
    sequelize,
    tableName: "leave_requests",
    timestamps: true,
    underscored: true
  }
)
