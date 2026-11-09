import { Request, Response } from "express"
import { Department } from "../models"

export const createDepartment = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name } = req.body
    const department = await Department.create({ name })
    res.status(201).json(department)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}

export const getDepartments = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const departments = await Department.findAll()
    res.status(200).json(departments)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
}
