import type { Branch } from "../models/Branch"
import { calculateDistanceMeters, isValidCoordinates } from "../utils/geo.utils"

export interface LocationVerificationResult {
  isVerified: boolean
  distanceMeters: number | null
  userLat: number | null
  userLng: number | null
  message: string
  branchId: string | null
  branchName: string | null
}

export class LocationVerificationError extends Error {}

export class LocationService {
  public static verifyLocation(
    latitude?: number | string,
    longitude?: number | string,
    branches: Branch[] = []
  ): LocationVerificationResult {
    if (!isValidCoordinates(latitude, longitude)) {
      throw new LocationVerificationError(
        "GPS location is required. Please enable location access."
      )
    }

    const lat = Number(latitude)
    const lng = Number(longitude)
    const closest = branches
      .map((branch) => ({
        branch,
        distance: calculateDistanceMeters(
          lat,
          lng,
          Number(branch.latitude),
          Number(branch.longitude)
        )
      }))
      .sort((left, right) => left.distance - right.distance)[0]

    if (!closest || closest.distance > closest.branch.radiusMeters) {
      const distance = closest ? `${closest.distance}m from ${closest.branch.name}` : "no active branches configured"
      throw new LocationVerificationError(
        `You are outside all branch locations (${distance}). Submit an approved location exception request to clock in or out.`
      )
    }

    return {
      isVerified: true,
      distanceMeters: closest.distance,
      userLat: lat,
      userLng: lng,
      message: `Verified within ${closest.branch.name} perimeter (${closest.distance}m away).`,
      branchId: closest.branch.id,
      branchName: closest.branch.name
    }
  }
}
