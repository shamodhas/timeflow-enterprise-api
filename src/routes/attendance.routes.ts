import { Router } from "express"
import {
  clockIn,
  clockOut,
  getMyAttendance,
  getAllAttendance,
  getEmployeeAttendanceDetails,
  getAllEmployeesAttendance,
  getMyTodayAttendance,
  getLocationFailures,
  submitLocationFailureReason
} from "../controllers/attendance.controller"
import { authenticate } from "../middlewares/authenticate"
import { requireManagement } from "../middlewares/authorize"

const router = Router()

router.use(authenticate)

router.post("/clock-in", clockIn)
router.post("/clock-out", clockOut)
router.get("/me", getMyAttendance)
router.get("/me/today", getMyTodayAttendance)
router.get("/location-failures", requireManagement, getLocationFailures)
router.patch("/:id/location-reason", submitLocationFailureReason)

router.get("/", requireManagement, getAllAttendance)
router.get(
  "/employee/:employeeId",
  requireManagement,
  getEmployeeAttendanceDetails
)
router.get("/all", requireManagement, getAllEmployeesAttendance)

export default router
