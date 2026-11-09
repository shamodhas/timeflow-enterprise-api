import jwt from "jsonwebtoken"
import { UserRole } from "../types/database.enums"

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "491b9ec9f3a0589927957d5a5fd1006f2c7b3333882a43573101c49ebdf170e9"
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  "cec8c47870bca543ad5f38540cc1ffb9619e4c43a20fbd165a654c5a771aa141"
const JWT_ENCRIPTION_SECRET =
  process.env.JWT_ENCRIPTION_SECRET ||
  "9b62003abec9f1a292233c51c6aac4c5171b7b14ab3884698d6854e48c935146"

export interface JwtPayload {
  id: string
  role: UserRole
  sub?: string
}

export interface InvitePayload {
  id: string
  email: string
}

export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(
    { ...payload, sub: payload.id },
    JWT_SECRET,
    { expiresIn: "15m" }
  )
}

export const generateRefreshToken = (payload: JwtPayload): string => {
  return jwt.sign(
    { ...payload, sub: payload.id },
    JWT_REFRESH_SECRET,
    { expiresIn: "30d" }
  )
}

export const generateInviteToken = (payload: InvitePayload): string => {
  return jwt.sign(
    payload,
    JWT_ENCRIPTION_SECRET, 
    { expiresIn: "3d" }
  )
}

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, JWT_SECRET) as JwtPayload
}

export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(
    token,
    JWT_REFRESH_SECRET
  ) as JwtPayload
}

export const verifyInviteToken = (token: string): InvitePayload => {
  return jwt.verify(token, JWT_ENCRIPTION_SECRET) as InvitePayload
}
