import { Router } from "express"
import {
  importEmployees,
  importAttendance,
  importLeaves
} from "../controllers/import.controller"
import { authenticate } from "../middlewares/authenticate"
import { requireManagement } from "../middlewares/authorize"

const router = Router()

router.use(authenticate)
router.use(requireManagement)

router.post("/employees", importEmployees)
router.post("/attendance", importAttendance)
router.post("/leaves", importLeaves)

export default router
