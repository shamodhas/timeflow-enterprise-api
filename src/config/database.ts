import dotenv from "dotenv"
dotenv.config()
import { Sequelize } from "sequelize"

const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.MASTER_DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/timeflow_dev"

export const sequelize = new Sequelize(databaseUrl, {
  dialect: "postgres",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  pool: {
    max: 5,
    min: 0,
    acquire: 30000,
    idle: 10000
  },
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
})
