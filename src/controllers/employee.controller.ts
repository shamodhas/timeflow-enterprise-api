import { Request, Response } from "express"
import { Employee, Department, LeaveLedger, LeaveType } from "../models"
import { sequelize } from "../config/database"
import { AccountStatus, TransactionType } from "../types/database.enums"
import { AuthRequest } from "../middlewares/authenticate"
import { generateInviteToken } from "../utils/jwt"
import { sendInviteEmail } from "../utils/email"
import { hashPassword } from "../utils/password"
import { grantInitialLeaves } from "../utils/leave.grant"
import { getCurrentTenantId, getCurrentTenantSlug } from "../config/tenantContext"
import { registerUserInMasterLookup } from "../services/tenantProvisioner.service"
import { cacheService } from "../services/cache.service"

export const createEmployee = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const t = await sequelize.transaction()
  try {
    const {
      employeeCode,
      fullName,
      email,
      password,
      role,
      departmentId,
      initialLeaves
    } = req.body

    const hashedPassword = await hashPassword(password || "Default@123")

    const newEmployee: any = await Employee.create(
      {
        employeeCode,
        fullName,
        email,
        passwordHash: hashedPassword,
        role: role || "EMPLOYEE",
        departmentId: departmentId || null
      },
      { transaction: t }
    )

    await grantInitialLeaves(newEmployee.id, initialLeaves, t)

    await t.commit()

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

    res.status(201).json({
      message: "Employee and initial leave balances created successfully.",
      employee: newEmployee
    })
  } catch (error: any) {
    await t.rollback()
    res.status(500).json({ error: error.message })
  }
}

export const inviteEmployee = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  const t = await sequelize.transaction()
  try {
    const { employeeCode, fullName, email, role, departmentId, initialLeaves } =
      req.body

    const existingEmployee = await Employee.findOne({ where: { email } })
    if (existingEmployee) {
      res
        .status(400)
        .json({ message: "Employee with this email already exists" })
      return
    }

    const tempPasswordHash = await hashPassword("Default@123")

    const newEmployee: any = await Employee.create(
      {
        employeeCode,
        fullName,
        email,
        passwordHash: tempPasswordHash,
        role: role || "EMPLOYEE",
        departmentId: departmentId || null,
        status: AccountStatus.PENDING
      },
      { transaction: t }
    )

    await grantInitialLeaves(newEmployee.id, initialLeaves, t)

    const tenantId = getCurrentTenantId()
    const tenantSlug = getCurrentTenantSlug()

    const inviteToken = generateInviteToken({
      id: newEmployee.id,
      email: newEmployee.email,
      tenantId,
      tenantSlug
    })

    await sendInviteEmail(email, fullName, employeeCode, inviteToken)

    await t.commit()

    if (tenantId && tenantId !== "default") {
      await registerUserInMasterLookup({
        email: newEmployee.email,
        tenantId,
        tenantSlug,
        role: newEmployee.role
      })
      await cacheService.invalidateTenantCache(tenantId, "dashboard")
    }

    res.status(201).json({
      message: "Employee invited successfully. Invitation email sent.",
      employee: newEmployee
    })
  } catch (error: any) {
    await t.rollback()
    res.status(500).json({ error: error.message })
  }
}

export const getEmployees = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const employees = await Employee.findAll({
      attributes: { exclude: ["passwordHash"] },
      include: [{ model: Department, as: "department" }]
    })
    res.status(200).json(employees)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const updateEmployee = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params
    const { employeeCode, fullName, email, role, departmentId } = req.body


    const employee: any = await Employee.findByPk(id)
    if (!employee) {
      res.status(404).json({ message: "Employee not found." })
      return
    }

    await Employee.update(
      {
        employeeCode: employeeCode || employee.employeeCode,
        fullName: fullName || employee.fullName,
        email: email || employee.email,
        role: role || employee.role,
        departmentId:
          departmentId !== undefined
            ? departmentId
            : employee.departmentId
      },
      { where: { id } }
    )

    const updatedEmployee = await Employee.findByPk(id, {
      attributes: { exclude: ["passwordHash"] }
    })

    res.status(200).json({
      message: "Employee updated successfully.",
      employee: updatedEmployee
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const deleteEmployee = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params
    const employee = await Employee.findByPk(id)

    if (!employee) {
      res.status(404).json({ message: "Employee not found." })
      return
    }

    await Employee.destroy({ where: { id } })
    res.status(200).json({ message: "Employee deleted successfully." })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const getPendingEmployees = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const pending = await Employee.findAll({
      where: { status: AccountStatus.PENDING },
      attributes: [
        "id",
        "employeeCode",
        "fullName",
        "email",
        "role",
        "createdAt"
      ]
    })
    res.status(200).json(pending)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const updateEmployeeStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params
    const { status, role } = req.body

    const employee = await Employee.findByPk(id)
    if (!employee) {
      res.status(404).json({ message: "Employee not found." })
      return
    }

    await Employee.update(
      {
        status: status as AccountStatus,
        ...(role && { role })
      },
      { where: { id } }
    )

    res.status(200).json({ message: `Employee status updated to ${status}.` })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}
