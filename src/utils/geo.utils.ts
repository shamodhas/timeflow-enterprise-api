/**
 * Geographical calculation utilities (Separation of Concerns).
 */

/**
 * Calculates the great-circle distance between two geographic coordinates in meters
 * using the standard Haversine formula.
 *
 * @param lat1 Latitude of point 1 in degrees
 * @param lon1 Longitude of point 1 in degrees
 * @param lat2 Latitude of point 2 in degrees
 * @param lon2 Longitude of point 2 in degrees
 * @returns Distance in meters rounded to the nearest integer
 */
export const calculateDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371000 // Earth's mean radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c)
}

/**
 * Validates whether latitude and longitude are valid finite geographic coordinates.
 */
export const isValidCoordinates = (lat?: any, lon?: any): boolean => {
  if (lat === null || lat === undefined || lon === null || lon === undefined) {
    return false
  }

  const numLat = Number(lat)
  const numLon = Number(lon)

  if (isNaN(numLat) || isNaN(numLon)) {
    return false
  }

  if (numLat < -90 || numLat > 90) {
    return false
  }

  if (numLon < -180 || numLon > 180) {
    return false
  }

  return true
}

