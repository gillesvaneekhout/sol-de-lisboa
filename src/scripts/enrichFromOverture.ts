/**
 * Enrich building heights from Overture Maps data (v2).
 *
 * Reads /tmp/overture-lisbon-heights.json (13,820 buildings with heights),
 * matches to existing building JSONs by centroid proximity (<15m),
 * and updates buildings that currently have default 15m height.
 *
 * Run with: npx tsx src/scripts/enrichFromOverture.ts
 */

import * as fs from "fs";
import * as path from "path";

interface OvertureBuilding {
  id: string;
  height: number | null;
  num_floors: number | null;
  source: string;
  geometry: {
    type: string;
    coordinates: number[][][];
  };
  bbox: {
    lon_min: number;
    lat_min: number;
    lon_max: number;
    lat_max: number;
  };
}

interface Building {
  id: number;
  height: number;
  levels: number | null;
  polygon: Array<[number, number]>;
  centroid: [number, number];
  type: string;
  heightSource?: string;
}

interface VenueBuildingData {
  venueId: string;
  venueName: string;
  lat: number;
  lng: number;
  fetchedAt: string;
  buildingCount: number;
  buildings: Building[];
}

/** Haversine distance in meters */
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

/** Compute centroid of polygon coordinates */
function polygonCentroid(coords: number[][]): [number, number] {
  let sumLng = 0,
    sumLat = 0;
  for (const [lng, lat] of coords) {
    sumLng += lng;
    sumLat += lat;
  }
  return [sumLng / coords.length, sumLat / coords.length];
}

/** Estimate height using Lisbon-specific floor heights */
function estimateHeightFromFloors(
  floors: number,
  buildingType: string
): number {
  const groundFloorHeight =
    buildingType === "residential" || buildingType === "house" ? 3.2 : 4.2;
  const upperFloorHeight = 3.0;
  if (floors <= 1) return groundFloorHeight;
  return groundFloorHeight + (floors - 1) * upperFloorHeight;
}

async function main() {
  const overtureFile = "/tmp/overture-lisbon-heights.json";
  const buildingsDir = path.resolve(__dirname, "..", "data", "buildings");

  if (!fs.existsSync(overtureFile)) {
    console.error("Overture data not found at", overtureFile);
    process.exit(1);
  }

  console.log("Loading Overture building data...");
  const overtureData = JSON.parse(fs.readFileSync(overtureFile, "utf-8"));
  const overtureBuildings: OvertureBuilding[] = overtureData.buildings;
  console.log(`Loaded ${overtureBuildings.length} Overture buildings`);

  // Pre-compute centroids and build spatial index
  const gridSize = 0.001; // ~100m
  const grid = new Map<
    string,
    Array<{ lng: number; lat: number; height: number | null; num_floors: number | null }>
  >();

  for (const ob of overtureBuildings) {
    if (!ob.geometry?.coordinates?.[0]) continue;
    const [cLng, cLat] = polygonCentroid(ob.geometry.coordinates[0]);
    const entry = {
      lng: cLng,
      lat: cLat,
      height: ob.height,
      num_floors: ob.num_floors,
    };
    const key = `${Math.floor(cLat / gridSize)},${Math.floor(cLng / gridSize)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(entry);
  }

  console.log(`Built spatial index with ${grid.size} grid cells`);

  // Process venue building files
  const venueFiles = fs
    .readdirSync(buildingsDir)
    .filter((f) => f.endsWith(".json"));

  let totalBuildings = 0;
  let enrichedHeight = 0;
  let enrichedFloors = 0;
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

      // Skip buildings that already have real data (osm-levels)
      if (building.heightSource === "osm-levels") {
        alreadyHadData++;
        continue;
      }

      // Find closest Overture building within 15m
      const gridKey = `${Math.floor(bLat / gridSize)},${Math.floor(bLng / gridSize)}`;
      let bestMatch: (typeof grid extends Map<string, infer T> ? T : never)[0] | null = null;
      let bestDist = 15;

      for (let dLat = -1; dLat <= 1; dLat++) {
        for (let dLng = -1; dLng <= 1; dLng++) {
          const key = `${Math.floor(bLat / gridSize) + dLat},${Math.floor(bLng / gridSize) + dLng}`;
          const cell = grid.get(key);
          if (!cell) continue;
          for (const candidate of cell) {
            const dist = distanceMeters(bLat, bLng, candidate.lat, candidate.lng);
            if (dist < bestDist) {
              bestDist = dist;
              bestMatch = candidate;
            }
          }
        }
      }

      if (bestMatch) {
        if (bestMatch.height !== null && bestMatch.height > 0) {
          building.height = Math.round(bestMatch.height * 10) / 10;
          building.heightSource = "overture";
          enrichedHeight++;
          fileUpdated = true;
        } else if (bestMatch.num_floors !== null && bestMatch.num_floors > 0) {
          building.levels = bestMatch.num_floors;
          building.height = Math.round(
            estimateHeightFromFloors(bestMatch.num_floors, building.type) * 10
          ) / 10;
          building.heightSource = "overture";
          enrichedFloors++;
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

  console.log("\n--- Overture Enrichment Summary ---");
  console.log(`Total buildings: ${totalBuildings}`);
  console.log(`Already had OSM levels: ${alreadyHadData}`);
  console.log(`Enriched with Overture height: ${enrichedHeight}`);
  console.log(`Enriched with Overture floors: ${enrichedFloors}`);
  console.log(`No Overture match: ${noMatch}`);
  console.log(
    `Total enriched: ${enrichedHeight + enrichedFloors} new + ${alreadyHadData} existing`
  );

  // Print final heightSource distribution
  console.log("\n--- Final Height Source Distribution ---");
  const finalCounts: Record<string, number> = {};
  for (const file of venueFiles) {
    const filePath = path.join(buildingsDir, file);
    const venueData: VenueBuildingData = JSON.parse(
      fs.readFileSync(filePath, "utf-8")
    );
    for (const b of venueData.buildings) {
      const src = b.heightSource || "unknown";
      finalCounts[src] = (finalCounts[src] || 0) + 1;
    }
  }
  const total = Object.values(finalCounts).reduce((a, b) => a + b, 0);
  for (const [src, count] of Object.entries(finalCounts).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`  ${src}: ${count} (${((count / total) * 100).toFixed(1)}%)`);
  }
}

main().catch(console.error);
