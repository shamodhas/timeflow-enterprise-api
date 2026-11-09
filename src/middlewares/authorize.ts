import { Response, NextFunction } from "express"
import { AuthRequest } from "./authenticate"
import { UserRole } from "../types/database.enums"

export const authorize = (roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ message: "Forbidden. Insufficient permissions." })
      return
    }
    next()
  }
}

export const requireAdmin = authorize([UserRole.SUPER_ADMIN, UserRole.ADMIN])

export const requireManagement = authorize([
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN,
  UserRole.HR
])
