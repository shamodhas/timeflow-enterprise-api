import { Department } from "./Department"
import { Employee } from "./Employee"
import { Attendance } from "./Attendance"
import { LeaveType } from "./LeaveType"
import { LeaveRequest } from "./LeaveRequest"
import { LeaveLedger } from "./LeaveLedger"
import { Branch } from "./Branch"
import { Holiday } from "./Holiday"
import { getActiveSequelize } from "../config/database"

Department.hasMany(Employee, { foreignKey: "departmentId", as: "employees" })
Employee.belongsTo(Department, { foreignKey: "departmentId", as: "department" })

Employee.hasMany(Attendance, { foreignKey: "employeeId", as: "attendanceLogs" })
Attendance.belongsTo(Employee, { foreignKey: "employeeId", as: "employee" })

Branch.hasMany(Attendance, { foreignKey: "branchId", as: "clockInAttendance" })
Branch.hasMany(Attendance, { foreignKey: "clockOutBranchId", as: "clockOutAttendance" })
Attendance.belongsTo(Branch, { foreignKey: "branchId", as: "branch" })
Attendance.belongsTo(Branch, { foreignKey: "clockOutBranchId", as: "clockOutBranch" })

LeaveType.hasMany(LeaveRequest, {
  foreignKey: "leaveTypeId",
  as: "leaveRequests"
})
LeaveRequest.belongsTo(LeaveType, {
  foreignKey: "leaveTypeId",
  as: "leaveType"
})

Employee.hasMany(LeaveRequest, {
  foreignKey: "employeeId",
  as: "leaveRequests"
})
LeaveRequest.belongsTo(Employee, { foreignKey: "employeeId", as: "employee" })
LeaveRequest.belongsTo(Employee, {
  foreignKey: "actingEmployeeId",
  as: "actingEmployee"
})

Employee.hasMany(LeaveLedger, { foreignKey: "employeeId", as: "leaveLedger" })
LeaveLedger.belongsTo(Employee, { foreignKey: "employeeId", as: "employee" })

LeaveType.hasMany(LeaveLedger, { foreignKey: "leaveTypeId", as: "leaveLedger" })
LeaveLedger.belongsTo(LeaveType, { foreignKey: "leaveTypeId", as: "leaveType" })

/**
 * Dynamically bind each Model's `.sequelize` reference to the active tenant's
 * isolated connection pool stored in AsyncLocalStorage.
 */
const tenantModels = [
  Department,
  Employee,
  Attendance,
  Branch,
  LeaveType,
  LeaveRequest,
  LeaveLedger,
  Holiday
]

for (const ModelClass of tenantModels) {
  Object.defineProperty(ModelClass, "sequelize", {
    get: () => getActiveSequelize(),
    configurable: true
  })
}

export {
  Department,
  Employee,
  Attendance,
  Branch,
  LeaveType,
  LeaveRequest,
  LeaveLedger,
  Holiday
}
