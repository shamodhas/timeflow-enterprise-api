import crypto from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16

const getMasterKey = (): Buffer => {
  const rawSecret =
    process.env.TENANT_ENCRYPTION_KEY ||
    process.env.JWT_ENCRIPTION_SECRET ||
    "timeflow-enterprise-master-encryption-key-2026"
  return crypto.createHash("sha256").update(rawSecret).digest()
}

export const encryptConnectionUrl = (plainUrl: string): string => {
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = getMasterKey()
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plainUrl, "utf8"),
    cipher.final()
  ])
  const authTag = cipher.getAuthTag()

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`
}

export const decryptConnectionUrl = (encryptedPayload: string): string => {
  if (
    encryptedPayload.startsWith("postgres://") ||
    encryptedPayload.startsWith("postgresql://")
  ) {
    return encryptedPayload
  }

  const parts = encryptedPayload.split(":")
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted database connection payload format.")
  }

  const [ivHex, authTagHex, cipherHex] = parts
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")
  const encryptedText = Buffer.from(cipherHex, "hex")
  const key = getMasterKey()

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(encryptedText),
    decipher.final()
  ])
  return decrypted.toString("utf8")
}

export const maskConnectionUrl = (rawUrl: string): string => {
  try {
    const parsed = new URL(rawUrl)
    if (parsed.password) {
      parsed.password = "********"
    }
    return parsed.toString()
  } catch {
    return "postgresql://****:****@<hidden-host>/db"
  }
}
