import { Router } from "express"
import {
  requestLeave,
  approveLeave,
  getLeaveBalance,
  getAllLeaveRequests,
  getEmployeeLeaveDetails,
  getLeaveTypes,
  createLeaveType,
  adjustEmployeeLeaveBalance,
  getMyLeaveRequests,
  getActingCandidates
} from "../controllers/leave.controller"
import { authenticate } from "../middlewares/authenticate"
import { requireManagement } from "../middlewares/authorize"
import { leaveRequestSchema } from "../validators/schemas"
import { validate } from "../middlewares/validate"

const router = Router()

router.use(authenticate)

router.post("/request", validate(leaveRequestSchema), requestLeave)
router.get("/balance", getLeaveBalance)
router.patch("/:id/approve", requireManagement, approveLeave)
router.get("/requests", requireManagement, getAllLeaveRequests)
router.get("/employee/:employeeId", requireManagement, getEmployeeLeaveDetails)
router.get("/types", getLeaveTypes)
router.post("/types", requireManagement, createLeaveType)
router.get("/my-requests", getMyLeaveRequests)
router.get("/acting-candidates", getActingCandidates)
router.post(
  "/employee/:employeeId/adjust",
  requireManagement,
  adjustEmployeeLeaveBalance
)

export default router
