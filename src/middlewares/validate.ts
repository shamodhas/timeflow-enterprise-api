import { Request, Response, NextFunction } from "express"
import { ZodTypeAny } from "zod"

export const validate = (schema: ZodTypeAny) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body)

    if (!result.success) {
      res.status(400).json({ errors: result.error.issues })
      return
    }

    req.body = result.data
    next()
  }
}
