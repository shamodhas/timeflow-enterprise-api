const TZ_OFFSET_MS = 5.5 * 60 * 60 * 1000
const TIMEZONE = "Asia/Colombo"

export const getLKDateString = (date: Date): string => {
  const lkTime = new Date(date.getTime() + TZ_OFFSET_MS)
  return lkTime.toISOString().split("T")[0]
}

export const getCurrentLKDateString = (): string => getLKDateString(new Date())

export const getDayBoundsUTC = (dateString: string) => {
  const baseStart = new Date(`${dateString}T00:00:00.000Z`)
  const baseEnd = new Date(`${dateString}T23:59:59.999Z`)

  return {
    startUTC: new Date(baseStart.getTime() - TZ_OFFSET_MS),
    endUTC: new Date(baseEnd.getTime() - TZ_OFFSET_MS)
  }
}

export const toLocalTime = (utcDateString: string | Date): string => {
  return new Intl.DateTimeFormat("en-LK", {
    hour: "numeric",
    minute: "numeric",
    hour12: true,
    timeZone: TIMEZONE
  }).format(new Date(utcDateString))
}

export const toLocalDate = (utcDateString: string | Date): string => {
  return new Intl.DateTimeFormat("en-LK", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: TIMEZONE
  }).format(new Date(utcDateString))
}
