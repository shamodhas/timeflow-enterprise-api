import nodemailer from "nodemailer"

const EMAIL_USER = process.env.EMAIL_USER || "shamodha7@gmail.com"
const EMAIL_PASS = process.env.EMAIL_PASS || "njtm bflh bibc ftqj"
const FRONTEND_URL = process.env.FRONTEND_URL || "https://timeflow.ijse.shamodha.com"

// Reusable Transporter setup eka
const getTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  })
}

interface MailOptions {
  to: string
  subject: string
  html: string
}

export const sendEmail = async ({ to, subject, html }: MailOptions): Promise<void> => {
  try {
    if (!EMAIL_USER || !EMAIL_PASS) {
      console.warn("Email credentials not configured. Skipping email to:", to)
      return
    }
    const transporter = getTransporter()
    await transporter.sendMail({
      from: `"TimeFlow HR" <${EMAIL_USER}>`,
      to,
      subject,
      html
    })
  } catch (error) {
    console.warn("Failed to send email to:", to, error)
  }
}

export const sendInviteEmail = async (
  to: string,
  fullName: string,
  employeeCode: string,
  inviteToken: string
): Promise<void> => {
  const inviteLink = `${FRONTEND_URL}/auth/invite/register?token=${inviteToken}`

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
      <h2 style="color: #111827;">Welcome to TimeFlow ERP, ${fullName}!</h2>
      <p style="color: #4b5563;">Your HR department has created an account for you.</p>
      <p style="color: #4b5563;">Your Employee Code is: <b style="color: #111827;">${employeeCode}</b></p>
      
      <div style="margin: 30px 0;">
        <a href="${inviteLink}" style="display:inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
          Activate Account
        </a>
      </div>
      
      <p style="color: #6b7280; font-size: 12px;">This activation link is valid for 3 days. If you did not expect this invitation, please contact your administrator.</p>
    </div>
  `

  await sendEmail({
    to,
    subject: "Welcome to TimeFlow! Set up your account",
    html
  })
}

/**
 * Notifies HR, ADMIN, and SUPER_ADMIN when an employee's attendance
 * location verification fails.
 */
export const notifyAdminsOfLocationFailure = async ({
  adminEmails,
  employeeName,
  employeeCode,
  action,
  time,
  distanceMeters,
  branchName,
  reason
}: {
  adminEmails: string[]
  employeeName: string
  employeeCode: string
  action: "Clock In" | "Clock Out"
  time: string
  distanceMeters: number | null
  branchName: string | null
  reason: string | null
}): Promise<void> => {
  if (!adminEmails || adminEmails.length === 0) return

  const distanceText =
    distanceMeters !== null
      ? `${distanceMeters}m away from ${branchName || "closest branch"}`
      : "No valid GPS coordinates provided"

  const statusText = reason
    ? `<span style="color: #0369a1; font-weight: bold;">Reason submitted:</span> "${reason}"`
    : `<span style="color: #b91c1c; font-weight: bold;">Action Required:</span> Reason is pending from employee`

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #f87171; border-radius: 8px;">
      <h2 style="color: #991b1b; margin-top: 0;">⚠️ Attendance Location Verification Alert</h2>
      <p style="color: #374151;">An employee recorded attendance outside approved branch perimeters:</p>
      <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
        <tr><td style="padding: 6px 0; color: #6b7280; width: 140px;">Employee:</td><td style="font-weight: bold; color: #111827;">${employeeName} (${employeeCode})</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Action:</td><td style="font-weight: bold; color: #111827;">${action}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Time:</td><td style="color: #111827;">${time}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Location:</td><td style="color: #b91c1c; font-weight: 600;">${distanceText}</td></tr>
        <tr><td style="padding: 6px 0; color: #6b7280;">Status:</td><td>${statusText}</td></tr>
      </table>
      <p style="color: #6b7280; font-size: 13px;">This record is available on your Admin / HR Dashboard under Location Verification Failures.</p>
    </div>
  `

  for (const email of adminEmails) {
    await sendEmail({
      to: email,
      subject: `[Alert] Location Verification Failed: ${employeeName} (${action})`,
      html
    })
  }
}

/**
 * Notifies the employee that their attendance location was outside
 * branch bounds and requests them to submit a reason.
 */
export const notifyEmployeeToFillReason = async ({
  employeeEmail,
  employeeName,
  action,
  time,
  distanceMeters,
  branchName
}: {
  employeeEmail: string
  employeeName: string
  action: "Clock In" | "Clock Out"
  time: string
  distanceMeters: number | null
  branchName: string | null
}): Promise<void> => {
  if (!employeeEmail) return

  const distanceText =
    distanceMeters !== null
      ? `${distanceMeters}m from ${branchName || "office branch"}`
      : "outside approved office perimeters"

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fde047; border-radius: 8px;">
      <h2 style="color: #854d0e; margin-top: 0;">⚠️ Action Required: Attendance Location Notice</h2>
      <p style="color: #374151;">Dear ${employeeName},</p>
      <p style="color: #374151;">
        Your recent <b>${action}</b> at <b>${time}</b> was recorded ${distanceText}.
      </p>
      <p style="color: #374151; background: #fefce8; padding: 12px; border-radius: 6px; border: 1px solid #fef08a;">
        Please open the TimeFlow app or web dashboard and submit a reason for clocking outside the branch perimeter so your attendance can be reviewed by HR.
      </p>
      <p style="color: #6b7280; font-size: 12px;">TimeFlow Enterprise HRM Automated Notification</p>
    </div>
  `

  await sendEmail({
    to: employeeEmail,
    subject: `Action Required: Please provide reason for ${action} location exception`,
    html
  })
}

/**
 * Notifies Admins when an employee submits their failure reason later.
 */
export const notifyAdminsReasonSubmitted = async ({
  adminEmails,
  employeeName,
  employeeCode,
  action,
  time,
  reason
}: {
  adminEmails: string[]
  employeeName: string
  employeeCode: string
  action: "Clock In" | "Clock Out"
  time: string
  reason: string
}): Promise<void> => {
  if (!adminEmails || adminEmails.length === 0) return

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #93c5fd; border-radius: 8px;">
      <h2 style="color: #1e40af; margin-top: 0;">Location Exception Reason Submitted</h2>
      <p style="color: #374151;">Employee <b>${employeeName} (${employeeCode})</b> has submitted a reason for their ${action} on ${time}:</p>
      <blockquote style="margin: 16px 0; padding: 12px 16px; background: #eff6ff; border-left: 4px solid #3b82f6; color: #1e3a8a; font-style: italic;">
        "${reason}"
      </blockquote>
      <p style="color: #6b7280; font-size: 13px;">You can review this in the TimeFlow Admin / HR Dashboard.</p>
    </div>
  `

  for (const email of adminEmails) {
    await sendEmail({
      to: email,
      subject: `Reason Submitted: ${employeeName} - ${action} Location Exception`,
      html
    })
  }
}
