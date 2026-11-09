import { DataTypes, Model, Optional } from "sequelize"
import { sequelize } from "../config/database"
import { AccountStatus, UserRole } from "../types/database.enums"
import {
  EmployeeAttributes,
  EmployeeCreationAttributes
} from "../types/database.types"

export class Employee
  extends Model<EmployeeAttributes, EmployeeCreationAttributes>
  implements EmployeeAttributes
{
  declare public id: string
  declare public employeeCode: string
  declare public departmentId: string | null
  declare public fullName: string
  declare public email: string
  declare public passwordHash: string
  declare public role: UserRole
  declare public status: AccountStatus
  declare public readonly createdAt: Date
  declare public readonly updatedAt: Date
}

Employee.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    employeeCode: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      field: "employee_code"
    },
    departmentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "department_id"
    },
    fullName: { type: DataTypes.STRING, allowNull: false, field: "full_name" },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "password_hash"
    },
    role: {
      type: DataTypes.ENUM(...Object.values(UserRole)),
      defaultValue: UserRole.EMPLOYEE
    },
    status: {
      type: DataTypes.ENUM(...Object.values(AccountStatus)),
      defaultValue: AccountStatus.PENDING
    }
  },
  {
    sequelize,
    tableName: "employees",
    timestamps: true,
    underscored: true
  }
)
