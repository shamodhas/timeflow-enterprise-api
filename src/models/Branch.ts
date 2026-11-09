import { DataTypes, Model } from "sequelize"
import { sequelize } from "../config/database"
import type {
  BranchAttributes,
  BranchCreationAttributes
} from "../types/database.types"

export class Branch
  extends Model<BranchAttributes, BranchCreationAttributes>
  implements BranchAttributes
{
  declare public id: string
  declare public name: string
  declare public latitude: number
  declare public longitude: number
  declare public radiusMeters: number
  declare public isActive: boolean
  declare public readonly createdAt?: Date
  declare public readonly updatedAt?: Date
}

Branch.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: { type: DataTypes.STRING, allowNull: false, unique: true },
    latitude: { type: DataTypes.DOUBLE, allowNull: false },
    longitude: { type: DataTypes.DOUBLE, allowNull: false },
    radiusMeters: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 500,
      field: "radius_meters"
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "is_active"
    }
  },
  {
    sequelize,
    tableName: "branches",
    timestamps: true,
    underscored: true
  }
)
