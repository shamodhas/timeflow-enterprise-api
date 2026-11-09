import bcrypt from "bcrypt"

const SALT_ROUNDS = 10

export const hashPassword = async (password: string): Promise<string> => {
  return await bcrypt.hash(password, SALT_ROUNDS)
}

export const comparePassword = async (
  plainText: string,
  hash: string
): Promise<boolean> => {
  return await bcrypt.compare(plainText, hash)
}

export const generateTempPasswordHash = async (): Promise<string> => {
  const randomString = Math.random().toString(36).slice(-10)
  return await bcrypt.hash(randomString, SALT_ROUNDS)
}