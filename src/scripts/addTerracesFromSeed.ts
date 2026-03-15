import * as fs from "fs";
import * as path from "path";

type CoordinateSource = "osm" | "curated" | "estimated";
type VenueType = "bar" | "restaurant" | "cafe";
type TerraceArchetype = "rooftop" | "miradouro" | "waterfront" | "courtyard" | "street" | "unknown";

interface Terrace {
  id: string;
  name: string;
  type: VenueType;
  address: string;
  lat: number;
  lng: number;
  coordinateSource?: CoordinateSource;
  terraceLat?: number;
  terraceLng?: number;
  terraceCoordinateSource?: CoordinateSource;
  archetype?: TerraceArchetype;
  needsTerraceReview?: boolean;
  facingDegrees: number;
  shadingRadius: number;
  rating: number;
  priceLevel: number;
  tags: string[];
  description: string;
}

const mainPath = path.resolve(__dirname, "../data/terraces.json");
const seedPath = path.resolve(__dirname, "../data/terraces.seed.json");

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function main() {
  const existing = JSON.parse(fs.readFileSync(mainPath, "utf-8")) as Terrace[];
  const seed = JSON.parse(fs.readFileSync(seedPath, "utf-8")) as Terrace[];
  if (!Array.isArray(seed) || seed.length === 0) {
    console.log("No seed terraces to add.");
    return;
  }

  const byId = new Map(existing.map((t) => [t.id, t]));
  let added = 0;
  let updated = 0;

  for (const venue of seed) {
    const normalized: Terrace = {
      ...venue,
      id: slugify(venue.id || venue.name),
      coordinateSource: venue.coordinateSource || "estimated",
      tags: [...new Set((venue.tags || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))],
    };

    if (byId.has(normalized.id)) {
      byId.set(normalized.id, { ...byId.get(normalized.id)!, ...normalized });
      updated++;
    } else {
      byId.set(normalized.id, normalized);
      added++;
    }
  }

  const merged = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(mainPath, JSON.stringify(merged, null, 2) + "\n");
  console.log(`Merged seed terraces: ${added} added, ${updated} updated`);
  console.log(`Now run: npm run terraces:normalize`);
}

main();
