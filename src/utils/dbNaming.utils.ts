export type EnvironmentMode = "development" | "production" | "test"

export const isProductionEnv = (env = process.env.NODE_ENV): boolean =>
  env === "production"

/**
 * Returns the standardized primary database name:
 * - Development: `dev_timeflow_enterprise_db`
 * - Production:  `timeflow_enterprise_db`
 */
export const getPrimaryDbName = (env = process.env.NODE_ENV): string =>
  isProductionEnv(env)
    ? "timeflow_enterprise_db"
    : "dev_timeflow_enterprise_db"

/**
 * Returns the standardized master/control-plane database name:
 * - Development: `dev_timeflow_enterprise_master_db`
 * - Production:  `timeflow_enterprise_master_db`
 */
export const getMasterDbName = (env = process.env.NODE_ENV): string =>
  isProductionEnv(env)
    ? "timeflow_enterprise_master_db"
    : "dev_timeflow_enterprise_master_db"

/**
 * Returns the standardized isolated database name for a specific tenant slug:
 * - Development: `dev_timeflow_enterprise_<slug>_db`
 * - Production:  `timeflow_enterprise_<slug>_db`
 */
export const getTenantDbName = (
  tenantSlug: string,
  env = process.env.NODE_ENV
): string => {
  const safeSlug = tenantSlug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")

  return isProductionEnv(env)
    ? `timeflow_enterprise_${safeSlug}_db`
    : `dev_timeflow_enterprise_${safeSlug}_db`
}

/**
 * Replaces the database name in a PostgreSQL connection URL while preserving
 * host, credentials, port, and query parameters (such as `?sslmode=require`).
 */
export const buildDbUrlWithDatabaseName = (
  baseConnectionUrl: string,
  targetDbName: string
): string => {
  const parsed = new URL(baseConnectionUrl)
  parsed.pathname = `/${targetDbName}`
  return parsed.toString()
}

/**
 * Extracts the database name from a PostgreSQL connection URL.
 */
export const extractDbNameFromUrl = (connectionUrl: string): string => {
  try {
    const parsed = new URL(connectionUrl)
    return parsed.pathname.replace(/^\/+/, "") || getPrimaryDbName()
  } catch {
    return getPrimaryDbName()
  }
}
