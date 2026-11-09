import { Request, Response } from "express"
import { UniqueConstraintError } from "sequelize"
import { Branch } from "../models"
import { isValidCoordinates } from "../utils/geo.utils"
import { cacheService } from "../services/cache.service"
import { getCurrentTenantId } from "../config/tenantContext"

const validateBranch = (body: Record<string, unknown>) => {
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const latitude = Number(body.latitude)
  const longitude = Number(body.longitude)
  const radiusMeters = Number(body.radiusMeters)

  if (
    !name ||
    !isValidCoordinates(latitude, longitude) ||
    !Number.isInteger(radiusMeters) ||
    radiusMeters < 1
  ) {
    return null
  }

  return { name, latitude, longitude, radiusMeters }
}

export const getBranches = async (_req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = getCurrentTenantId()
    const branches = await cacheService.getOrSet(
      `tenant:${tenantId}:branches:all`,
      600,
      async () => {
        const rows = await Branch.findAll({ order: [["name", "ASC"]] })
        return rows.map((r) => r.toJSON())
      }
    )
    res.status(200).json(branches)
  } catch (error) {
    res.status(500).json({ message: "Failed to load branch locations." })
  }
}

export const createBranch = async (
  req: Request,
  res: Response
): Promise<void> => {
  const values = validateBranch(req.body ?? {})
  if (!values) {
    res.status(400).json({
      message: "Provide a branch name, valid coordinates, and a positive radius in meters."
    })
    return
  }

  try {
    const branch = await Branch.create(values)
    await cacheService.invalidateTenantCache(getCurrentTenantId(), "branches")
    res.status(201).json(branch)
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      res.status(409).json({ message: "A branch with that name already exists." })
      return
    }
    console.error("[branches:create]", error)
    res.status(500).json({ message: "Failed to create branch." })
  }
}

export const updateBranch = async (
  req: Request,
  res: Response
): Promise<void> => {
  const values = validateBranch(req.body ?? {})
  const isActive = req.body?.isActive
  if (!values || typeof isActive !== "boolean") {
    res.status(400).json({
      message: "Provide a branch name, valid coordinates, a positive radius, and active status."
    })
    return
  }

  try {
    const branch = await Branch.findByPk(req.params.id)
    if (!branch) {
      res.status(404).json({ message: "Branch not found." })
      return
    }

    await branch.update({ ...values, isActive })
    await cacheService.invalidateTenantCache(getCurrentTenantId(), "branches")
    res.status(200).json(branch)
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      res.status(409).json({ message: "A branch with that name already exists." })
      return
    }
    console.error("[branches:update]", error)
    res.status(500).json({ message: "Failed to update branch." })
  }
}
