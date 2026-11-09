import { Router } from "express"
import { authorize } from "../middlewares/authorize"
import { UserRole } from "../types/database.enums"
import { getDashboardStats, getMyDashboardStats } from "../controllers/dashboard.controller"
import { authenticate } from "../middlewares/authenticate"

const router = Router()

router.use(authenticate)

router.get(
  "/company",
  authorize([UserRole.SUPER_ADMIN,UserRole.ADMIN, UserRole.HR]),
  getDashboardStats
)

router.get(
  "/me",
  getMyDashboardStats
)

export default router
