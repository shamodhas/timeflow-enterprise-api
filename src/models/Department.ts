import { DataTypes, Model } from "sequelize"
import { sequelize } from "../config/database"
import type {
  DepartmentAttributes,
  DepartmentCreationAttributes
} from "../types/database.types"

export class Department
  extends Model<DepartmentAttributes, DepartmentCreationAttributes>
  implements DepartmentAttributes
{
  declare public id: string
  declare public name: string
  declare public readonly createdAt: Date
  declare public readonly updatedAt: Date
}

Department.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: { type: DataTypes.STRING, allowNull: false, unique: true }
  },
  {
    sequelize,
    tableName: "departments",
    timestamps: true,
    underscored: true
  }
)
