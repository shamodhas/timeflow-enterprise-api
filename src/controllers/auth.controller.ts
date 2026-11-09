import { Request, Response } from "express"
import { Department, Employee } from "../models"
import { AccountStatus, UserRole } from "../types/database.enums"
import {
  generateRefreshToken,
  generateToken,
  verifyInviteToken,
  verifyRefreshToken
} from "../utils/jwt"
import { AuthRequest } from "../middlewares/authenticate"
import { comparePassword, hashPassword } from "../utils/password"
import { grantInitialLeaves } from "../utils/leave.grant"
import {
  getCurrentTenantContext,
  getCurrentTenantId,
  getCurrentTenantSlug
} from "../config/tenantContext"
import { registerUserInMasterLookup } from "../services/tenantProvisioner.service"
import { cacheService } from "../services/cache.service"

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { employeeCode, fullName, email, password, role, departmentId } =
      req.body

    if (!employeeCode || !fullName || !email) {
      res
        .status(400)
        .json({ message: "Employee code, full name, and email are required" })
      return
    }

    if (departmentId) {
      const department = await Department.findByPk(departmentId)
      if (!department) {
        res.status(404).json({ message: "Selected department does not exist" })
        return
      }
    }

    const passwordHash = await hashPassword(password || "Default@123")

    const newEmployee: any = await Employee.create({
      employeeCode,
      fullName,
      email: email.trim().toLowerCase(),
      passwordHash,
      role: role || UserRole.EMPLOYEE,
      status: AccountStatus.PENDING,
      departmentId: departmentId || null
    })

    await grantInitialLeaves(newEmployee.id, null)

    const tenantId = getCurrentTenantId()
    const tenantSlug = getCurrentTenantSlug()
    if (tenantId && tenantId !== "default") {
      await registerUserInMasterLookup({
        email: newEmployee.email,
        tenantId,
        tenantSlug,
        role: newEmployee.role
      })
      await cacheService.invalidateTenantCache(tenantId, "dashboard")
    }

    res
      .status(201)
      .json({ message: "Registration submitted for admin approval." })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const completeRegistration = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { token, password } = req.body

    if (!token || !password) {
      res.status(400).json({ message: "Token and password are required." })
      return
    }

    let decoded: any
    try {
      decoded = verifyInviteToken(token)
    } catch (err) {
      res.status(400).json({ message: "Invalid or expired invitation link." })
      return
    }

    const employee: any = await Employee.findByPk(decoded.id)

    if (!employee) {
      res.status(404).json({ message: "Employee not found." })
      return
    }

    if (employee.status === AccountStatus.ACTIVE) {
      res.status(400).json({ message: "Account is already active. Please login." })
      return
    }

    const passwordHash = await hashPassword(password)

    await Employee.update(
      {
        passwordHash,
        status: AccountStatus.ACTIVE
      },
      { where: { id: employee.id } }
    )

    res.status(200).json({ message: "Registration complete! You can now log in." })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" })
      return
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const user: any = await Employee.findOne({ where: { email: normalizedEmail } })

    if (!user) {
      res.status(401).json({ message: "Invalid credentials" })
      return
    }

    const accountStatus = user.status

    if (accountStatus !== AccountStatus.ACTIVE) {
      res.status(403).json({
        message: `Account is ${accountStatus.toLowerCase()}. Please contact your administrator.`
      })
      return
    }

    const storedHash = user?.passwordHash

    if (!(await comparePassword(password, storedHash))) {
      res.status(401).json({ message: "Invalid credentials" })
      return
    }

    const tenantCtx = getCurrentTenantContext()
    const tenantId = tenantCtx?.tenantId
    const tenantSlug = tenantCtx?.tenantSlug
    const tenantName = tenantCtx?.tenantName

    const token = generateToken({
      id: user.id,
      role: user.role,
      tenantId,
      tenantSlug
    })
    const refreshToken = generateRefreshToken({
      id: user.id,
      role: user.role,
      tenantId,
      tenantSlug
    })

    res.status(200).json({
      token,
      refreshToken,
      user: {
        id: user.id,
        employeeCode: user.employeeCode,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: accountStatus,
        tenantId,
        tenantSlug,
        tenantName
      }
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const googleLogin = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { token } = req.body

    const response = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    )
    const googleUser: any = await response.json()

    if (!googleUser.email) {
      res.status(400).json({ message: "Invalid Google token" })
      return
    }

    const user: any = await Employee.findOne({
      where: { email: String(googleUser.email).trim().toLowerCase() }
    })

    if (!user) {
      res
        .status(403)
        .json({ message: "Access denied. Account not provisioned." })
      return
    }

    const accountStatus = user.status

    if (accountStatus !== AccountStatus.ACTIVE) {
      res.status(403).json({
        message: `Account is ${accountStatus.toLowerCase()}. Please contact your administrator.`
      })
      return
    }

    const tenantCtx = getCurrentTenantContext()
    const tenantId = tenantCtx?.tenantId
    const tenantSlug = tenantCtx?.tenantSlug
    const tenantName = tenantCtx?.tenantName

    const enterpriseToken = generateToken({
      id: user.id,
      role: user.role,
      tenantId,
      tenantSlug
    })
    const refreshToken = generateRefreshToken({
      id: user.id,
      role: user.role,
      tenantId,
      tenantSlug
    })

    res.status(200).json({
      token: enterpriseToken,
      refreshToken,
      user: {
        id: user.id,
        employeeCode: user.employeeCode,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: accountStatus,
        tenantId,
        tenantSlug,
        tenantName
      }
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const refreshToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { refreshToken: token } = req.body

    if (!token) {
      res.status(400).json({ message: "Refresh token required" })
      return
    }

    const decoded = verifyRefreshToken(token)
    const newToken = generateToken({
      id: decoded.id,
      role: decoded.role,
      tenantId: decoded.tenantId || getCurrentTenantId(),
      tenantSlug: decoded.tenantSlug || getCurrentTenantSlug()
    })

    res.status(200).json({ token: newToken })
  } catch (error) {
    res.status(403).json({ message: "Invalid or expired refresh token" })
  }
}

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await Employee.findByPk(req.user?.id, {
      attributes: { exclude: ["passwordHash"] },
      include: [{ model: Department, as: "department" }]
    })

    if (!user) {
      res.status(404).json({ message: "User not found" })
      return
    }

    const tenantCtx = getCurrentTenantContext()
    res.status(200).json({
      ...user.toJSON(),
      tenantId: tenantCtx?.tenantId,
      tenantSlug: tenantCtx?.tenantSlug,
      tenantName: tenantCtx?.tenantName
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}
