/**
 * Enrich building height data from Overture Maps.
 *
 * Reads Overture building data (with heights/floors) from /tmp/lisbon-buildings-heights.json,
 * then matches against existing building JSONs by polygon centroid proximity.
 * Updates buildings that currently have default 15m height (no real data) with
 * actual height or floor data from Overture.
 *
 * Usage: npx tsx src/scripts/enrichBuildingHeights.ts
 */

import * as fs from "fs";
import * as path from "path";

interface OvertureBuilding {
  id: string;
  height: number | null;
  num_floors: number | null;
  wkt: string;
  bbox_xmin: number;
  bbox_ymin: number;
  bbox_xmax: number;
  bbox_ymax: number;
}

interface ExistingBuilding {
  id: number;
  height: number;
  levels: number | null;
  polygon: Array<[number, number]>;
  centroid: [number, number];
  type: string;
}

interface VenueBuildingData {
  venueId: string;
  venueName: string;
  lat: number;
  lng: number;
  fetchedAt: string;
  buildingCount: number;
  buildings: ExistingBuilding[];
}

/** Estimate height using Lisbon-specific floor heights */
function estimateHeightFromFloors(
  floors: number,
  buildingType: string
): number {
  // Ground floor in Lisbon is often taller (commercial/pombaline)
  const groundFloorHeight =
    buildingType === "residential" || buildingType === "house" ? 3.2 : 4.2;
  // Upper floors: old Lisbon ~3.2m, modern ~2.8m
  // Use 3.0m as a reasonable average
  const upperFloorHeight = 3.0;

  if (floors <= 1) return groundFloorHeight;
  return groundFloorHeight + (floors - 1) * upperFloorHeight;
}

/** Haversine distance in meters between two points */
function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Parse WKT POLYGON/MULTIPOLYGON to get centroid */
function wktCentroid(wkt: string): [number, number] | null {
  // Extract all coordinate pairs from WKT
  const coordMatches = wkt.match(/-?\d+\.?\d*\s+-?\d+\.?\d*/g);
  if (!coordMatches || coordMatches.length === 0) return null;

  let sumLng = 0,
    sumLat = 0,
    count = 0;
  for (const pair of coordMatches) {
    const [lng, lat] = pair.split(/\s+/).map(Number);
    sumLng += lng;
    sumLat += lat;
    count++;
  }
  return [sumLng / count, sumLat / count];
}

async function main() {
  const overtureFile = "/tmp/lisbon-buildings-heights.json";
  const buildingsDir = path.resolve(
    __dirname,
    "..",
    "data",
    "buildings"
  );

  if (!fs.existsSync(overtureFile)) {
    console.error(
      "Overture data not found at",
      overtureFile,
      "- run the DuckDB query first"
    );
    process.exit(1);
  }

  console.log("Loading Overture building data...");
  const overtureData: OvertureBuilding[] = JSON.parse(
    fs.readFileSync(overtureFile, "utf-8")
  );
  console.log(`Loaded ${overtureData.length} Overture buildings with height/floor data`);

  // Pre-compute Overture centroids for matching
  const overtureCentroids = overtureData
    .map((b) => {
      const centroid = wktCentroid(b.wkt);
      return centroid ? { ...b, centroidLng: centroid[0], centroidLat: centroid[1] } : null;
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  console.log(`Computed centroids for ${overtureCentroids.length} Overture buildings`);

  // Build a simple spatial index: grid cells of ~100m
  const gridSize = 0.001; // ~111m lat, ~85m lng at Lisbon latitude
  const grid = new Map<string, typeof overtureCentroids>();
  for (const b of overtureCentroids) {
    const key = `${Math.floor(b.centroidLat / gridSize)},${Math.floor(b.centroidLng / gridSize)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(b);
  }

  // Process each venue building file
  const venueFiles = fs
    .readdirSync(buildingsDir)
    .filter((f) => f.endsWith(".json"));

  let totalBuildings = 0;
  let enrichedFromHeight = 0;
  let enrichedFromFloors = 0;
  let alreadyHadData = 0;
  let noMatch = 0;

  for (const file of venueFiles) {
    const filePath = path.join(buildingsDir, file);
    const venueData: VenueBuildingData = JSON.parse(
      fs.readFileSync(filePath, "utf-8")
    );

    let fileUpdated = false;

    for (const building of venueData.buildings) {
      totalBuildings++;
      const [bLng, bLat] = building.centroid;

      // If building already has real level data, use improved estimation
      if (building.levels !== null && building.levels > 0) {
        const oldHeight = building.height;
        const newHeight = estimateHeightFromFloors(building.levels, building.type);
        if (Math.abs(oldHeight - newHeight) > 0.1) {
          building.height = Math.round(newHeight * 10) / 10;
          fileUpdated = true;
          alreadyHadData++;
        }
        continue;
      }

      // Try to match with Overture data by centroid proximity
      const gridKey = `${Math.floor(bLat / gridSize)},${Math.floor(bLng / gridSize)}`;

      // Check this cell and neighbors
      const candidates: typeof overtureCentroids = [];
      for (let dLat = -1; dLat <= 1; dLat++) {
        for (let dLng = -1; dLng <= 1; dLng++) {
          const key = `${Math.floor(bLat / gridSize) + dLat},${Math.floor(bLng / gridSize) + dLng}`;
          const cell = grid.get(key);
          if (cell) candidates.push(...cell);
        }
      }

      // Find closest Overture building within 15m
      let bestMatch: (typeof overtureCentroids)[0] | null = null;
      let bestDist = 15; // max 15m match radius

      for (const candidate of candidates) {
        const dist = distanceMeters(
          bLat,
          bLng,
          candidate.centroidLat,
          candidate.centroidLng
        );
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = candidate;
        }
      }

      if (bestMatch) {
        if (bestMatch.height !== null && bestMatch.height > 0) {
          building.height = Math.round(bestMatch.height * 10) / 10;
          enrichedFromHeight++;
          fileUpdated = true;
        } else if (bestMatch.num_floors !== null && bestMatch.num_floors > 0) {
          building.levels = bestMatch.num_floors;
          building.height = estimateHeightFromFloors(
            bestMatch.num_floors,
            building.type
          );
          building.height = Math.round(building.height * 10) / 10;
          enrichedFromFloors++;
          fileUpdated = true;
        }
      } else {
        noMatch++;
      }
    }

    if (fileUpdated) {
      fs.writeFileSync(filePath, JSON.stringify(venueData, null, 2) + "\n");
    }
  }

  console.log("\n--- Enrichment Summary ---");
  console.log(`Total buildings processed: ${totalBuildings}`);
  console.log(`Already had levels (re-estimated height): ${alreadyHadData}`);
  console.log(`Enriched with Overture height: ${enrichedFromHeight}`);
  console.log(`Enriched with Overture num_floors: ${enrichedFromFloors}`);
  console.log(`No Overture match (kept default 15m): ${noMatch}`);
  console.log(
    `Total enriched: ${alreadyHadData + enrichedFromHeight + enrichedFromFloors} / ${totalBuildings}`
  );
}

main().catch(console.error);
