import { Request, Response, NextFunction } from "express"
import { UserRole } from "../types/database.enums"
import { verifyToken } from "../utils/jwt"

export interface AuthRequest extends Request {
  user?: { id: string; role: UserRole }
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const token = req.header("Authorization")?.split(" ")[1]

  if (!token) {
    res.status(401).json({ message: "Access Denied. No token provided." })
    return
  }

  try {
    const decoded = verifyToken(token)
    console.log(decoded)

    if (!decoded?.id) {
      res.status(401).json({ message: "Unauthorized. Invalid token payload." })
      return
    }

    req.user = decoded
    next()
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token." })
  }
}
