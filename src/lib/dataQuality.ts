import type { BuildingInfo, DataConfidence, Terrace, TerraceQuality } from "@/types";
import { CURATED_COORDINATE_VENUE_IDS, ESTIMATED_COORDINATE_VENUE_IDS } from "@/lib/venueSources";
import { getTerraceCoordinateSource } from "@/lib/terraceCoords";
import { getArchetype, ARCHETYPE_SKY_FACTOR } from "@/lib/archetypeHeuristics";
import shadowScheduleIndex from "@/data/shadowScheduleIndex.json";

const LIDAR_VENUE_IDS = new Set<string>(shadowScheduleIndex);

function getHeightSource(building: BuildingInfo): string {
  if (building.heightSource) return building.heightSource;
  if (building.levels !== null && building.levels > 0) return "osm-levels";
  if (building.height !== 15) return "overture";
  return "default-estimate";
}

function toConfidenceLabel(score: number): DataConfidence {
  if (score >= 0.75) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

/**
 * Check if a venue has a LiDAR shadow schedule computed from real MDS elevation data.
 * A real schedule has elevationMsl != 50.0 (the fallback sentinel value).
 */
export function hasRealLidarSchedule(venueId: string): boolean {
  return LIDAR_VENUE_IDS.has(venueId);
}

export function getTerraceQuality(
  terrace: Terrace,
  buildings?: BuildingInfo[]
): TerraceQuality {
  const coordinateSource = getTerraceCoordinateSource(terrace)
    ?? (ESTIMATED_COORDINATE_VENUE_IDS.has(terrace.id)
      ? "estimated"
      : CURATED_COORDINATE_VENUE_IDS.has(terrace.id)
      ? "curated"
      : "osm");

  const totalBuildings = buildings?.length ?? 0;
  const buildingsWithMeasuredHeight = (buildings ?? []).filter((b) => {
    const source = getHeightSource(b);
    return source !== "default-estimate";
  }).length;

  const heightCoverage = totalBuildings > 0 ? buildingsWithMeasuredHeight / totalBuildings : 0;
  const coordinateScore = coordinateSource === "estimated" ? 0.35 : 1;
  const archetype = getArchetype(terrace);
  const skyFactor = ARCHETYPE_SKY_FACTOR[archetype];

  // If venue has a real LiDAR shadow schedule, shadow accuracy is HIGH
  // regardless of OSM building height coverage — LiDAR is the real shadow engine.
  const hasLidar = hasRealLidarSchedule(terrace.id);

  // With LiDAR, height coverage is irrelevant for shadow accuracy — only coordinate quality matters.
  const heightWeight = hasLidar ? 0 :
    (archetype === "rooftop" || archetype === "miradouro" || archetype === "waterfront") ? 0.2 : 0.45;
  const coordWeight = 1 - heightWeight;
  const score = hasLidar
    ? coordinateScore  // LiDAR venues: score is purely coordinate quality
    : (coordinateScore * coordWeight + heightCoverage * heightWeight) * skyFactor
      + (1 - skyFactor) * coordinateScore * coordWeight;
  const confidence = toConfidenceLabel(score);

  const openSky = archetype === "rooftop" || archetype === "miradouro" || archetype === "waterfront";
  let summary: string;
  if (hasLidar) {
    summary = coordinateSource === "estimated"
      ? "LiDAR shadow schedule available but location is estimated — coordinate accuracy limits overall confidence."
      : "LiDAR shadow schedule with real MDS elevation data — high shadow accuracy.";
  } else if (confidence === "high") {
    summary = openSky
      ? "Open-sky terrace with reliable location — shadow model not needed."
      : "Strong venue location and good building height data.";
  } else if (confidence === "medium") {
    summary = openSky
      ? "Good location data. Open-sky exposure means building heights matter less."
      : `Location confirmed but building height coverage is ${Math.round(heightCoverage * 100)}% — shadow model is partly estimated.`;
  } else {
    summary = coordinateSource === "estimated"
      ? "Location is estimated — coordinates not verified against OSM or maps. Shadow accuracy limited."
      : `Low building height coverage (${Math.round(heightCoverage * 100)}%) — OSM data gap in this area. Shadow model is mostly estimated.`;
  }

  return {
    confidence,
    summary,
    coordinateSource,
    totalBuildings,
    buildingsWithMeasuredHeight,
    heightCoverage,
    archetype,
  };
}

export function formatConfidenceLabel(confidence: DataConfidence): string {
  switch (confidence) {
    case "high":
      return "High confidence";
    case "medium":
      return "Medium confidence";
    case "low":
      return "Low confidence";
  }
}
