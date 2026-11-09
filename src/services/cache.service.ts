import net from "net"
import tls from "tls"

interface CacheEntry<T = unknown> {
  value: T
  expiresAt: number
  lastAccessedAt: number
}

export interface CacheStats {
  provider: "redis+memory-l1" | "memory-lru"
  redisConnected: boolean
  l1Size: number
  maxL1Entries: number
  hits: number
  misses: number
  hitRatePercent: number
  sets: number
  invalidations: number
}

/**
 * Lightweight native RESP Redis client over TCP/TLS so the API works with any
 * standard REDIS_URL (redis:// or rediss://) without requiring heavy native compilation,
 * paired with a sub-millisecond L1 In-Memory LRU cache fallback.
 */
class LightweightRedisClient {
  private socket: net.Socket | tls.TLSSocket | null = null
  private connected = false
  private url: URL

  constructor(redisUrl: string) {
    this.url = new URL(redisUrl)
    this.connect()
  }

  public isReady(): boolean {
    return this.connected && this.socket !== null && !this.socket.destroyed
  }

  private connect(): void {
    try {
      const isTls = this.url.protocol === "rediss:"
      const port = Number(this.url.port) || 6379
      const host = this.url.hostname || "127.0.0.1"

      const onConnect = () => {
        this.connected = true
        if (this.url.password) {
          const username = this.url.username ? decodeURIComponent(this.url.username) : ""
          const password = decodeURIComponent(this.url.password)
          if (username && username !== "default") {
            this.sendRawCommand(["AUTH", username, password])
          } else {
            this.sendRawCommand(["AUTH", password])
          }
        }
        console.log(`[Cache] Connected to Redis (${host}:${port})`)
      }

      if (isTls) {
        this.socket = tls.connect({ host, port, rejectUnauthorized: false }, onConnect)
      } else {
        this.socket = net.createConnection({ host, port }, onConnect)
      }

      this.socket.on("error", (err) => {
        this.connected = false
        console.warn("[Cache] Redis connection warning (using L1 Memory LRU fallback):", err.message)
      })

      this.socket.on("close", () => {
        this.connected = false
      })
    } catch (err: any) {
      this.connected = false
      console.warn("[Cache] Failed to initialize Redis socket, falling back to L1 Memory LRU:", err.message)
    }
  }

  private encodeRespCommand(args: string[]): string {
    let resp = `*${args.length}\r\n`
    for (const arg of args) {
      const byteLen = Buffer.byteLength(arg, "utf8")
      resp += `$${byteLen}\r\n${arg}\r\n`
    }
    return resp
  }

  private sendRawCommand(args: string[]): void {
    if (!this.socket || this.socket.destroyed) return
    try {
      this.socket.write(this.encodeRespCommand(args))
    } catch {
      this.connected = false
    }
  }

  public async setEx(key: string, ttlSeconds: number, serialized: string): Promise<void> {
    if (!this.isReady()) return
    this.sendRawCommand(["SETEX", key, String(Math.max(1, Math.floor(ttlSeconds))), serialized])
  }

  public async del(key: string): Promise<void> {
    if (!this.isReady()) return
    this.sendRawCommand(["DEL", key])
  }
}

class HybridCacheService {
  private l1 = new Map<string, CacheEntry>()
  private readonly maxL1Entries: number
  private redisClient: LightweightRedisClient | null = null
  private hits = 0
  private misses = 0
  private sets = 0
  private invalidations = 0

  constructor() {
    this.maxL1Entries = Number(process.env.CACHE_MAX_ENTRIES || 5000)
    const redisUrl = process.env.REDIS_URL?.trim()
    if (redisUrl) {
      try {
        this.redisClient = new LightweightRedisClient(redisUrl)
      } catch (err) {
        console.warn("[Cache] Invalid REDIS_URL, using L1 Memory LRU cache.")
      }
    }

    const sweepInterval = setInterval(() => this.sweepExpired(), 60_000)
    if (typeof sweepInterval.unref === "function") {
      sweepInterval.unref()
    }
  }

  public async get<T>(key: string): Promise<T | null> {
    const entry = this.l1.get(key)
    if (!entry) {
      this.misses++
      return null
    }

    const now = Date.now()
    if (now > entry.expiresAt) {
      this.l1.delete(key)
      this.misses++
      return null
    }

    entry.lastAccessedAt = now
    this.hits++
    return entry.value as T
  }

  public async set<T>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    if (this.l1.size >= this.maxL1Entries && !this.l1.has(key)) {
      this.evictLeastRecentlyUsed()
    }

    const now = Date.now()
    this.l1.set(key, {
      value,
      expiresAt: now + ttlSeconds * 1000,
      lastAccessedAt: now
    })
    this.sets++

    if (this.redisClient?.isReady()) {
      try {
        await this.redisClient.setEx(key, ttlSeconds, JSON.stringify(value))
      } catch {
        // Ignore L2 write error
      }
    }
  }

  public async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fetcher: () => Promise<T>
  ): Promise<T> {
    const cached = await this.get<T>(key)
    if (cached !== null) {
      return cached
    }

    const freshValue = await fetcher()
    await this.set(key, freshValue, ttlSeconds)
    return freshValue
  }

  public async del(key: string): Promise<void> {
    this.l1.delete(key)
    this.invalidations++
    if (this.redisClient?.isReady()) {
      await this.redisClient.del(key)
    }
  }

  public async invalidatePrefix(prefix: string): Promise<number> {
    let removed = 0
    for (const key of this.l1.keys()) {
      if (key.startsWith(prefix)) {
        this.l1.delete(key)
        removed++
        if (this.redisClient?.isReady()) {
          void this.redisClient.del(key)
        }
      }
    }
    this.invalidations += removed
    return removed
  }

  public async invalidateTenantCache(tenantId: string, resourcePrefix?: string): Promise<number> {
    const fullPrefix = resourcePrefix
      ? `tenant:${tenantId}:${resourcePrefix}`
      : `tenant:${tenantId}:`
    return this.invalidatePrefix(fullPrefix)
  }

  public getStats(): CacheStats {
    const totalLookups = this.hits + this.misses
    const hitRatePercent =
      totalLookups > 0 ? Number(((this.hits / totalLookups) * 100).toFixed(2)) : 0

    return {
      provider: this.redisClient?.isReady() ? "redis+memory-l1" : "memory-lru",
      redisConnected: Boolean(this.redisClient?.isReady()),
      l1Size: this.l1.size,
      maxL1Entries: this.maxL1Entries,
      hits: this.hits,
      misses: this.misses,
      hitRatePercent,
      sets: this.sets,
      invalidations: this.invalidations
    }
  }

  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [key, entry] of this.l1.entries()) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt
        oldestKey = key
      }
    }

    if (oldestKey) {
      this.l1.delete(oldestKey)
    }
  }

  private sweepExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.l1.entries()) {
      if (now > entry.expiresAt) {
        this.l1.delete(key)
      }
    }
  }
}

export const cacheService = new HybridCacheService()
