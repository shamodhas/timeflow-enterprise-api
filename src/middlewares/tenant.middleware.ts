import { Request, Response, NextFunction } from "express"
import { tenantPoolManager } from "../config/tenantPoolManager"
import { runWithTenantContext } from "../config/tenantContext"
import { SaasTenantUserLookup } from "../config/masterDatabase"
import { cacheService } from "../services/cache.service"
import { decodeTokenUnsafe } from "../utils/jwt"

export interface TenantInfo {
  id: string
  slug: string
  name: string
  dbStrategy: "DEFAULT_HOST" | "DEDICATED_MANAGED" | "BYOD_CUSTOM"
}

const RESERVED_SUBDOMAINS = new Set([
  "localhost",
  "www",
  "api",
  "app",
  "timeflow",
  "timeflow-eight-sandy"
])

export const lookupTenantByEmail = async (
  email: string
): Promise<string | null> => {
  const normalized = email.trim().toLowerCase()
  if (!normalized) return null

  return cacheService.getOrSet<string | null>(
    `master:email-lookup:${normalized}`,
    300,
    async () => {
      const entry = await SaasTenantUserLookup.findOne({
        where: { email: normalized },
        order: [["updatedAt", "DESC"]]
      })
      return entry ? entry.tenantId : null
    }
  )
}

/**
 * Resolves the active tenant and binds its warm isolated Sequelize connection pool
 * into Node.js AsyncLocalStorage for the entire lifecycle of the HTTP request.
 */
export const resolveTenantContext = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let identifier: string | null =
      (req.header("x-tenant-id") || req.header("x-workspace-slug") || "").trim() ||
      null

    // 1. Check Bearer token payload if header was not explicitly set
    if (!identifier) {
      const authHeader = req.header("Authorization")
      const bearerToken = authHeader?.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : null
      if (bearerToken) {
        const decoded = decodeTokenUnsafe(bearerToken)
        if (decoded?.tenantId) identifier = decoded.tenantId
        else if (decoded?.tenantSlug) identifier = decoded.tenantSlug
      }
    }

    // 2. Check body/query tenantSlug or invite/refresh token
    if (!identifier && req.body && typeof req.body === "object") {
      if (typeof req.body.tenantSlug === "string" && req.body.tenantSlug.trim()) {
        identifier = req.body.tenantSlug.trim()
      } else if (typeof req.body.tenantId === "string" && req.body.tenantId.trim()) {
        identifier = req.body.tenantId.trim()
      } else if (typeof req.body.token === "string" && req.path.includes("complete-registration")) {
        const decodedInvite = decodeTokenUnsafe(req.body.token)
        if (decodedInvite?.tenantId) identifier = decodedInvite.tenantId
        else if (decodedInvite?.tenantSlug) identifier = decodedInvite.tenantSlug
      } else if (typeof req.body.refreshToken === "string") {
        const decodedRefresh = decodeTokenUnsafe(req.body.refreshToken)
        if (decodedRefresh?.tenantId) identifier = decodedRefresh.tenantId
        else if (decodedRefresh?.tenantSlug) identifier = decodedRefresh.tenantSlug
      }
    }

    if (!identifier && typeof req.query?.tenant === "string") {
      identifier = req.query.tenant.trim()
    }

    // 3. Zero-friction Email -> Tenant Auto-Discovery for Login
    if (
      !identifier &&
      req.body &&
      typeof req.body.email === "string" &&
      req.body.email.includes("@")
    ) {
      const discoveredTenantId = await lookupTenantByEmail(req.body.email)
      if (discoveredTenantId) {
        identifier = discoveredTenantId
      }
    }

    // 4. Subdomain extraction (e.g. dialog.timeflow.com -> dialog)
    if (!identifier && req.hostname) {
      const parts = req.hostname.split(".")
      if (parts.length >= 3) {
        const sub = parts[0].toLowerCase()
        if (!RESERVED_SUBDOMAINS.has(sub)) {
          identifier = sub
        }
      }
    }

    // 5. Default fallback to "ijse" primary workspace
    const targetIdentifier = identifier || "ijse"
    const poolEntry =
      (await tenantPoolManager.getTenantPool(targetIdentifier)) ||
      (targetIdentifier !== "ijse"
        ? await tenantPoolManager.getTenantPool("ijse")
        : null)

    if (!poolEntry) {
      res.status(404).json({
        code: "TENANT_NOT_FOUND",
        message: `Organization workspace '${targetIdentifier}' not found or is suspended.`
      })
      return
    }

    ;(req as any).tenant = {
      id: poolEntry.tenantId,
      slug: poolEntry.tenantSlug,
      name: poolEntry.tenantName,
      dbStrategy: poolEntry.dbStrategy
    } satisfies TenantInfo

    res.setHeader("X-Tenant-Slug", poolEntry.tenantSlug)
    res.setHeader("X-Tenant-Strategy", poolEntry.dbStrategy)

    runWithTenantContext(
      {
        tenantId: poolEntry.tenantId,
        tenantSlug: poolEntry.tenantSlug,
        tenantName: poolEntry.tenantName,
        dbStrategy: poolEntry.dbStrategy,
        sequelize: poolEntry.sequelize
      },
      () => {
        next()
      }
    )
  } catch (error: any) {
    console.error("[TenantMiddleware Error]", error)
    res.status(500).json({
      message: "Failed to resolve tenant database connection.",
      error: error.message
    })
  }
}
