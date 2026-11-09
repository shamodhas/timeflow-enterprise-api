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
      email,
      passwordHash,
      role: role || UserRole.EMPLOYEE,
      status: AccountStatus.PENDING,
      departmentId: departmentId || null
    })

    await grantInitialLeaves(newEmployee.id, null)

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

    // 1. Token eka valid da kiyala balanna
    let decoded: any
    try {
      decoded = verifyInviteToken(token)
    } catch (err) {
      res.status(400).json({ message: "Invalid or expired invitation link." })
      return
    }

    // 2. Employee wa database eken ganna
    const employee: any = await Employee.findByPk(decoded.id)

    if (!employee) {
      res.status(404).json({ message: "Employee not found." })
      return
    }

    if (employee.status === AccountStatus.ACTIVE) {
      res.status(400).json({ message: "Account is already active. Please login." })
      return
    }

    // 3. Aluth Password eka hash karala account eka ACTIVE karanawa
    const passwordHash =await hashPassword(password)

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

    const user: any = await Employee.findOne({ where: { email } })

    if (!user) {
      res.status(401).json({ message: "Invalid credentials" })
      return
    }

    const accountStatus = user.status
    console.log(accountStatus, AccountStatus.ACTIVE)

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

    const token = generateToken({ id: user.id, role: user.role })
    const refreshToken = generateRefreshToken({ id: user.id, role: user.role })

    res.status(200).json({
      token,
      refreshToken,
      user: {
        id: user.id,
        employeeCode: user.employeeCode,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: accountStatus
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
      where: { email: googleUser.email }
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

    const enterpriseToken = generateToken({ id: user.id, role: user.role })
    const refreshToken = generateRefreshToken({ id: user.id, role: user.role })

    res.status(200).json({
      token: enterpriseToken,
      refreshToken,
      user: {
        id: user.id,
        employeeCode: user.employeeCode,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        status: accountStatus
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
    const newToken = generateToken({ id: decoded.id, role: decoded.role })

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

    res.status(200).json(user)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}
