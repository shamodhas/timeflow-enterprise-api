import { Router } from "express"
import {
  createBranch,
  getBranches,
  updateBranch
} from "../controllers/branch.controller"
import { authenticate } from "../middlewares/authenticate"
import { requireManagement } from "../middlewares/authorize"

const router = Router()
router.use(authenticate)
router.get("/", getBranches)
router.post("/", requireManagement, createBranch)
router.patch("/:id", requireManagement, updateBranch)

export default router
