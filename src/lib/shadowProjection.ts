/**
 * Custom shadow projection calculation.
 * No external API required - uses SunCalc + basic geometry.
 */

import SunCalc from "suncalc";
import type { Feature, Polygon, FeatureCollection, Position } from "geojson";

interface SunPosition {
  azimuth: number; // radians, 0 = south, positive = west
  altitude: number; // radians above horizon
}

interface BuildingProperties {
  id: number;
  height: number;
}

type BuildingFeature = Feature<Polygon, BuildingProperties>;

/**
 * Get sun position for a given date and location.
 */
export function getSunPosition(date: Date, lat: number, lng: number): SunPosition {
  const pos = SunCalc.getPosition(date, lat, lng);
  return {
    azimuth: pos.azimuth, // radians from south, positive = clockwise (west)
    altitude: pos.altitude, // radians above horizon
  };
}

/**
 * Calculate shadow length in meters for a given building height and sun altitude.
 */
function getShadowLength(buildingHeight: number, sunAltitude: number): number {
  if (sunAltitude <= 0) {
    // Sun below horizon - no direct shadow (or infinite shadow)
    return buildingHeight * 100; // Cap at reasonable length
  }
  return buildingHeight / Math.tan(sunAltitude);
}

/**
 * Convert meters to degrees at a given latitude.
 * Approximate: 1 degree latitude ≈ 111,320 meters
 */
function metersToDegreesLat(meters: number): number {
  return meters / 111320;
}

function metersToDegreesLng(meters: number, lat: number): number {
  return meters / (111320 * Math.cos((lat * Math.PI) / 180));
}

/**
 * Project a single point to create a shadow point.
 * Shadow is cast opposite to sun direction.
 */
function projectPoint(
  point: Position,
  shadowLength: number,
  sunAzimuth: number,
  lat: number
): Position {
  // Sun azimuth: 0 = south, positive = west (clockwise)
  // Shadow direction: opposite of sun = sun azimuth + PI
  const shadowAzimuth = sunAzimuth + Math.PI;
  
  // Calculate offset in meters
  // North is negative Y in lat, positive X is east in lng
  const dxMeters = Math.sin(shadowAzimuth) * shadowLength;
  const dyMeters = Math.cos(shadowAzimuth) * shadowLength;
  
  // Convert to degrees
  const dLng = metersToDegreesLng(dxMeters, lat);
  const dLat = metersToDegreesLat(dyMeters);
  
  return [point[0] + dLng, point[1] + dLat];
}

/**
 * Generate shadow polygon for a single building.
 * Returns a polygon representing the shadow footprint.
 */
export function generateBuildingShadow(
  building: BuildingFeature,
  sunPosition: SunPosition
): Feature<Polygon> | null {
  const { altitude, azimuth } = sunPosition;
  
  // No shadow when sun is below horizon or directly overhead
  if (altitude <= 0.01 || altitude >= Math.PI / 2 - 0.01) {
    return null;
  }
  
  const height = building.properties.height || 10;
  const shadowLength = getShadowLength(height, altitude);
  
  // Get building coordinates (first ring is exterior)
  const coords = building.geometry.coordinates[0];
  if (!coords || coords.length < 4) return null;
  
  // Calculate centroid for lat reference
  const centroidLat =
    coords.reduce((sum, c) => sum + c[1], 0) / coords.length;
  
  // Create shadow polygon by projecting each building vertex
  const shadowCoords: Position[] = [];
  
  // Add original building footprint vertices
  for (const coord of coords) {
    shadowCoords.push(coord);
  }
  
  // Add projected shadow vertices (in reverse order for proper polygon)
  for (let i = coords.length - 1; i >= 0; i--) {
    shadowCoords.push(
      projectPoint(coords[i], shadowLength, azimuth, centroidLat)
    );
  }
  
  // Close the polygon
  shadowCoords.push(shadowCoords[0]);
  
  return {
    type: "Feature",
    properties: {
      type: "shadow",
      buildingId: building.properties.id,
      shadowLength,
    },
    geometry: {
      type: "Polygon",
      coordinates: [shadowCoords],
    },
  };
}

/**
 * Filter buildings to only those within viewport bounds.
 */
function filterBuildingsByBounds(
  buildings: BuildingFeature[],
  bounds: { minLng: number; maxLng: number; minLat: number; maxLat: number }
): BuildingFeature[] {
  return buildings.filter((building) => {
    const coords = building.geometry.coordinates[0];
    if (!coords || coords.length < 1) return false;
    
    // Check if any vertex is in bounds (fast approximation)
    for (const coord of coords) {
      if (
        coord[0] >= bounds.minLng &&
        coord[0] <= bounds.maxLng &&
        coord[1] >= bounds.minLat &&
        coord[1] <= bounds.maxLat
      ) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Generate shadow polygons for buildings within viewport.
 * Optimized with viewport culling.
 */
export function generateAllShadows(
  buildings: BuildingFeature[],
  date: Date,
  centerLat: number,
  centerLng: number,
  viewportBounds?: { minLng: number; maxLng: number; minLat: number; maxLat: number }
): FeatureCollection {
  const sunPosition = getSunPosition(date, centerLat, centerLng);
  
  // Skip if sun is too low (no meaningful shadows) or too high (tiny shadows)
  if (sunPosition.altitude <= 0.05 || sunPosition.altitude >= Math.PI / 2 - 0.05) {
    return {
      type: "FeatureCollection",
      features: [],
    };
  }
  
  // Filter to viewport if bounds provided
  let filteredBuildings = buildings;
  if (viewportBounds) {
    // Expand bounds to account for shadows extending outside viewport
    const shadowExtent = 0.002; // ~200m at Lisbon latitude
    const expandedBounds = {
      minLng: viewportBounds.minLng - shadowExtent,
      maxLng: viewportBounds.maxLng + shadowExtent,
      minLat: viewportBounds.minLat - shadowExtent,
      maxLat: viewportBounds.maxLat + shadowExtent,
    };
    filteredBuildings = filterBuildingsByBounds(buildings, expandedBounds);
  }
  
  const shadows: Feature<Polygon>[] = [];
  
  for (const building of filteredBuildings) {
    const shadow = generateBuildingShadow(building, sunPosition);
    if (shadow) {
      shadows.push(shadow);
    }
  }
  
  return {
    type: "FeatureCollection",
    features: shadows,
  };
}

/**
 * Check if a point is in shadow at a given time.
 * This is a simplified check - real implementation would use point-in-polygon.
 */
export function isPointInShadow(
  lng: number,
  lat: number,
  buildings: BuildingFeature[],
  date: Date
): boolean {
  const sunPosition = getSunPosition(date, lat, lng);
  
  if (sunPosition.altitude <= 0) {
    return true; // Sun below horizon = everything in shadow
  }
  
  // For each building, check if this point falls within its shadow
  for (const building of buildings) {
    const shadow = generateBuildingShadow(building, sunPosition);
    if (shadow && pointInPolygon([lng, lat], shadow.geometry.coordinates[0])) {
      return true;
    }
  }
  
  return false;
}

/**
 * Simple point-in-polygon test using ray casting.
 */
function pointInPolygon(point: Position, polygon: Position[]): boolean {
  const [x, y] = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    
    if (
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  
  return inside;
}
