import { Router } from "express"
import {
  login,
  googleLogin,
  register,
  refreshToken,
  getMe,
  completeRegistration
} from "../controllers/auth.controller"
import { authenticate } from "../middlewares/authenticate"

const router = Router()

router.post("/register", register)
router.post("/complete-registration", completeRegistration)
router.post("/login", login)
router.post("/google", googleLogin)
router.post("/refresh", refreshToken)
router.get("/me", authenticate, getMe)

export default router
