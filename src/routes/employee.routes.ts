import { Router } from "express"
import {
  createEmployee,
  deleteEmployee,
  getEmployees,
  getPendingEmployees,
  inviteEmployee,
  updateEmployee,
  updateEmployeeStatus
} from "../controllers/employee.controller"
import { authenticate } from "../middlewares/authenticate"
import {
  authorize,
  requireAdmin,
  requireManagement
} from "../middlewares/authorize"

const router = Router()

router.use(authenticate)

router.post("/", requireManagement, createEmployee)
router.get("/", requireManagement, getEmployees)
router.put("/:id", requireManagement, updateEmployee)
router.delete("/:id", requireAdmin, deleteEmployee)
router.get("/pending", requireManagement, getPendingEmployees)
router.post("/invite", requireManagement, inviteEmployee)
router.patch("/:id/status", requireAdmin, updateEmployeeStatus)

export default router
