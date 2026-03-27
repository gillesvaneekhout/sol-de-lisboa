/**
 * Validate coordinates in terraces.seed.json
 * Ensures all venues have valid Lisbon-area coordinates
 */

import * as fs from "fs";
import * as path from "path";

interface SeedVenue {
  name: string;
  lat: number;
  lng: number;
  address?: string;
  [key: string]: unknown;
}

// Lisbon bounding box (approximate)
const LISBON_BOUNDS = {
  minLat: 38.69,
  maxLat: 38.80,
  minLng: -9.23,
  maxLng: -9.09,
};

const seedPath = path.resolve(__dirname, "../data/terraces.seed.json");

function validateCoords(lat: number, lng: number): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  if (typeof lat !== "number" || isNaN(lat)) {
    issues.push("lat is not a valid number");
  } else if (lat < LISBON_BOUNDS.minLat || lat > LISBON_BOUNDS.maxLat) {
    issues.push(`lat ${lat} is outside Lisbon bounds (${LISBON_BOUNDS.minLat} - ${LISBON_BOUNDS.maxLat})`);
  }
  
  if (typeof lng !== "number" || isNaN(lng)) {
    issues.push("lng is not a valid number");
  } else if (lng < LISBON_BOUNDS.minLng || lng > LISBON_BOUNDS.maxLng) {
    issues.push(`lng ${lng} is outside Lisbon bounds (${LISBON_BOUNDS.minLng} - ${LISBON_BOUNDS.maxLng})`);
  }
  
  return { valid: issues.length === 0, issues };
}

function main() {
  if (!fs.existsSync(seedPath)) {
    console.log("No seed file found at", seedPath);
    return;
  }

  const seed = JSON.parse(fs.readFileSync(seedPath, "utf-8")) as SeedVenue[];
  console.log(`Validating ${seed.length} venues...\n`);

  let valid = 0;
  let invalid = 0;

  for (const venue of seed) {
    const result = validateCoords(venue.lat, venue.lng);
    if (result.valid) {
      valid++;
    } else {
      invalid++;
      console.log(`❌ ${venue.name}`);
      result.issues.forEach(issue => console.log(`   - ${issue}`));
      if (venue.address) {
        console.log(`   Address: ${venue.address}`);
      }
      console.log();
    }
  }

  console.log(`\nSummary: ${valid} valid, ${invalid} invalid`);
  
  if (invalid > 0) {
    process.exit(1);
  }
}

main();
