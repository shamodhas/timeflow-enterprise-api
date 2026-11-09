import dotenv from "dotenv"
dotenv.config()
import { DataTypes, Model, Optional, Sequelize } from "sequelize"
import { baseSequelize, defaultDatabaseUrl } from "./database"

const masterDbUrl =
  process.env.MASTER_DATABASE_URL ||
  process.env.DATABASE_URL ||
  defaultDatabaseUrl

export const masterSequelize: Sequelize =
  masterDbUrl === defaultDatabaseUrl
    ? baseSequelize
    : new Sequelize(masterDbUrl, {
        dialect: "postgres",
        logging: false,
        pool: {
          max: Number(process.env.MASTER_DB_POOL_MAX || 10),
          min: 1,
          acquire: 20000,
          idle: 30000
        },
        dialectOptions: {
          ssl:
            masterDbUrl.includes("localhost") ||
            masterDbUrl.includes("127.0.0.1")
              ? false
              : {
                  require: true,
                  rejectUnauthorized: false
                }
        }
      })

export type TenantPlan = "FREE_TRIAL" | "STARTER" | "PRO" | "ENTERPRISE"
export type TenantStatus = "ACTIVE" | "TRIAL" | "SUSPENDED"
export type TenantDbStrategy = "DEFAULT_HOST" | "DEDICATED_MANAGED" | "BYOD_CUSTOM"

export interface SaasTenantAttributes {
  id: string
  name: string
  slug: string
  domain: string | null
  logoUrl: string | null
  primaryColor: string
  plan: TenantPlan
  status: TenantStatus
  dbStrategy: TenantDbStrategy
  dbUrlEncrypted: string
  dbSslRequired: boolean
  maxEmployees: number
  maxBranches: number
  timezone: string
  ownerEmail: string
  createdAt?: Date
  updatedAt?: Date
}

export interface SaasTenantCreationAttributes
  extends Optional<
    SaasTenantAttributes,
    | "id"
    | "domain"
    | "logoUrl"
    | "primaryColor"
    | "plan"
    | "status"
    | "dbStrategy"
    | "dbSslRequired"
    | "maxEmployees"
    | "maxBranches"
    | "timezone"
  > {}

export class SaasTenant
  extends Model<SaasTenantAttributes, SaasTenantCreationAttributes>
  implements SaasTenantAttributes
{
  declare public id: string
  declare public name: string
  declare public slug: string
  declare public domain: string | null
  declare public logoUrl: string | null
  declare public primaryColor: string
  declare public plan: TenantPlan
  declare public status: TenantStatus
  declare public dbStrategy: TenantDbStrategy
  declare public dbUrlEncrypted: string
  declare public dbSslRequired: boolean
  declare public maxEmployees: number
  declare public maxBranches: number
  declare public timezone: string
  declare public ownerEmail: string
  declare public readonly createdAt: Date
  declare public readonly updatedAt: Date
}

SaasTenant.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    domain: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true
    },
    logoUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "logo_url"
    },
    primaryColor: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "#2563eb",
      field: "primary_color"
    },
    plan: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "ENTERPRISE"
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "ACTIVE"
    },
    dbStrategy: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "DEDICATED_MANAGED",
      field: "db_strategy"
    },
    dbUrlEncrypted: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "db_url_encrypted"
    },
    dbSslRequired: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: "db_ssl_required"
    },
    maxEmployees: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 250,
      field: "max_employees"
    },
    maxBranches: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 25,
      field: "max_branches"
    },
    timezone: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "Asia/Colombo"
    },
    ownerEmail: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "owner_email"
    }
  },
  {
    sequelize: masterSequelize,
    tableName: "saas_tenants",
    timestamps: true,
    underscored: true
  }
)

export interface SaasTenantUserLookupAttributes {
  id: string
  email: string
  tenantId: string
  tenantSlug: string
  role: string
  createdAt?: Date
  updatedAt?: Date
}

export class SaasTenantUserLookup
  extends Model<
    SaasTenantUserLookupAttributes,
    Optional<SaasTenantUserLookupAttributes, "id">
  >
  implements SaasTenantUserLookupAttributes
{
  declare public id: string
  declare public email: string
  declare public tenantId: string
  declare public tenantSlug: string
  declare public role: string
  declare public readonly createdAt: Date
  declare public readonly updatedAt: Date
}

SaasTenantUserLookup.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false
    },
    tenantId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "tenant_id"
    },
    tenantSlug: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "tenant_slug"
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "EMPLOYEE"
    }
  },
  {
    sequelize: masterSequelize,
    tableName: "saas_tenant_users",
    timestamps: true,
    underscored: true,
    indexes: [
      {
        unique: true,
        fields: ["email", "tenant_id"]
      },
      {
        fields: ["email"]
      }
    ]
  }
)
