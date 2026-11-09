import { Router } from "express"
import {
  getCurrentTenantDetails,
  listAllTenants,
  onboardTenantController,
  resolveWorkspacePublic,
  testCustomDatabase,
  updateTenantDatabaseConfig
} from "../controllers/tenant.controller"
import { authenticate } from "../middlewares/authenticate"
import { requireAdmin, requireManagement } from "../middlewares/authorize"

const router = Router()

// Public SaaS Onboarding & Workspace Discovery
router.get("/resolve", resolveWorkspacePublic)
router.post("/test-db", testCustomDatabase)
router.post("/onboard", onboardTenantController)

// Authenticated Tenant & BYOD Database Management
router.use(authenticate)
router.get("/current", requireManagement, getCurrentTenantDetails)
router.get("/", requireAdmin, listAllTenants)
router.put("/current/database", requireAdmin, updateTenantDatabaseConfig)
router.put("/:id/database", requireAdmin, updateTenantDatabaseConfig)

export default router
