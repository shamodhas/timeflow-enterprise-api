import { Response } from "express"
import { Holiday } from "../models/Holiday"
import { AuthRequest } from "../middlewares/authenticate"
import { cacheService } from "../services/cache.service"
import { getCurrentTenantId } from "../config/tenantContext"

export const getHolidays = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const tenantId = getCurrentTenantId()
    const holidays = await cacheService.getOrSet(
      `tenant:${tenantId}:holidays`,
      600,
      async () => {
        const rows = await Holiday.findAll({ order: [["date", "ASC"]] })
        return rows.map((r) => r.toJSON())
      }
    )
    res.status(200).json(holidays)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

export const createHoliday = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const name = String(req.body.name || "").trim()
    const date = String(req.body.date || "")
    if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ message: "Name and a valid date are required." })
      return
    }
    if (await Holiday.findOne({ where: { date } })) {
      res.status(400).json({ message: "A holiday already exists on this date." })
      return
    }
    const holiday = await Holiday.create({ name, date })
    await cacheService.invalidateTenantCache(getCurrentTenantId(), "holidays")
    res.status(201).json(holiday)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

export const deleteHoliday = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const deleted = await Holiday.destroy({ where: { id: req.params.id } })
    if (!deleted) {
      res.status(404).json({ message: "Holiday not found." })
      return
    }
    await cacheService.invalidateTenantCache(getCurrentTenantId(), "holidays")
    res.status(200).json({ message: "Holiday deleted." })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}
