import { Router } from "express"
import { exportAttendanceCSV } from "../controllers/report.controller"
import { authenticate } from "../middlewares/authenticate"
import { requireManagement } from "../middlewares/authorize"

const router = Router()

router.use(authenticate)
router.get("/attendance", requireManagement, exportAttendanceCSV)

export default router
