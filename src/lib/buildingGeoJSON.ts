import type { Feature, FeatureCollection, Polygon } from "geojson";

// Import the processed building data
// This file is ~12MB so we load it statically at build time
import lisbonBuildings from "@/data/lisbon-buildings.json";

export interface BuildingProperties {
  id: number;
  height: number;
  heightSource: "osm" | "lidar" | "default";
}

export type BuildingFeature = Feature<Polygon, BuildingProperties>;
export type BuildingCollection = FeatureCollection<Polygon, BuildingProperties>;

/**
 * Get all Lisbon buildings as a GeoJSON FeatureCollection.
 */
export function getAllBuildings(): BuildingCollection {
  return lisbonBuildings as BuildingCollection;
}

/**
 * Get building features array for shadow simulator's getFeatures callback.
 */
export function getBuildingFeatures(): BuildingFeature[] {
  return (lisbonBuildings as BuildingCollection).features;
}

/**
 * Get building count and stats.
 */
export function getBuildingStats(): {
  total: number;
  withOsmHeight: number;
  withLidarHeight: number;
  withDefaultHeight: number;
} {
  const features = (lisbonBuildings as BuildingCollection).features;
  return {
    total: features.length,
    withOsmHeight: features.filter((f) => f.properties.heightSource === "osm").length,
    withLidarHeight: features.filter((f) => f.properties.heightSource === "lidar").length,
    withDefaultHeight: features.filter((f) => f.properties.heightSource === "default").length,
  };
}
