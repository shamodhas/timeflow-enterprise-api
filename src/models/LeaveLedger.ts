import { DataTypes, Model } from "sequelize"
import { sequelize } from "../config/database"
import type {
  LeaveLedgerAttributes,
  LeaveLedgerCreationAttributes
} from "../types/database.types"
import { TransactionType } from "../types/database.enums"

export class LeaveLedger
  extends Model<LeaveLedgerAttributes, LeaveLedgerCreationAttributes>
  implements LeaveLedgerAttributes
{
  declare public id: string
  declare public employeeId: string
  declare public leaveTypeId: string
  declare public transactionType: TransactionType
  declare public amount: number
  declare public referenceId: string | null
  declare public transactionDate: Date
  declare public readonly createdAt: Date
  declare public readonly updatedAt: Date
}

LeaveLedger.init(
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
    transactionType: {
      type: DataTypes.ENUM(...Object.values(TransactionType)),
      allowNull: false,
      field: "transaction_type"
    },
    amount: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    referenceId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: "reference_id"
    },
    transactionDate: {
      type: DataTypes.DATEONLY,
      defaultValue: DataTypes.NOW,
      field: "transaction_date"
    }
  },
  {
    sequelize,
    tableName: "leave_ledger",
    timestamps: true,
    underscored: true
  }
)
