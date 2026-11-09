export enum UserRole {
  EMPLOYEE = "EMPLOYEE",
  HR = "HR",
  ADMIN = "ADMIN",
  SUPER_ADMIN = "SUPER_ADMIN"
}

export enum AccountStatus {
  PENDING = "PENDING",
  ACTIVE = "ACTIVE",
  REJECTED = "REJECTED"
}

export enum AttendanceStatus {
  PRESENT = "PRESENT",
  ABSENT = "ABSENT",
  HALF_DAY = "HALF_DAY"
}

export enum TransactionType {
  ACCRUAL = "ACCRUAL",
  DEDUCTION = "DEDUCTION",
  ADJUSTMENT = "ADJUSTMENT"
}

export enum LeaveSession {
  FULL = "FULL",
  SHORT = "SHORT",
  MORNING = "MORNING",
  AFTERNOON = "AFTERNOON"
}

export enum LeaveStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED"
}
