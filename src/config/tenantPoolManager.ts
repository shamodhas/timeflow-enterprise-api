import { Sequelize } from "sequelize"
import {
  SaasTenant,
  type SaasTenantAttributes,
  type TenantDbStrategy
} from "./masterDatabase"
import { decryptConnectionUrl, maskConnectionUrl } from "../utils/crypto.utils"
import { cacheService } from "../services/cache.service"

export interface ManagedTenantPool {
  tenantId: string
  tenantSlug: string
  tenantName: string
  dbStrategy: TenantDbStrategy
  maskedDbUrl: string
  sequelize: Sequelize
  createdAt: number
  lastAccessedAt: number
  totalQueries: number
}

export interface PoolManagerTelemetry {
  activeWarmPools: number
  maxConcurrentPools: number
  idleTimeoutMs: number
  tenants: Array<{
    tenantId: string
    tenantSlug: string
    tenantName: string
    dbStrategy: TenantDbStrategy
    maskedDbUrl: string
    lastAccessedSecondsAgo: number
    totalQueries: number
  }>
}

class TenantConnectionPoolManager {
  private pools = new Map<string, ManagedTenantPool>()
  private slugToId = new Map<string, string>()
  private readonly maxConcurrentPools: number
  private readonly idleTimeoutMs: number
  private readonly perTenantMaxConnections: number

  constructor() {
    this.maxConcurrentPools = Number(process.env.MAX_TENANT_POOLS || 60)
    this.idleTimeoutMs = Number(process.env.TENANT_POOL_IDLE_MS || 15 * 60 * 1000)
    this.perTenantMaxConnections = Number(process.env.TENANT_DB_POOL_MAX || 8)

    const reaper = setInterval(() => {
      void this.reapIdlePools()
    }, 60_000)
    if (typeof reaper.unref === "function") {
      reaper.unref()
    }
  }

  /**
   * Registers the primary/default Sequelize instance so the default tenant ("ijse")
   * shares the already-established boot pool with zero overhead.
   */
  public registerDefaultPool(
    tenant: Pick<
      SaasTenantAttributes,
      "id" | "slug" | "name" | "dbStrategy"
    >,
    rawUrl: string,
    sequelizeInstance: Sequelize
  ): ManagedTenantPool {
    const entry: ManagedTenantPool = {
      tenantId: tenant.id,
      tenantSlug: tenant.slug.toLowerCase(),
      tenantName: tenant.name,
      dbStrategy: tenant.dbStrategy,
      maskedDbUrl: maskConnectionUrl(rawUrl),
      sequelize: sequelizeInstance,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      totalQueries: 0
    }
    this.pools.set(tenant.id, entry)
    this.slugToId.set(tenant.slug.toLowerCase(), tenant.id)
    return entry
  }

  /**
   * Resolves a tenant configuration from L1/L2 Cache (0.01ms) or Master DB,
   * and returns a warm Sequelize connection pool for that tenant's isolated DB.
   */
  public async getTenantPool(
    identifier: string
  ): Promise<ManagedTenantPool | null> {
    const normalized = identifier.trim().toLowerCase()

    // 1. Direct hit in warm pools by ID or Slug (0ms!)
    const directById = this.pools.get(identifier)
    if (directById) {
      directById.lastAccessedAt = Date.now()
      directById.totalQueries++
      return directById
    }

    const mappedId = this.slugToId.get(normalized)
    if (mappedId) {
      const directBySlug = this.pools.get(mappedId)
      if (directBySlug) {
        directBySlug.lastAccessedAt = Date.now()
        directBySlug.totalQueries++
        return directBySlug
      }
    }

    // 2. Fetch tenant record from Cache or Control-Plane DB
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        identifier
      )

    const cacheKey = isUuid
      ? `master:tenant:id:${identifier}`
      : `master:tenant:slug:${normalized}`

    const tenantData = await cacheService.getOrSet<SaasTenantAttributes | null>(
      cacheKey,
      300,
      async () => {
        const record = await SaasTenant.findOne({
          where: isUuid ? { id: identifier } : { slug: normalized }
        })
        return record ? record.toJSON() : null
      }
    )

    if (!tenantData || tenantData.status === "SUSPENDED") {
      return null
    }

    // Double check if pool was already created under tenantData.id
    const existingPool = this.pools.get(tenantData.id)
    if (existingPool) {
      existingPool.lastAccessedAt = Date.now()
      existingPool.totalQueries++
      this.slugToId.set(tenantData.slug.toLowerCase(), tenantData.id)
      return existingPool
    }

    // 3. Evict oldest pool if we hit maxConcurrentPools
    if (this.pools.size >= this.maxConcurrentPools) {
      await this.evictLeastRecentlyUsedPool()
    }

    // 4. Decrypt isolated DB URL and spin up warm connection pool
    const decryptedUrl = decryptConnectionUrl(tenantData.dbUrlEncrypted)
    const isLocal =
      decryptedUrl.includes("localhost") || decryptedUrl.includes("127.0.0.1")

    const tenantSequelize = new Sequelize(decryptedUrl, {
      dialect: "postgres",
      logging: false,
      pool: {
        max: this.perTenantMaxConnections,
        min: 1,
        acquire: 25000,
        idle: 60000
      },
      dialectOptions: {
        ssl:
          !tenantData.dbSslRequired || isLocal
            ? false
            : {
                require: true,
                rejectUnauthorized: false
              }
      }
    })

    const newPool: ManagedTenantPool = {
      tenantId: tenantData.id,
      tenantSlug: tenantData.slug.toLowerCase(),
      tenantName: tenantData.name,
      dbStrategy: tenantData.dbStrategy,
      maskedDbUrl: maskConnectionUrl(decryptedUrl),
      sequelize: tenantSequelize,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      totalQueries: 1
    }

    this.pools.set(tenantData.id, newPool)
    this.slugToId.set(tenantData.slug.toLowerCase(), tenantData.id)
    return newPool
  }

  public async evictTenantPool(tenantId: string, slug?: string): Promise<void> {
    const entry = this.pools.get(tenantId)
    if (entry) {
      this.pools.delete(tenantId)
      this.slugToId.delete(entry.tenantSlug)
      try {
        await entry.sequelize.close()
      } catch {
        // Ignore close errors
      }
    }
    if (slug) {
      this.slugToId.delete(slug.toLowerCase())
      await cacheService.del(`master:tenant:slug:${slug.toLowerCase()}`)
    }
    await cacheService.del(`master:tenant:id:${tenantId}`)
  }

  public getTelemetry(): PoolManagerTelemetry {
    const now = Date.now()
    const tenants = Array.from(this.pools.values()).map((p) => ({
      tenantId: p.tenantId,
      tenantSlug: p.tenantSlug,
      tenantName: p.tenantName,
      dbStrategy: p.dbStrategy,
      maskedDbUrl: p.maskedDbUrl,
      lastAccessedSecondsAgo: Math.round((now - p.lastAccessedAt) / 1000),
      totalQueries: p.totalQueries
    }))

    return {
      activeWarmPools: this.pools.size,
      maxConcurrentPools: this.maxConcurrentPools,
      idleTimeoutMs: this.idleTimeoutMs,
      tenants
    }
  }

  private async evictLeastRecentlyUsedPool(): Promise<void> {
    let oldestId: string | null = null
    let oldestAccess = Infinity

    for (const [id, pool] of this.pools.entries()) {
      if (pool.tenantSlug === "ijse") continue // Keep default primary pool warm
      if (pool.lastAccessedAt < oldestAccess) {
        oldestAccess = pool.lastAccessedAt
        oldestId = id
      }
    }

    if (oldestId) {
      await this.evictTenantPool(oldestId)
    }
  }

  private async reapIdlePools(): Promise<void> {
    const now = Date.now()
    for (const [id, pool] of this.pools.entries()) {
      if (pool.tenantSlug === "ijse") continue
      if (now - pool.lastAccessedAt > this.idleTimeoutMs) {
        await this.evictTenantPool(id)
      }
    }
  }
}

export const tenantPoolManager = new TenantConnectionPoolManager()
