import { DataTypes, Model } from "sequelize"
import { sequelize } from "../config/database"
import type {
  LeaveTypeAttributes,
  LeaveTypeCreationAttributes
} from "../types/database.types"

export class LeaveType
  extends Model<LeaveTypeAttributes, LeaveTypeCreationAttributes>
  implements LeaveTypeAttributes
{
  declare public id: string
  declare public name: string
  declare public defaultQuota: number
  declare public readonly createdAt: Date
  declare public readonly updatedAt: Date
}

LeaveType.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    defaultQuota: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: false,
      field: "default_quota"
    }
  },
  {
    sequelize,
    tableName: "leave_types",
    timestamps: true,
    underscored: true
  }
)
