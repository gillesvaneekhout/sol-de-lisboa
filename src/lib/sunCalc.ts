import SunCalc from "suncalc";
import type { Terrace, SunStatus, SunPosition, BuildingInfo } from "@/types";
import { getShadowStatus } from "./shadowCalc";

/**
 * Get the sun's position in degrees for a given location and time.
 * SunCalc returns azimuth in radians from south (clockwise), altitude in radians.
 * We convert to compass degrees (0=North, 90=East, 180=South, 270=West).
 */
export function getSunPosition(
  lat: number,
  lng: number,
  date: Date
): SunPosition {
  const pos = SunCalc.getPosition(date, lat, lng);
  // SunCalc azimuth: 0 = south, positive = westward (clockwise from south)
  // Convert to compass: add 180 and normalize to 0-360
  const azimuthDeg = ((pos.azimuth * 180) / Math.PI + 180) % 360;
  const altitudeDeg = (pos.altitude * 180) / Math.PI;
  return { azimuth: azimuthDeg, altitude: altitudeDeg };
}

/**
 * Calculate the angular difference between two compass bearings.
 * Returns a value between 0 and 180.
 */
export function angleDifference(a: number, b: number): number {
  let diff = Math.abs(a - b) % 360;
  if (diff > 180) diff = 360 - diff;
  return diff;
}

/**
 * Determine if a terrace is sunny, partially sunny, or shaded at a given time.
 *
 * If building geometry data is provided, uses real 3D shadow projection.
 * Otherwise falls back to the original estimation based on facing direction.
 *
 * @param terrace - The terrace to check
 * @param date - The date/time to check
 * @param buildings - Optional array of nearby building geometries for shadow calculation
 */
export function getTerraceStatus(
  terrace: Terrace,
  date: Date,
  buildings?: BuildingInfo[]
): SunStatus {
  const sun = getSunPosition(terrace.lat, terrace.lng, date);

  // Sun below useful threshold
  if (sun.altitude < 5) {
    return "shaded";
  }

  // If we have real building data, use 3D shadow projection
  if (buildings && buildings.length > 0) {
    return getShadowStatus(terrace.lat, terrace.lng, buildings, sun);
  }

  // Fallback: original estimation based on facing direction and shading radius
  const diff = angleDifference(sun.azimuth, terrace.facingDegrees);

  const behindBuilding = (terrace.facingDegrees + 180) % 360;
  const diffFromBehind = angleDifference(sun.azimuth, behindBuilding);

  if (diffFromBehind < terrace.shadingRadius) {
    if (sun.altitude > 60) {
      return "partial";
    }
    return "shaded";
  }

  if (diff < 45) {
    return "sunny";
  }
  if (diff < 90) {
    return "partial";
  }

  return "shaded";
}

/**
 * Find the next time a terrace will be sunny, checking every 30 minutes
 * from the given date until end of day (22:00).
 */
export function findNextSunnyTime(
  terrace: Terrace,
  fromDate: Date,
  buildings?: BuildingInfo[]
): Date | null {
  const endOfDay = new Date(fromDate);
  endOfDay.setHours(22, 0, 0, 0);

  const check = new Date(fromDate);
  check.setMinutes(Math.ceil(check.getMinutes() / 30) * 30, 0, 0);

  while (check <= endOfDay) {
    if (getTerraceStatus(terrace, check, buildings) === "sunny") {
      return new Date(check);
    }
    check.setMinutes(check.getMinutes() + 30);
  }
  return null;
}

/**
 * Find when the sun ends for a terrace that is currently sunny.
 * Checks every 30 minutes forward until the status is no longer sunny.
 */
export function findSunEndTime(
  terrace: Terrace,
  fromDate: Date,
  buildings?: BuildingInfo[]
): Date | null {
  const endOfDay = new Date(fromDate);
  endOfDay.setHours(22, 0, 0, 0);

  const check = new Date(fromDate);
  check.setMinutes(Math.ceil(check.getMinutes() / 30) * 30, 0, 0);

  while (check <= endOfDay) {
    if (getTerraceStatus(terrace, check, buildings) !== "sunny") {
      return new Date(check);
    }
    check.setMinutes(check.getMinutes() + 30);
  }
  return null;
}

/**
 * Main export: determine sun status for a terrace at a given date.
 */
export function isSunny(
  terrace: Terrace,
  date: Date,
  buildings?: BuildingInfo[]
): SunStatus {
  return getTerraceStatus(terrace, date, buildings);
}
