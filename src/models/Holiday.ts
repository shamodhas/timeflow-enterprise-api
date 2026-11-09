import { DataTypes, Model } from "sequelize"
import { sequelize } from "../config/database"

export class Holiday extends Model {
  declare public id: string
  declare public name: string
  declare public date: string
  declare public readonly createdAt: Date
  declare public readonly updatedAt: Date
}

Holiday.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: { type: DataTypes.STRING, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false, unique: true }
  },
  {
    sequelize,
    tableName: "holidays",
    timestamps: true,
    underscored: true
  }
)
