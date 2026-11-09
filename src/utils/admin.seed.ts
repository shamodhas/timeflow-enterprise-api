import { Employee } from "../models"
import { AccountStatus, UserRole } from "../types/database.enums"
import { hashPassword } from "./password"

export const seedSuperAdmin = async (): Promise<void> => {
  try {
    const adminExists = await Employee.findOne({
      where: { role: "SUPER_ADMIN" }
    })
    if (adminExists) return

    const passwordHash = await hashPassword(
      process.env.DEFAULT_ADMIN_PASSWORD || "123456"
    )

    await Employee.create({
      employeeCode: "ADM-001",
      fullName: "Shamodha Sahan",
      email: "shamodha7@gmail.com",
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      status: AccountStatus.ACTIVE
    })

    console.log("✅ Super Admin provisioned: shamodha7@gmail.com")
  } catch (error) {
    console.error("❌ Failed to seed Super Admin:", error)
  }
}
