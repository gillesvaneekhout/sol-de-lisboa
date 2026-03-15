import * as fs from "fs";
import * as path from "path";

type CoordinateSource = "osm" | "curated" | "estimated";
type VenueType = "bar" | "restaurant" | "cafe";
type TerraceArchetype = "rooftop" | "miradouro" | "waterfront" | "courtyard" | "street" | "unknown";

const VALID_ARCHETYPES: TerraceArchetype[] = ["rooftop", "miradouro", "waterfront", "courtyard", "street", "unknown"];

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

const terracesPath = path.resolve(__dirname, "../data/terraces.json");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateTerrace(t: Terrace) {
  assert(t.id, "Missing id");
  assert(t.id === slugify(t.id), `id must be slug-like: ${t.id}`);
  assert(t.name?.trim(), `Missing name for ${t.id}`);
  assert(["bar", "restaurant", "cafe"].includes(t.type), `Invalid type for ${t.id}`);
  assert(typeof t.lat === "number" && t.lat > 38.5 && t.lat < 38.9, `Invalid lat for ${t.id}`);
  assert(typeof t.lng === "number" && t.lng > -9.4 && t.lng < -9.0, `Invalid lng for ${t.id}`);
  if (t.terraceLat !== undefined) assert(typeof t.terraceLat === "number" && t.terraceLat > 38.5 && t.terraceLat < 38.9, `Invalid terraceLat for ${t.id}`);
  if (t.terraceLng !== undefined) assert(typeof t.terraceLng === "number" && t.terraceLng > -9.4 && t.terraceLng < -9.0, `Invalid terraceLng for ${t.id}`);
  assert(["osm", "curated", "estimated"].includes(t.coordinateSource || "estimated"), `Invalid coordinateSource for ${t.id}`);
  if (t.terraceCoordinateSource !== undefined) assert(["osm", "curated", "estimated"].includes(t.terraceCoordinateSource), `Invalid terraceCoordinateSource for ${t.id}`);
  assert(Number.isInteger(t.facingDegrees) && t.facingDegrees >= 0 && t.facingDegrees <= 360, `Invalid facingDegrees for ${t.id}`);
  assert(Number.isInteger(t.shadingRadius) && t.shadingRadius >= 0 && t.shadingRadius <= 90, `Invalid shadingRadius for ${t.id}`);
  assert(typeof t.rating === "number" && t.rating >= 0 && t.rating <= 5, `Invalid rating for ${t.id}`);
  assert(Number.isInteger(t.priceLevel) && t.priceLevel >= 1 && t.priceLevel <= 4, `Invalid priceLevel for ${t.id}`);
  assert(Array.isArray(t.tags), `tags must be array for ${t.id}`);
  assert(typeof t.description === "string" && t.description.length > 10, `Description too short for ${t.id}`);
  if (t.archetype !== undefined) assert(VALID_ARCHETYPES.includes(t.archetype), `Invalid archetype for ${t.id}: ${t.archetype}`);
}

function main() {
  const terraces = JSON.parse(fs.readFileSync(terracesPath, "utf-8")) as Terrace[];

  const seen = new Set<string>();
  for (const terrace of terraces) {
    terrace.id = slugify(terrace.id);
    terrace.coordinateSource = terrace.coordinateSource || "estimated";
    terrace.archetype = terrace.archetype || "unknown";
    terrace.tags = [...new Set(terrace.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
    // Auto-flag venues that need manual terrace review
    const needsPin =
      (terrace.archetype === "rooftop" || terrace.archetype === "miradouro" || terrace.archetype === "courtyard") &&
      (terrace.terraceLat === undefined || terrace.terraceLng === undefined);
    terrace.needsTerraceReview = needsPin;
    validateTerrace(terrace);
    assert(!seen.has(terrace.id), `Duplicate id: ${terrace.id}`);
    seen.add(terrace.id);
  }

  terraces.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(terracesPath, JSON.stringify(terraces, null, 2) + "\n");
  console.log(`Normalized ${terraces.length} terraces`);
}

main();
