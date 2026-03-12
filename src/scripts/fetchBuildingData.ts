/**
 * Fetch building data from OSM Overpass API for all venues.
 * For each venue in terraces.json, queries buildings within 150m radius
 * and saves polygon geometry + estimated height to src/data/buildings/{venue-id}.json
 *
 * Run with: npx tsx src/scripts/fetchBuildingData.ts
 */

import * as fs from "fs";
import * as path from "path";

interface OsmElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
}

interface BuildingData {
  id: number;
  height: number;
  levels: number | null;
  polygon: Array<[number, number]>; // [lng, lat] for GeoJSON compatibility
  centroid: [number, number]; // [lng, lat]
  type: string;
}

interface VenueBuildingData {
  venueId: string;
  venueName: string;
  lat: number;
  lng: number;
  fetchedAt: string;
  buildingCount: number;
  buildings: BuildingData[];
}

const DEFAULT_HEIGHT = 15; // 5-story Lisbon default
const METERS_PER_LEVEL = 3;
const RADIUS_METERS = 150;
const DELAY_MS = 1200; // Be nice to Overpass API

const terracesPath = path.resolve(__dirname, "../data/terraces.json");
const buildingsDir = path.resolve(__dirname, "../data/buildings");

async function fetchBuildingsForVenue(
  venueId: string,
  venueName: string,
  lat: number,
  lng: number
): Promise<VenueBuildingData> {
  const query = `[out:json][timeout:30];(way["building"](around:${RADIUS_METERS},${lat},${lng});relation["building"](around:${RADIUS_METERS},${lat},${lng}););out body geom;`;

  const url = "https://overpass-api.de/api/interpreter";
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass API error ${response.status} for ${venueId}`);
  }

  const data = await response.json();
  const elements: OsmElement[] = data.elements || [];

  const buildings: BuildingData[] = elements
    .filter((el) => el.geometry && el.geometry.length >= 3)
    .map((el) => {
      const tags = el.tags || {};
      const levels = tags["building:levels"] ? parseInt(tags["building:levels"], 10) : null;
      const heightTag = tags["building:height"] || tags["height"];
      const height = heightTag
        ? parseFloat(heightTag)
        : levels
          ? levels * METERS_PER_LEVEL
          : DEFAULT_HEIGHT;

      const polygon: Array<[number, number]> = el.geometry!.map((p) => [p.lon, p.lat]);

      // Calculate centroid
      let cLat = 0,
        cLng = 0;
      for (const [lon, la] of polygon) {
        cLat += la;
        cLng += lon;
      }
      cLat /= polygon.length;
      cLng /= polygon.length;

      return {
        id: el.id,
        height,
        levels,
        polygon,
        centroid: [cLng, cLat] as [number, number],
        type: tags["building"] || "yes",
      };
    });

  return {
    venueId,
    venueName,
    lat,
    lng,
    fetchedAt: new Date().toISOString(),
    buildingCount: buildings.length,
    buildings,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const terraces = JSON.parse(fs.readFileSync(terracesPath, "utf-8"));

  if (!fs.existsSync(buildingsDir)) {
    fs.mkdirSync(buildingsDir, { recursive: true });
  }

  console.log(`Fetching building data for ${terraces.length} venues...`);

  let successCount = 0;
  let totalBuildings = 0;

  for (const terrace of terraces) {
    const outPath = path.join(buildingsDir, `${terrace.id}.json`);

    // Skip if already fetched (within last 24h)
    if (fs.existsSync(outPath)) {
      const existing = JSON.parse(fs.readFileSync(outPath, "utf-8"));
      const fetchedAt = new Date(existing.fetchedAt);
      const hoursSince = (Date.now() - fetchedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        console.log(`  [skip] ${terrace.name} (fetched ${Math.round(hoursSince)}h ago, ${existing.buildingCount} buildings)`);
        successCount++;
        totalBuildings += existing.buildingCount;
        continue;
      }
    }

    try {
      const data = await fetchBuildingsForVenue(
        terrace.id,
        terrace.name,
        terrace.lat,
        terrace.lng
      );
      fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
      console.log(`  [ok] ${terrace.name}: ${data.buildingCount} buildings`);
      successCount++;
      totalBuildings += data.buildingCount;
    } catch (err) {
      console.error(`  [err] ${terrace.name}: ${err}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone: ${successCount}/${terraces.length} venues, ${totalBuildings} total buildings`);
}

main().catch(console.error);
