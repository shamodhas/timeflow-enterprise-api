import { Sequelize } from "sequelize"
import {
  masterSequelize,
  SaasTenant,
  SaasTenantUserLookup,
  type TenantDbStrategy,
  type TenantPlan
} from "../config/masterDatabase"
import { baseSequelize, defaultDatabaseUrl } from "../config/database"
import { tenantPoolManager } from "../config/tenantPoolManager"
import { runWithTenantContext } from "../config/tenantContext"
import { encryptConnectionUrl, maskConnectionUrl } from "../utils/crypto.utils"
import { Department, Employee, LeaveLedger, LeaveType } from "../models"
import { AccountStatus, TransactionType, UserRole } from "../types/database.enums"
import { hashPassword } from "../utils/password"
import { cacheService } from "./cache.service"

export interface TestDbConnectionResult {
  connected: boolean
  latencyMs: number
  serverVersion?: string
  maskedUrl: string
  error?: string
}

export interface OnboardTenantInput {
  name: string
  slug: string
  domain?: string | null
  logoUrl?: string | null
  primaryColor?: string
  plan?: TenantPlan
  dbStrategy?: TenantDbStrategy
  customDatabaseUrl?: string
  dbSslRequired?: boolean
  maxEmployees?: number
  maxBranches?: number
  timezone?: string
  adminFullName: string
  adminEmail: string
  adminPassword: string
  adminEmployeeCode?: string
}

/**
 * Ensures all 8 core tables, enums, and high-speed indexes exist on a newly
 * connected or BYOD client PostgreSQL database.
 */
export const provisionTenantDatabaseSchema = async (
  targetSequelize: Sequelize
): Promise<void> => {
  await targetSequelize.query(`
    DO $$ BEGIN
      CREATE TYPE "enum_employees_role" AS ENUM ('EMPLOYEE', 'HR', 'ADMIN', 'SUPER_ADMIN');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE "enum_employees_status" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE "enum_attendance_logs_status" AS ENUM ('PRESENT', 'ABSENT', 'HALF_DAY');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE "enum_leave_requests_session" AS ENUM ('FULL', 'SHORT', 'MORNING', 'AFTERNOON');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE "enum_leave_requests_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE "enum_leave_ledger_transaction_type" AS ENUM ('ACCRUAL', 'DEDUCTION', 'ADJUSTMENT');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "departments" (
      "id" UUID PRIMARY KEY,
      "name" VARCHAR(255) NOT NULL UNIQUE,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "employees" (
      "id" UUID PRIMARY KEY,
      "employee_code" VARCHAR(255) NOT NULL UNIQUE,
      "department_id" UUID REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      "full_name" VARCHAR(255) NOT NULL,
      "email" VARCHAR(255) NOT NULL UNIQUE,
      "password_hash" VARCHAR(255) NOT NULL,
      "role" "enum_employees_role" DEFAULT 'EMPLOYEE',
      "status" "enum_employees_status" DEFAULT 'PENDING',
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "branches" (
      "id" UUID PRIMARY KEY,
      "name" VARCHAR(255) NOT NULL UNIQUE,
      "latitude" DOUBLE PRECISION NOT NULL,
      "longitude" DOUBLE PRECISION NOT NULL,
      "radius_meters" INTEGER NOT NULL DEFAULT 500,
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "attendance_logs" (
      "id" UUID PRIMARY KEY,
      "employee_id" UUID NOT NULL REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "clock_in" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "clock_out" TIMESTAMPTZ,
      "status" "enum_attendance_logs_status" NOT NULL DEFAULT 'PRESENT',
      "latitude" DOUBLE PRECISION,
      "longitude" DOUBLE PRECISION,
      "distance_meters" INTEGER,
      "location_verified" BOOLEAN,
      "branch_id" UUID REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      "clock_out_latitude" DOUBLE PRECISION,
      "clock_out_longitude" DOUBLE PRECISION,
      "clock_out_distance_meters" INTEGER,
      "clock_out_location_verified" BOOLEAN,
      "clock_out_branch_id" UUID REFERENCES "branches" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      "clock_in_location_failure_reason" TEXT,
      "clock_in_location_failed_at" TIMESTAMPTZ,
      "clock_out_location_failure_reason" TEXT,
      "clock_out_location_failed_at" TIMESTAMPTZ,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "leave_types" (
      "id" UUID PRIMARY KEY,
      "name" VARCHAR(255) NOT NULL UNIQUE,
      "default_quota" DECIMAL(5, 2) NOT NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "leave_requests" (
      "id" UUID PRIMARY KEY,
      "employee_id" UUID NOT NULL REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "leave_type_id" UUID NOT NULL REFERENCES "leave_types" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "start_date" DATE NOT NULL,
      "end_date" DATE NOT NULL,
      "total_days" DECIMAL(4, 1) NOT NULL,
      "session" "enum_leave_requests_session" DEFAULT 'FULL',
      "reason" TEXT,
      "status" "enum_leave_requests_status" DEFAULT 'PENDING',
      "approved_by" UUID,
      "acting_employee_id" UUID REFERENCES "employees" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "leave_ledger" (
      "id" UUID PRIMARY KEY,
      "employee_id" UUID NOT NULL REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "leave_type_id" UUID NOT NULL REFERENCES "leave_types" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "transaction_type" "enum_leave_ledger_transaction_type" NOT NULL,
      "amount" DECIMAL(5, 2) NOT NULL,
      "reference_id" UUID,
      "transaction_date" DATE DEFAULT CURRENT_DATE,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "holidays" (
      "id" UUID PRIMARY KEY,
      "name" VARCHAR(255) NOT NULL,
      "date" DATE NOT NULL UNIQUE,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- High-Performance B-Tree Indexes for sub-millisecond queries
    CREATE INDEX IF NOT EXISTS "idx_attendance_emp_clockin" ON "attendance_logs" ("employee_id", "clock_in" DESC);
    CREATE INDEX IF NOT EXISTS "idx_attendance_created_at" ON "attendance_logs" ("created_at" DESC);
    CREATE INDEX IF NOT EXISTS "idx_leave_requests_emp_status" ON "leave_requests" ("employee_id", "status");
    CREATE INDEX IF NOT EXISTS "idx_leave_ledger_emp_type" ON "leave_ledger" ("employee_id", "leave_type_id");
    CREATE INDEX IF NOT EXISTS "idx_employees_status_role" ON "employees" ("status", "role");
  `)
}

export const testDatabaseConnection = async (
  rawDbUrl: string,
  sslRequired = true
): Promise<TestDbConnectionResult> => {
  const maskedUrl = maskConnectionUrl(rawDbUrl)
  const start = Date.now()
  const isLocal = rawDbUrl.includes("localhost") || rawDbUrl.includes("127.0.0.1")

  const tempSequelize = new Sequelize(rawDbUrl, {
    dialect: "postgres",
    logging: false,
    pool: { max: 1, min: 0, acquire: 10000, idle: 2000 },
    dialectOptions: {
      ssl:
        !sslRequired || isLocal
          ? false
          : {
              require: true,
              rejectUnauthorized: false
            }
    }
  })

  try {
    await tempSequelize.authenticate()
    const [rows]: any = await tempSequelize.query("SELECT version() AS version")
    const latencyMs = Date.now() - start
    await tempSequelize.close()

    return {
      connected: true,
      latencyMs,
      serverVersion: rows?.[0]?.version || "PostgreSQL",
      maskedUrl
    }
  } catch (error: any) {
    try {
      await tempSequelize.close()
    } catch {
      // Ignore
    }
    return {
      connected: false,
      latencyMs: Date.now() - start,
      maskedUrl,
      error: error.message || "Unable to connect to database"
    }
  }
}

export const registerUserInMasterLookup = async (params: {
  email: string
  tenantId: string
  tenantSlug: string
  role: string
}): Promise<void> => {
  const normalizedEmail = params.email.trim().toLowerCase()
  const normalizedSlug = params.tenantSlug.trim().toLowerCase()

  const existing = await SaasTenantUserLookup.findOne({
    where: { email: normalizedEmail, tenantId: params.tenantId }
  })

  if (existing) {
    await existing.update({ role: params.role, tenantSlug: normalizedSlug })
  } else {
    await SaasTenantUserLookup.create({
      email: normalizedEmail,
      tenantId: params.tenantId,
      tenantSlug: normalizedSlug,
      role: params.role
    })
  }

  await cacheService.del(`master:email-lookup:${normalizedEmail}`)
}

/**
 * Initializes the Control-Plane tables (`saas_tenants`, `saas_tenant_users`)
 * and ensures the primary default tenant ("ijse") is registered and warm.
 */
export const initializeMasterControlPlane = async (): Promise<void> => {
  await masterSequelize.authenticate()

  await masterSequelize.query(`
    DO $$ BEGIN
      CREATE TYPE "enum_saas_tenants_plan" AS ENUM ('FREE_TRIAL', 'STARTER', 'PRO', 'ENTERPRISE');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE "enum_saas_tenants_status" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    DO $$ BEGIN
      CREATE TYPE "enum_saas_tenants_db_strategy" AS ENUM ('DEFAULT_HOST', 'DEDICATED_MANAGED', 'BYOD_CUSTOM');
    EXCEPTION WHEN duplicate_object THEN null; END $$;

    CREATE TABLE IF NOT EXISTS "saas_tenants" (
      "id" UUID PRIMARY KEY,
      "name" VARCHAR(255) NOT NULL,
      "slug" VARCHAR(100) NOT NULL UNIQUE,
      "domain" VARCHAR(255) UNIQUE,
      "logo_url" VARCHAR(500),
      "primary_color" VARCHAR(32) NOT NULL DEFAULT '#2563eb',
      "plan" "enum_saas_tenants_plan" NOT NULL DEFAULT 'ENTERPRISE',
      "status" "enum_saas_tenants_status" NOT NULL DEFAULT 'ACTIVE',
      "db_strategy" "enum_saas_tenants_db_strategy" NOT NULL DEFAULT 'DEFAULT_HOST',
      "db_url_encrypted" TEXT NOT NULL,
      "db_ssl_required" BOOLEAN NOT NULL DEFAULT true,
      "max_employees" INTEGER NOT NULL DEFAULT 250,
      "max_branches" INTEGER NOT NULL DEFAULT 25,
      "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Colombo',
      "owner_email" VARCHAR(255) NOT NULL,
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS "saas_tenant_users" (
      "id" UUID PRIMARY KEY,
      "email" VARCHAR(255) NOT NULL,
      "tenant_id" UUID NOT NULL REFERENCES "saas_tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "tenant_slug" VARCHAR(100) NOT NULL,
      "role" VARCHAR(64) NOT NULL DEFAULT 'EMPLOYEE',
      "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE ("email", "tenant_id")
    );

    CREATE INDEX IF NOT EXISTS "idx_saas_tenant_users_email" ON "saas_tenant_users" ("email");
  `)

  // Ensure high-performance indexes exist on the default tenant database as well
  await provisionTenantDatabaseSchema(baseSequelize)

  let defaultTenant = await SaasTenant.findOne({ where: { slug: "ijse" } })
  if (!defaultTenant) {
    defaultTenant = await SaasTenant.create({
      name: "IJSE - Institute of Software Engineering",
      slug: "ijse",
      domain: "ijse.lk",
      primaryColor: "#2563eb",
      plan: "ENTERPRISE",
      status: "ACTIVE",
      dbStrategy: "DEFAULT_HOST",
      dbUrlEncrypted: encryptConnectionUrl(defaultDatabaseUrl),
      dbSslRequired: !defaultDatabaseUrl.includes("localhost"),
      maxEmployees: 1000,
      maxBranches: 50,
      timezone: "Asia/Colombo",
      ownerEmail: "shamodha7@gmail.com"
    })
  }

  tenantPoolManager.registerDefaultPool(
    defaultTenant.toJSON(),
    defaultDatabaseUrl,
    baseSequelize
  )

  // Sync existing employees from the default tenant DB into the master lookup index
  const existingEmployees = await Employee.findAll({
    attributes: ["email", "role"]
  })
  for (const emp of existingEmployees) {
    await registerUserInMasterLookup({
      email: emp.email,
      tenantId: defaultTenant.id,
      tenantSlug: defaultTenant.slug,
      role: emp.role
    })
  }

  console.log(
    `[SaaS Control Plane] Initialized. Default tenant '${defaultTenant.slug}' (${defaultTenant.id}) warm pool ready.`
  )
}

/**
 * Onboards a new SaaS Tenant Organization with either its own BYOD Custom PostgreSQL DB
 * or a dedicated managed DB, provisions the schema, and seeds initial data.
 */
export const onboardNewTenant = async (input: OnboardTenantInput) => {
  const slug = input.slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")

  if (!slug || slug.length < 2) {
    throw new Error("Workspace slug must be at least 2 alphanumeric characters.")
  }

  const existing = await SaasTenant.findOne({ where: { slug } })
  if (existing) {
    throw new Error(`Workspace slug '${slug}' is already taken.`)
  }

  const targetDbUrl = input.customDatabaseUrl?.trim() || defaultDatabaseUrl
  const dbStrategy: TenantDbStrategy = input.customDatabaseUrl?.trim()
    ? input.dbStrategy || "BYOD_CUSTOM"
    : "DEFAULT_HOST"
  const sslRequired = input.dbSslRequired !== undefined ? input.dbSslRequired : true

  // 1. Verify database connectivity
  const connCheck = await testDatabaseConnection(targetDbUrl, sslRequired)
  if (!connCheck.connected) {
    throw new Error(
      `Failed to connect to tenant database (${connCheck.maskedUrl}): ${connCheck.error}`
    )
  }

  // 2. Create Tenant in Master Control Plane
  const plan: TenantPlan = input.plan || "PRO"
  const planDefaults: Record<TenantPlan, { maxEmployees: number; maxBranches: number }> = {
    FREE_TRIAL: { maxEmployees: 25, maxBranches: 2 },
    STARTER: { maxEmployees: 75, maxBranches: 5 },
    PRO: { maxEmployees: 300, maxBranches: 20 },
    ENTERPRISE: { maxEmployees: 5000, maxBranches: 200 }
  }

  const tenant = await SaasTenant.create({
    name: input.name.trim(),
    slug,
    domain: input.domain?.trim() || null,
    logoUrl: input.logoUrl?.trim() || null,
    primaryColor: input.primaryColor || "#2563eb",
    plan,
    status: plan === "FREE_TRIAL" ? "TRIAL" : "ACTIVE",
    dbStrategy,
    dbUrlEncrypted: encryptConnectionUrl(targetDbUrl),
    dbSslRequired: sslRequired,
    maxEmployees: input.maxEmployees || planDefaults[plan].maxEmployees,
    maxBranches: input.maxBranches || planDefaults[plan].maxBranches,
    timezone: input.timezone || "Asia/Colombo",
    ownerEmail: input.adminEmail.trim().toLowerCase()
  })

  // 3. Spin up the warm connection pool & provision schema on the tenant's isolated DB
  const poolEntry = await tenantPoolManager.getTenantPool(tenant.id)
  if (!poolEntry) {
    throw new Error("Failed to initialize tenant connection pool.")
  }

  await provisionTenantDatabaseSchema(poolEntry.sequelize)

  // 4. Seed initial LeaveTypes, Department, and SUPER_ADMIN inside the tenant's isolated DB context
  const adminEmployee = await runWithTenantContext(
    {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      dbStrategy: tenant.dbStrategy,
      sequelize: poolEntry.sequelize
    },
    async () => {
      const defaultLeaveTypes = [
        { name: "Annual", defaultQuota: 14 },
        { name: "Casual", defaultQuota: 7 },
        { name: "Medical", defaultQuota: 7 }
      ]

      const createdLeaveTypes: LeaveType[] = []
      for (const lt of defaultLeaveTypes) {
        const [record] = await LeaveType.findOrCreate({
          where: { name: lt.name },
          defaults: lt
        })
        createdLeaveTypes.push(record)
      }

      const [execDept] = await Department.findOrCreate({
        where: { name: "Administration" },
        defaults: { name: "Administration" }
      })

      const normalizedEmail = input.adminEmail.trim().toLowerCase()
      let admin = await Employee.findOne({ where: { email: normalizedEmail } })

      if (!admin) {
        const passwordHash = await hashPassword(input.adminPassword)
        const desiredCode =
          input.adminEmployeeCode?.trim() ||
          `${slug.toUpperCase().slice(0, 4)}-ADM-001`

        // Ensure unique employee code if sharing default host in dev/demo
        const existingCode = await Employee.findOne({
          where: { employeeCode: desiredCode }
        })
        const finalCode = existingCode
          ? `${desiredCode}-${Math.floor(100 + Math.random() * 900)}`
          : desiredCode

        admin = await Employee.create({
          employeeCode: finalCode,
          fullName: input.adminFullName.trim(),
          email: normalizedEmail,
          passwordHash,
          role: UserRole.SUPER_ADMIN,
          status: AccountStatus.ACTIVE,
          departmentId: execDept.id
        })

        for (const lt of createdLeaveTypes) {
          await LeaveLedger.create({
            employeeId: admin.id,
            leaveTypeId: lt.id,
            amount: Number(lt.defaultQuota),
            transactionType: TransactionType.ACCRUAL
          })
        }
      }

      return admin
    }
  )

  await registerUserInMasterLookup({
    email: input.adminEmail,
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    role: UserRole.SUPER_ADMIN
  })

  return {
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      domain: tenant.domain,
      plan: tenant.plan,
      status: tenant.status,
      dbStrategy: tenant.dbStrategy,
      maskedDbUrl: connCheck.maskedUrl,
      connectionLatencyMs: connCheck.latencyMs,
      maxEmployees: tenant.maxEmployees,
      maxBranches: tenant.maxBranches,
      timezone: tenant.timezone
    },
    admin: {
      id: adminEmployee.id,
      employeeCode: adminEmployee.employeeCode,
      fullName: adminEmployee.fullName,
      email: adminEmployee.email,
      role: adminEmployee.role
    }
  }
}
