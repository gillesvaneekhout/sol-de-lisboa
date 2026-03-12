import * as turf from "@turf/turf";
import type { SunPosition, SunStatus } from "@/types";

export interface Building {
  id: number;
  height: number;
  levels: number | null;
  polygon: Array<[number, number]>; // [lng, lat] GeoJSON order
  centroid: [number, number]; // [lng, lat]
  type: string;
}

export interface VenueBuildingData {
  venueId: string;
  venueName: string;
  lat: number;
  lng: number;
  fetchedAt: string;
  buildingCount: number;
  buildings: Building[];
}

/**
 * Calculate the shadow that a building casts at a given sun position.
 * Returns a GeoJSON polygon representing the shadow footprint on the ground.
 *
 * The shadow is projected in the direction opposite to the sun's azimuth,
 * with length proportional to building height / tan(altitude).
 */
function getBuildingShadowPolygon(
  building: Building,
  sun: SunPosition
): GeoJSON.Feature<GeoJSON.Polygon> | null {
  if (sun.altitude <= 0 || building.polygon.length < 3) return null;

  const altRad = (sun.altitude * Math.PI) / 180;
  const azRad = (sun.azimuth * Math.PI) / 180;

  // Shadow length in meters
  const shadowLength = building.height / Math.tan(altRad);

  // Cap shadow length at 300m to avoid extreme projections at low sun angles
  const cappedLength = Math.min(shadowLength, 300);

  // Shadow direction is opposite to sun azimuth
  // Sun azimuth is compass degrees (0=N, 90=E, 180=S, 270=W)
  // Shadow falls opposite: if sun is from south (180), shadow falls north (0)
  const shadowBearing = (sun.azimuth + 180) % 360;

  // For each vertex of the building polygon, project it in the shadow direction
  const originalCoords = building.polygon;
  const projectedCoords = originalCoords.map(([lng, lat]) => {
    const point = turf.point([lng, lat]);
    const projected = turf.destination(point, cappedLength / 1000, shadowBearing);
    return projected.geometry.coordinates as [number, number];
  });

  // Build shadow polygon as convex hull of original + projected vertices.
  // This avoids self-intersection issues with complex building shapes.
  try {
    const allPoints = [
      ...originalCoords.map(([lng, lat]) => turf.point([lng, lat])),
      ...projectedCoords.map(([lng, lat]) => turf.point([lng, lat])),
    ];
    const fc = turf.featureCollection(allPoints);
    const hull = turf.convex(fc);
    return hull as GeoJSON.Feature<GeoJSON.Polygon> | null;
  } catch {
    return null;
  }
}

/**
 * Check if a terrace point is in shadow from any nearby building.
 *
 * @param terraceLat - Terrace latitude
 * @param terraceLng - Terrace longitude
 * @param buildings - Array of nearby buildings with polygon geometry
 * @param sun - Current sun position (azimuth in compass degrees, altitude in degrees)
 * @returns SunStatus based on building shadow analysis
 */
export function getShadowStatus(
  terraceLat: number,
  terraceLng: number,
  buildings: Building[],
  sun: SunPosition
): SunStatus {
  // Sun below horizon or very low
  if (sun.altitude < 5) {
    return "shaded";
  }

  const terracePoint = turf.point([terraceLng, terraceLat]);

  // Check each building for shadow overlap
  for (const building of buildings) {
    // Skip buildings very far away (quick distance check)
    const dist = turf.distance(terracePoint, turf.point(building.centroid), {
      units: "meters",
    });
    if (dist > 350) continue; // building + shadow can't reach terrace

    // Skip very short buildings
    if (building.height < 3) continue;

    const shadowPoly = getBuildingShadowPolygon(building, sun);
    if (!shadowPoly) continue;

    try {
      if (turf.booleanPointInPolygon(terracePoint, shadowPoly)) {
        // In shadow — check if it's partial (sun is high enough to peek over)
        if (sun.altitude > 60) {
          return "partial";
        }
        return "shaded";
      }
    } catch {
      // Invalid polygon geometry, skip
      continue;
    }
  }

  // No building shadow hits the terrace
  return "sunny";
}
