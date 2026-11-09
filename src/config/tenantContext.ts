import { AsyncLocalStorage } from "async_hooks"
import type { Sequelize } from "sequelize"

export interface TenantExecutionContext {
  tenantId: string
  tenantSlug: string
  tenantName: string
  dbStrategy: "DEFAULT_HOST" | "DEDICATED_MANAGED" | "BYOD_CUSTOM"
  sequelize: Sequelize
}

export const tenantAsyncStorage = new AsyncLocalStorage<TenantExecutionContext>()

export const runWithTenantContext = <T>(
  context: TenantExecutionContext,
  callback: () => T
): T => {
  return tenantAsyncStorage.run(context, callback)
}

export const getCurrentTenantContext = (): TenantExecutionContext | undefined => {
  return tenantAsyncStorage.getStore()
}

export const getCurrentTenantId = (): string => {
  return tenantAsyncStorage.getStore()?.tenantId || "default"
}

export const getCurrentTenantSlug = (): string => {
  return tenantAsyncStorage.getStore()?.tenantSlug || "ijse"
}
