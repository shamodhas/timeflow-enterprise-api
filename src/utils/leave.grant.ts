import { LeaveLedger, LeaveType } from "../models"
import { TransactionType } from "../types/database.enums"

const FALLBACK_TOTAL_LEAVES = 14

// Grants explicit amounts if given, else each leave type's default quota.
export const grantInitialLeaves = async (
  employeeId: string,
  initialLeaves: any,
  transaction?: any
): Promise<void> => {
  const given: Record<string, any> =
    initialLeaves && typeof initialLeaves === "object" ? initialLeaves : {}
  let entries: [string, number][] = Object.entries(given)
    .map(([id, v]) => [id, Number(v)] as [string, number])
    .filter(([, v]) => v > 0)

  if (entries.length === 0) {
    const types: any[] = await LeaveType.findAll({ transaction })
    entries = types
      .map((t) => [t.id, Number(t.defaultQuota || 0)] as [string, number])
      .filter(([, v]) => v > 0)
  }

  if (entries.length === 0) {
    const [annual]: any[] = await LeaveType.findOrCreate({
      where: { name: "Annual" },
      defaults: { name: "Annual", defaultQuota: FALLBACK_TOTAL_LEAVES },
      transaction
    })
    entries = [[annual.id, FALLBACK_TOTAL_LEAVES]]
  }

  for (const [leaveTypeId, amount] of entries) {
    await LeaveLedger.create(
      {
        employeeId,
        leaveTypeId,
        amount,
        transactionType: TransactionType.ACCRUAL
      },
      { transaction }
    )
  }
}
