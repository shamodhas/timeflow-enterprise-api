import dotenv from "dotenv"
dotenv.config()
import { Sequelize } from "sequelize"
import { getCurrentTenantContext } from "./tenantContext"

export const defaultDatabaseUrl =
  process.env.DATABASE_URL ||
  process.env.MASTER_DATABASE_URL ||
  "postgresql://postgres:postgres@localhost:5432/timeflow_dev"

const isLocalDefault =
  defaultDatabaseUrl.includes("localhost") ||
  defaultDatabaseUrl.includes("127.0.0.1")

export const baseSequelize = new Sequelize(defaultDatabaseUrl, {
  dialect: "postgres",
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  pool: {
    max: Number(process.env.TENANT_DB_POOL_MAX || 10),
    min: 1,
    acquire: 30000,
    idle: 20000
  },
  dialectOptions: {
    ssl: isLocalDefault
      ? false
      : {
          require: true,
          rejectUnauthorized: false
        }
  }
})

export const getActiveSequelize = (): Sequelize => {
  return getCurrentTenantContext()?.sequelize || baseSequelize
}

const boundQuery = baseSequelize.query.bind(baseSequelize)
const boundTransaction = baseSequelize.transaction.bind(baseSequelize)

baseSequelize.query = ((sql: any, options?: any) => {
  const active = getActiveSequelize()
  if (active !== baseSequelize) {
    return active.query(sql, options)
  }
  return boundQuery(sql, options)
}) as typeof baseSequelize.query

baseSequelize.transaction = ((options?: any, autoCallback?: any) => {
  const active = getActiveSequelize()
  if (active !== baseSequelize) {
    return active.transaction(options, autoCallback)
  }
  return boundTransaction(options, autoCallback)
}) as typeof baseSequelize.transaction

export const sequelize = baseSequelize
