/**
 * Build the combined buildingIndex.json from individual venue building files.
 *
 * Usage: npx tsx src/scripts/buildIndex.ts
 */

import * as fs from "fs";
import * as path from "path";

interface BuildingInfo {
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
  buildings: BuildingInfo[];
}

function main() {
  const buildingsDir = path.resolve(__dirname, "..", "data", "buildings");
  const outputPath = path.resolve(__dirname, "..", "data", "buildingIndex.json");

  const venueFiles = fs
    .readdirSync(buildingsDir)
    .filter((f) => f.endsWith(".json"));

  const index: Record<string, BuildingInfo[]> = {};

  for (const file of venueFiles) {
    const filePath = path.join(buildingsDir, file);
    const venueData: VenueBuildingData = JSON.parse(
      fs.readFileSync(filePath, "utf-8")
    );
    index[venueData.venueId] = venueData.buildings;
  }

  fs.writeFileSync(outputPath, JSON.stringify(index));
  console.log(
    `Built buildingIndex.json: ${Object.keys(index).length} venues, ${outputPath}`
  );
}

main();
