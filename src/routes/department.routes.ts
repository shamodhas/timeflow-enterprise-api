import { Router } from "express"
import {
  createDepartment,
  getDepartments
} from "../controllers/department.controller"
import { authenticate } from "../middlewares/authenticate"
import { requireManagement } from "../middlewares/authorize"

const router = Router()

router.use(authenticate)

router.post("/", requireManagement, createDepartment)
router.get("/", getDepartments)

export default router
