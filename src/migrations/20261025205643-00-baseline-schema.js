'use strict'

// Note: Verify these ENUM arrays match your exact TypeScript enum string values.
const UserRole = ['SUPER_ADMIN', 'ADMIN', 'EMPLOYEE']
const AccountStatus = ['PENDING', 'ACTIVE', 'INACTIVE']
const LeaveSession = ['FULL', 'HALF_MORNING', 'HALF_EVENING', 'SHORT']
const LeaveStatus = ['PENDING', 'APPROVED', 'REJECTED']
const TransactionType = ['ACCRUAL', 'DEDUCTION']
const AttendanceStatus = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'HALF_DAY',
  'MISSED_PUNCH'
]

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Departments[cite: 3]
    await queryInterface.createTable('departments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: { type: Sequelize.STRING, allowNull: false, unique: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })

    // 2. Branches[cite: 2]
    await queryInterface.createTable('branches', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: { type: Sequelize.STRING, allowNull: false, unique: true },
      latitude: { type: Sequelize.DOUBLE, allowNull: false },
      longitude: { type: Sequelize.DOUBLE, allowNull: false },
      radius_meters: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 500
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })

    // 3. Leave Types[cite: 8]
    await queryInterface.createTable('leave_types', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: { type: Sequelize.STRING, allowNull: false, unique: true },
      default_quota: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })

    // 4. Employees[cite: 4]
    await queryInterface.createTable('employees', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      employee_code: { type: Sequelize.STRING, allowNull: false, unique: true },
      department_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'departments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      full_name: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      password_hash: { type: Sequelize.STRING, allowNull: false },
      role: { type: Sequelize.ENUM(...UserRole), defaultValue: 'EMPLOYEE' },
      status: {
        type: Sequelize.ENUM(...AccountStatus),
        defaultValue: 'PENDING'
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })

    // 5. Attendance Logs[cite: 1]
    await queryInterface.createTable('attendance_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      clock_in: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      clock_out: { type: Sequelize.DATE, allowNull: true },
      status: {
        type: Sequelize.ENUM(...AttendanceStatus),
        allowNull: false,
        defaultValue: 'PRESENT'
      },
      latitude: { type: Sequelize.DOUBLE, allowNull: true },
      longitude: { type: Sequelize.DOUBLE, allowNull: true },
      distance_meters: { type: Sequelize.INTEGER, allowNull: true },
      location_verified: { type: Sequelize.BOOLEAN, allowNull: true },
      branch_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      clock_out_latitude: { type: Sequelize.DOUBLE, allowNull: true },
      clock_out_longitude: { type: Sequelize.DOUBLE, allowNull: true },
      clock_out_distance_meters: { type: Sequelize.INTEGER, allowNull: true },
      clock_out_location_verified: { type: Sequelize.BOOLEAN, allowNull: true },
      clock_out_branch_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'branches', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      clock_in_location_failure_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      clock_in_location_failed_at: { type: Sequelize.DATE, allowNull: true },
      clock_out_location_failure_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      clock_out_location_failed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })

    // 6. Leave Requests[cite: 7]
    await queryInterface.createTable('leave_requests', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      leave_type_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'leave_types', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      start_date: { type: Sequelize.DATEONLY, allowNull: false },
      end_date: { type: Sequelize.DATEONLY, allowNull: false },
      total_days: { type: Sequelize.DECIMAL(4, 1), allowNull: false },
      session: { type: Sequelize.ENUM(...LeaveSession), defaultValue: 'FULL' },
      reason: { type: Sequelize.TEXT, allowNull: true },
      status: { type: Sequelize.ENUM(...LeaveStatus), defaultValue: 'PENDING' },
      approved_by: { type: Sequelize.UUID, allowNull: true },
      acting_employee_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })

    // 7. Leave Ledger[cite: 6]
    await queryInterface.createTable('leave_ledger', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'employees', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      leave_type_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'leave_types', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      transaction_type: {
        type: Sequelize.ENUM(...TransactionType),
        allowNull: false
      },
      amount: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      reference_id: { type: Sequelize.UUID, allowNull: true },
      transaction_date: {
        type: Sequelize.DATEONLY,
        defaultValue: Sequelize.NOW
      },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    })
  },

  down: async (queryInterface, Sequelize) => {
    // Drop in reverse order to prevent foreign key constraint violations[cite: 5]
    await queryInterface.dropTable('leave_ledger')
    await queryInterface.dropTable('leave_requests')
    await queryInterface.dropTable('attendance_logs')
    await queryInterface.dropTable('employees')
    await queryInterface.dropTable('leave_types')
    await queryInterface.dropTable('branches')
    await queryInterface.dropTable('departments')

    // Manually drop custom ENUM types from PostgreSQL
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_employees_role";'
    )
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_employees_status";'
    )
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_leave_requests_session";'
    )
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_leave_requests_status";'
    )
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_attendance_logs_status";'
    )
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_leave_ledger_transaction_type";'
    )
  }
}
