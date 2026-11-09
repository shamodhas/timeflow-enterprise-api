import { Optional } from "sequelize"
import {
  AccountStatus,
  AttendanceStatus,
  LeaveSession,
  LeaveStatus,
  TransactionType,
  UserRole
} from "./database.enums"

export interface EmployeeAttributes {
  id: string
  employeeCode: string
  departmentId: string | null
  fullName: string
  email: string
  passwordHash: string
  role: UserRole
  status: AccountStatus
  createdAt?: Date
  updatedAt?: Date
}
export interface EmployeeCreationAttributes extends Optional<
  EmployeeAttributes,
  "id" | "role" | "status"
> {}

export interface DepartmentAttributes {
  id: string
  name: string
  createdAt?: Date
  updatedAt?: Date
}
export interface DepartmentCreationAttributes extends Optional<
  DepartmentAttributes,
  "id"
> {}

export interface AttendanceAttributes {
  id: string
  employeeId: string
  clockIn: Date
  clockOut: Date | null
  status: AttendanceStatus
  latitude: number | null
  longitude: number | null
  distanceMeters: number | null
  locationVerified: boolean | null
  branchId: string | null
  clockOutLatitude: number | null
  clockOutLongitude: number | null
  clockOutDistanceMeters: number | null
  clockOutLocationVerified: boolean | null
  clockOutBranchId: string | null
  clockInLocationFailureReason: string | null
  clockInLocationFailedAt: Date | null
  clockOutLocationFailureReason: string | null
  clockOutLocationFailedAt: Date | null
  createdAt?: Date
  updatedAt?: Date
}

export interface AttendanceCreationAttributes extends Optional<
  AttendanceAttributes,
  | "id"
  | "clockIn"
  | "clockOut"
  | "status"
  | "latitude"
  | "longitude"
  | "distanceMeters"
  | "locationVerified"
  | "branchId"
  | "clockOutLatitude"
  | "clockOutLongitude"
  | "clockOutDistanceMeters"
  | "clockOutLocationVerified"
  | "clockOutBranchId"
  | "clockInLocationFailureReason"
  | "clockInLocationFailedAt"
  | "clockOutLocationFailureReason"
  | "clockOutLocationFailedAt"
  | "createdAt"
  | "updatedAt"
> {}

export interface ClockInPayload {
  latitude?: number
  longitude?: number
  locationFailureReason?: string
  occurredAt?: string
}

export interface BranchAttributes {
  id: string
  name: string
  latitude: number
  longitude: number
  radiusMeters: number
  isActive: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface BranchCreationAttributes extends Optional<
  BranchAttributes,
  "id" | "isActive" | "createdAt" | "updatedAt"
> {}


export interface LeaveTypeAttributes {
  id: string
  name: string
  defaultQuota: number
  createdAt?: Date
  updatedAt?: Date
}
export interface LeaveTypeCreationAttributes extends Optional<
  LeaveTypeAttributes,
  "id"
> {}

export interface LeaveRequestAttributes {
  id: string
  employeeId: string
  leaveTypeId: string
  startDate: Date
  endDate: Date
  totalDays: number
  session: LeaveSession
  reason: string
  status: LeaveStatus
  approvedBy: string | null
  actingEmployeeId: string | null
}
export interface LeaveRequestCreationAttributes extends Optional<
  LeaveRequestAttributes,
  "id" | "session" | "status" | "actingEmployeeId"
> {}

export interface LeaveLedgerAttributes {
  id: string
  employeeId: string
  leaveTypeId: string
  transactionType: TransactionType
  amount: number
  referenceId: string | null
  transactionDate: Date
  createdAt?: Date
  updatedAt?: Date
}

export interface LeaveLedgerCreationAttributes extends Optional<
  LeaveLedgerAttributes,
  "id" | "transactionDate"
> {}
