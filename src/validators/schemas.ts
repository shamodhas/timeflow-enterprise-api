import { z } from "zod"

export const leaveRequestSchema = z.object({
  leaveTypeId: z.string().uuid({ message: "Invalid Leave Type ID" }),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Format must be YYYY-MM-DD" }),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Format must be YYYY-MM-DD" }),
  totalDays: z.number().positive().optional(),
  session: z.enum(["FULL", "SHORT", "MORNING", "AFTERNOON"]),
  reason: z.string().trim().min(1, { message: "Reason is required" }),
  actingEmployeeId: z.string().uuid().nullable().optional()
})
