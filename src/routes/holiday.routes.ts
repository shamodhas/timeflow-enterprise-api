import { Router } from "express"
import {
  getHolidays,
  createHoliday,
  deleteHoliday
} from "../controllers/holiday.controller"
import { authenticate } from "../middlewares/authenticate"
import { requireManagement } from "../middlewares/authorize"

const router = Router()

router.use(authenticate)

router.get("/", getHolidays)
router.post("/", requireManagement, createHoliday)
router.delete("/:id", requireManagement, deleteHoliday)

export default router
