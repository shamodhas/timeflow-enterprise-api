import { DataTypes, Model } from "sequelize"
import { sequelize } from "../config/database"
import type {
  AttendanceAttributes,
  AttendanceCreationAttributes
} from "../types/database.types"
import { AttendanceStatus } from "../types/database.enums"

export class Attendance
  extends Model<AttendanceAttributes, AttendanceCreationAttributes>
  implements AttendanceAttributes
{
  declare public id: string
  declare public employeeId: string
  declare public clockIn: Date
  declare public clockOut: Date | null
  declare public status: AttendanceStatus
  declare public latitude: number | null
  declare public longitude: number | null
  declare public distanceMeters: number | null
  declare public locationVerified: boolean | null
  declare public branchId: string | null
  declare public clockOutLatitude: number | null
  declare public clockOutLongitude: number | null
  declare public clockOutDistanceMeters: number | null
  declare public clockOutLocationVerified: boolean | null
  declare public clockOutBranchId: string | null
  declare public clockInLocationFailureReason: string | null
  declare public clockInLocationFailedAt: Date | null
  declare public clockOutLocationFailureReason: string | null
  declare public clockOutLocationFailedAt: Date | null
  declare public readonly createdAt: Date
  declare public readonly updatedAt: Date
}

Attendance.init(
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
    clockIn: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "clock_in"
    },
    clockOut: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "clock_out"
    },
    status: {
      type: DataTypes.ENUM(...Object.values(AttendanceStatus)),
      allowNull: false,
      defaultValue: AttendanceStatus.PRESENT,
      field: "status"
    },
    latitude: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "latitude"
    },
    longitude: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "longitude"
    },
    distanceMeters: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "distance_meters"
    },
    locationVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: "location_verified"
    },
    branchId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "branch_id"
    },
    clockOutLatitude: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "clock_out_latitude"
    },
    clockOutLongitude: {
      type: DataTypes.DOUBLE,
      allowNull: true,
      field: "clock_out_longitude"
    },
    clockOutDistanceMeters: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "clock_out_distance_meters"
    },
    clockOutLocationVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
      field: "clock_out_location_verified"
    },
    clockOutBranchId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "clock_out_branch_id"
    },
    clockInLocationFailureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "clock_in_location_failure_reason"
    },
    clockInLocationFailedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "clock_in_location_failed_at"
    },
    clockOutLocationFailureReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "clock_out_location_failure_reason"
    },
    clockOutLocationFailedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "clock_out_location_failed_at"
    },
  },
  {
    sequelize,
    tableName: "attendance_logs",
    timestamps: true,
    underscored: true
  }
)
