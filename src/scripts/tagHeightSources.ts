/**
 * Tag all buildings with a heightSource field based on existing data.
 *
 * Logic:
 * - levels != null → "osm-levels" (height derived from OSM building:levels)
 * - levels == null AND height != 15 → "overture" (enriched from Overture Maps)
 * - levels == null AND height == 15 → "default-estimate" (no real data)
 *
 * Run with: npx tsx src/scripts/tagHeightSources.ts
 */

import * as fs from "fs";
import * as path from "path";

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

function classifyHeightSource(building: Building): string {
  if (building.levels !== null && building.levels > 0) {
    return "osm-levels";
  }
  if (building.height !== 15) {
    return "overture";
  }
  return "default-estimate";
}

async function main() {
  const buildingsDir = path.resolve(__dirname, "..", "data", "buildings");
  const venueFiles = fs
    .readdirSync(buildingsDir)
    .filter((f) => f.endsWith(".json"));

  const counts: Record<string, number> = {
    "osm-levels": 0,
    overture: 0,
    "default-estimate": 0,
  };
  let totalBuildings = 0;

  for (const file of venueFiles) {
    const filePath = path.join(buildingsDir, file);
    const venueData: VenueBuildingData = JSON.parse(
      fs.readFileSync(filePath, "utf-8")
    );

    for (const building of venueData.buildings) {
      const source = classifyHeightSource(building);
      building.heightSource = source;
      counts[source] = (counts[source] || 0) + 1;
      totalBuildings++;
    }

    fs.writeFileSync(filePath, JSON.stringify(venueData, null, 2) + "\n");
  }

  console.log("\n--- Height Source Tagging Summary ---");
  console.log(`Total buildings: ${totalBuildings}`);
  for (const [source, count] of Object.entries(counts)) {
    const pct = ((count / totalBuildings) * 100).toFixed(1);
    console.log(`  ${source}: ${count} (${pct}%)`);
  }
  console.log(`\nUpdated ${venueFiles.length} venue files.`);
}

main().catch(console.error);
