import { Request, Response } from "express"
import { SaasTenant } from "../config/masterDatabase"
import { tenantPoolManager } from "../config/tenantPoolManager"
import { getCurrentTenantId } from "../config/tenantContext"
import {
  onboardNewTenant,
  provisionTenantDatabaseSchema,
  testDatabaseConnection
} from "../services/tenantProvisioner.service"
import { cacheService } from "../services/cache.service"
import {
  decryptConnectionUrl,
  encryptConnectionUrl,
  maskConnectionUrl
} from "../utils/crypto.utils"
import { generateRefreshToken, generateToken } from "../utils/jwt"
import { AuthRequest } from "../middlewares/authenticate"
import { lookupTenantByEmail } from "../middlewares/tenant.middleware"
import { Branch, Employee } from "../models"
import { UserRole } from "../types/database.enums"

export const resolveWorkspacePublic = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const slug = typeof req.query.slug === "string" ? req.query.slug.trim().toLowerCase() : ""
    const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : ""

    let tenant: SaasTenant | null = null

    if (slug) {
      tenant = await SaasTenant.findOne({ where: { slug } })
    } else if (email) {
      const tenantId = await lookupTenantByEmail(email)
      if (tenantId) {
        tenant = await SaasTenant.findByPk(tenantId)
      }
    }

    if (!tenant) {
      res.status(404).json({ message: "Workspace not found." })
      return
    }

    res.status(200).json({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      domain: tenant.domain,
      logoUrl: tenant.logoUrl,
      primaryColor: tenant.primaryColor,
      plan: tenant.plan,
      status: tenant.status,
      dbStrategy: tenant.dbStrategy,
      timezone: tenant.timezone
    })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

export const testCustomDatabase = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { databaseUrl, sslRequired } = req.body ?? {}
    if (!databaseUrl || typeof databaseUrl !== "string") {
      res.status(400).json({ message: "A PostgreSQL connection URL is required." })
      return
    }

    if (
      !databaseUrl.startsWith("postgres://") &&
      !databaseUrl.startsWith("postgresql://")
    ) {
      res.status(400).json({
        message: "Connection URL must start with postgresql:// or postgres://"
      })
      return
    }

    const result = await testDatabaseConnection(
      databaseUrl.trim(),
      sslRequired !== false
    )
    res.status(result.connected ? 200 : 400).json(result)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

export const onboardTenantController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      name,
      slug,
      domain,
      logoUrl,
      primaryColor,
      plan,
      dbStrategy,
      customDatabaseUrl,
      dbSslRequired,
      maxEmployees,
      maxBranches,
      timezone,
      adminFullName,
      adminEmail,
      adminPassword,
      adminEmployeeCode
    } = req.body ?? {}

    if (!name || !slug || !adminFullName || !adminEmail || !adminPassword) {
      res.status(400).json({
        message:
          "Organization name, workspace slug, admin name, admin email, and password are required."
      })
      return
    }

    const result = await onboardNewTenant({
      name,
      slug,
      domain,
      logoUrl,
      primaryColor,
      plan,
      dbStrategy,
      customDatabaseUrl,
      dbSslRequired,
      maxEmployees,
      maxBranches,
      timezone,
      adminFullName,
      adminEmail,
      adminPassword,
      adminEmployeeCode
    })

    const token = generateToken({
      id: result.admin.id,
      role: result.admin.role as UserRole,
      tenantId: result.tenant.id,
      tenantSlug: result.tenant.slug
    })

    const refreshToken = generateRefreshToken({
      id: result.admin.id,
      role: result.admin.role as UserRole,
      tenantId: result.tenant.id,
      tenantSlug: result.tenant.slug
    })

    res.status(201).json({
      message: "Organization workspace and isolated database provisioned successfully.",
      ...result,
      token,
      refreshToken,
      user: {
        ...result.admin,
        status: "ACTIVE",
        tenantId: result.tenant.id,
        tenantSlug: result.tenant.slug,
        tenantName: result.tenant.name
      }
    })
  } catch (error: any) {
    res.status(400).json({ message: error.message, error: error.message })
  }
}

export const getCurrentTenantDetails = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const tenantId = req.tenant?.id || getCurrentTenantId()
    const tenant =
      (await SaasTenant.findByPk(tenantId)) ||
      (await SaasTenant.findOne({ where: { slug: "ijse" } }))

    if (!tenant) {
      res.status(404).json({ message: "Tenant configuration not found." })
      return
    }

    const [employeeCount, branchCount] = await Promise.all([
      Employee.count(),
      Branch.count()
    ])

    let maskedDbUrl = "postgresql://****@<default-host>/db"
    try {
      maskedDbUrl = maskConnectionUrl(decryptConnectionUrl(tenant.dbUrlEncrypted))
    } catch {
      // Ignore
    }

    res.status(200).json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        domain: tenant.domain,
        logoUrl: tenant.logoUrl,
        primaryColor: tenant.primaryColor,
        plan: tenant.plan,
        status: tenant.status,
        dbStrategy: tenant.dbStrategy,
        dbSslRequired: tenant.dbSslRequired,
        maskedDbUrl,
        maxEmployees: tenant.maxEmployees,
        maxBranches: tenant.maxBranches,
        timezone: tenant.timezone,
        ownerEmail: tenant.ownerEmail,
        createdAt: tenant.createdAt
      },
      usage: {
        employees: employeeCount,
        branches: branchCount
      },
      performance: {
        cache: cacheService.getStats(),
        connectionPools: tenantPoolManager.getTelemetry()
      }
    })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

export const updateTenantDatabaseConfig = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const tenantId = req.params.id || req.tenant?.id || getCurrentTenantId()
    const {
      customDatabaseUrl,
      dbStrategy,
      dbSslRequired,
      name,
      primaryColor,
      timezone,
      plan,
      maxEmployees,
      maxBranches
    } = req.body ?? {}

    const tenant = await SaasTenant.findByPk(tenantId)
    if (!tenant) {
      res.status(404).json({ message: "Tenant not found." })
      return
    }

    let updatedEncryptedUrl = tenant.dbUrlEncrypted
    let updatedStrategy = dbStrategy || tenant.dbStrategy
    let updatedSsl =
      typeof dbSslRequired === "boolean" ? dbSslRequired : tenant.dbSslRequired
    let latencyMs: number | undefined

    if (customDatabaseUrl && typeof customDatabaseUrl === "string" && customDatabaseUrl.trim()) {
      const check = await testDatabaseConnection(customDatabaseUrl.trim(), updatedSsl)
      if (!check.connected) {
        res.status(400).json({
          message: `Cannot switch database — connection test failed: ${check.error}`
        })
        return
      }
      latencyMs = check.latencyMs
      updatedEncryptedUrl = encryptConnectionUrl(customDatabaseUrl.trim())
      updatedStrategy = dbStrategy || "BYOD_CUSTOM"
    }

    await tenant.update({
      name: name?.trim() || tenant.name,
      primaryColor: primaryColor || tenant.primaryColor,
      timezone: timezone || tenant.timezone,
      plan: plan || tenant.plan,
      maxEmployees: Number(maxEmployees) || tenant.maxEmployees,
      maxBranches: Number(maxBranches) || tenant.maxBranches,
      dbUrlEncrypted: updatedEncryptedUrl,
      dbStrategy: updatedStrategy,
      dbSslRequired: updatedSsl
    })

    // Evict old warm pool and re-warm with new database configuration
    await tenantPoolManager.evictTenantPool(tenant.id, tenant.slug)
    await cacheService.invalidateTenantCache(tenant.id)

    const freshPool = await tenantPoolManager.getTenantPool(tenant.id)
    if (freshPool && customDatabaseUrl) {
      await provisionTenantDatabaseSchema(freshPool.sequelize)
    }

    res.status(200).json({
      message: customDatabaseUrl
        ? "Dedicated/BYOD database connected, schema provisioned, and connection pool warmed."
        : "Organization settings updated successfully.",
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        plan: tenant.plan,
        dbStrategy: tenant.dbStrategy,
        maskedDbUrl: freshPool?.maskedDbUrl,
        connectionLatencyMs: latencyMs
      }
    })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

export const listAllTenants = async (
  _req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const tenants = await SaasTenant.findAll({
      order: [["createdAt", "DESC"]]
    })

    const formatted = tenants.map((t) => {
      let maskedDbUrl = "postgresql://****@<host>/db"
      try {
        maskedDbUrl = maskConnectionUrl(decryptConnectionUrl(t.dbUrlEncrypted))
      } catch {
        // Ignore
      }
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        domain: t.domain,
        plan: t.plan,
        status: t.status,
        dbStrategy: t.dbStrategy,
        maskedDbUrl,
        maxEmployees: t.maxEmployees,
        maxBranches: t.maxBranches,
        timezone: t.timezone,
        ownerEmail: t.ownerEmail,
        createdAt: t.createdAt
      }
    })

    res.status(200).json({
      tenants: formatted,
      telemetry: {
        cache: cacheService.getStats(),
        pools: tenantPoolManager.getTelemetry()
      }
    })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}
