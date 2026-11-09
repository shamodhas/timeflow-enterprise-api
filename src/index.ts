import dotenv from "dotenv"
dotenv.config()

import express, { Application, NextFunction, Request, Response } from "express"
import cors from "cors"
import helmet from "helmet"
import rateLimit from "express-rate-limit"
import { sequelize } from "./config/database"
import { seedSuperAdmin } from "./utils/admin.seed"
import "./models"

import authRoutes from "./routes/auth.routes"
import departmentRoutes from "./routes/department.routes"
import employeeRoutes from "./routes/employee.routes"
import attendanceRoutes from "./routes/attendance.routes"
import leaveRoutes from "./routes/leave.routes"
import reportRoutes from "./routes/report.routes"
import importRoutes from "./routes/import.routes"
import dashboardRoutes from "./routes/dashboard.routes"
import branchRoutes from "./routes/branch.routes"
import holidayRoutes from "./routes/holiday.routes"

const app: Application = express()
const PORT = process.env.PORT || 3000

app.set("trust proxy", 1)
app.use(helmet())

const rateLimitMax = Number(
  process.env.API_RATE_LIMIT_MAX ??
    (process.env.NODE_ENV === "production" ? 300 : 5000)
)

if (!Number.isInteger(rateLimitMax) || rateLimitMax < 1) {
  throw new Error("API_RATE_LIMIT_MAX must be a positive integer.")
}

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: rateLimitMax,
  skip: (req) =>
    process.env.NODE_ENV !== "production" || req.method === "OPTIONS",
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    code: "RATE_LIMIT_EXCEEDED",
    message: "Too many API requests. Please wait before trying again."
  }
})
app.use("/api/", limiter)

const allowedOrigins = [
  "http://localhost:5173",
  "https://timeflow-eight-sandy.vercel.app",
  "https://timeflow.ijse.shamodha.com",
  process.env.FRONTEND_URL
].filter(Boolean) as string[]

app.use(
  cors({
    origin: (origin, callback) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.includes("ngrok-free.app") ||
        origin.includes("loca.lt")
      ) {
        callback(null, true)
      } else {
        callback(new Error("Not allowed by CORS"))
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "bypass-tunnel-reminder"]
  })
)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Developed-By", "shamodha.com")
  res.setHeader("X-Company", "IJSE - Institute of Software Engineering")
  next()
})

app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    status: "UP",
    name: "IJSE HRM and Attendance API",
    organization: "Institute of Software Engineering",
    developer: "shamodha.com",
    developerUrl: "https://shamodha.com",
    version: "1.0.0"
  })
})

app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "UP",
    service: "IJSE HRM and Attendance API",
    organization: "Institute of Software Engineering",
    developer: "shamodha.com",
    developerUrl: "https://shamodha.com"
  })
})

app.use("/api/v1/auth", authRoutes)
app.use("/api/v1/departments", departmentRoutes)
app.use("/api/v1/employees", employeeRoutes)
app.use("/api/v1/attendance", attendanceRoutes)
app.use("/api/v1/leaves", leaveRoutes)
app.use("/api/v1/reports", reportRoutes)
app.use("/api/v1/import", importRoutes)
app.use("/api/v1/dashboard", dashboardRoutes)
app.use("/api/v1/branches", branchRoutes)
app.use("/api/v1/holidays", holidayRoutes)

app.use("*", (req: Request, res: Response) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` })
})

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error("[Global Error]", err.stack)

  const isProduction = process.env.NODE_ENV === "production"
  const errorMessage = isProduction ? "Internal Server Error" : err.message

  res.status(err.status || 500).json({
    message: "Something went wrong!",
    error: errorMessage
  })
})

const startServer = async () => {
  try {
    await sequelize.authenticate()
    console.log("[DB] PostgreSQL connected successfully.")

    // await sequelize.sync({ force: true });

    // await sequelize.sync({ alter: true });
    // console.log("[DB] Database tables synchronized.");

    await seedSuperAdmin()

    app.listen(PORT, () => {
      console.log(`[API] Server listening on port ${PORT}`)
    })
  } catch (error) {
    console.error("[DB] Connection error:", error)
    process.exit(1)
  }
}

startServer()
