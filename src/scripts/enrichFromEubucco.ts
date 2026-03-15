/**
 * Enrich building heights from an exported EUBUCCO city slice.
 *
 * Expected input:
 * - a CSV export containing at least: id,height,geometry,type
 * - geometry is WKT in EPSG:3035 according to EUBUCCO docs
 *
 * This script is intentionally pipeline-friendly:
 * - input path is configurable
 * - no hardcoded one-off venue logic
 * - updates existing building JSONs with `heightSource: "eubucco"`
 * - preserves current values when EUBUCCO is missing or weaker
 *
 * Suggested usage:
 *   npx tsx src/scripts/enrichFromEubucco.ts ./tmp/eubucco/lisboa.csv
 *
 * Notes:
 * - We still need a proper Portugal/Lisbon slice export from EUBUCCO data.
 * - City id identified from metadata: v0.1-PRT.12.7_1 (Lisboa)
 */

import * as fs from "fs";
import * as path from "path";

interface EubuccoRow {
  id: string;
  height: number | null;
  type: string | null;
  centroidLng: number;
  centroidLat: number;
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

function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
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

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function wktCentroidFromLonLat(wkt: string): [number, number] | null {
  const matches = wkt.match(/-?\d+\.?\d*\s+-?\d+\.?\d*/g);
  if (!matches?.length) return null;
  let x = 0;
  let y = 0;
  for (const pair of matches) {
    const [a, b] = pair.trim().split(/\s+/).map(Number);
    x += a;
    y += b;
  }
  return [x / matches.length, y / matches.length];
}

function looksLikeLisbonLonLat(x: number, y: number): boolean {
  return x > -9.4 && x < -9.0 && y > 38.6 && y < 38.9;
}

function loadEubuccoCsv(filePath: string): EubuccoRow[] {
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const idx = Object.fromEntries(headers.map((h, i) => [h, i]));
  const rows: EubuccoRow[] = [];

  const geometryIndex = idx.geometry ?? idx.geom;
  if (geometryIndex === undefined || idx.id === undefined || idx.height === undefined) {
    console.error('CSV is missing required columns. Found headers:', headers.join(', '));
    return [];
  }

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const wkt = cols[geometryIndex];
    const heightRaw = cols[idx.height];
    const centroid = wkt ? wktCentroidFromLonLat(wkt) : null;
    if (!centroid) continue;

    const [lng, lat] = centroid;
    // Only proceed if file already converted to lon/lat.
    // Raw EPSG:3035 must be converted before use.
    if (!looksLikeLisbonLonLat(lng, lat)) continue;

    rows.push({
      id: cols[idx.id],
      type: idx.type !== undefined ? cols[idx.type] || null : null,
      height: heightRaw ? Number(heightRaw) : null,
      centroidLng: lng,
      centroidLat: lat,
    });
  }

  return rows.filter((r) => r.height !== null && Number.isFinite(r.height));
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("Usage: npx tsx src/scripts/enrichFromEubucco.ts <converted-lonlat-csv>");
    process.exit(1);
  }

  const buildingsDir = path.resolve(__dirname, "..", "data", "buildings");
  const rows = loadEubuccoCsv(path.resolve(input));
  console.log(`Loaded ${rows.length} usable EUBUCCO rows`);

  const gridSize = 0.001;
  const grid = new Map<string, EubuccoRow[]>();
  for (const row of rows) {
    const key = `${Math.floor(row.centroidLat / gridSize)},${Math.floor(row.centroidLng / gridSize)}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(row);
  }

  const venueFiles = fs.readdirSync(buildingsDir).filter((f) => f.endsWith('.json'));
  let enriched = 0;

  for (const file of venueFiles) {
    const filePath = path.join(buildingsDir, file);
    const venueData: VenueBuildingData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    let updated = false;

    for (const building of venueData.buildings) {
      if (building.heightSource === 'osm-levels') continue;
      const [lng, lat] = building.centroid;
      let best: EubuccoRow | null = null;
      let bestDist = 12;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const key = `${Math.floor(lat / gridSize) + dy},${Math.floor(lng / gridSize) + dx}`;
          for (const candidate of grid.get(key) || []) {
            const d = distanceMeters(lat, lng, candidate.centroidLat, candidate.centroidLng);
            if (d < bestDist) {
              bestDist = d;
              best = candidate;
            }
          }
        }
      }

      if (best?.height && best.height > 0) {
        building.height = Math.round(best.height * 10) / 10;
        building.heightSource = 'eubucco';
        updated = true;
        enriched++;
      }
    }

    if (updated) {
      fs.writeFileSync(filePath, JSON.stringify(venueData, null, 2) + '\n');
    }
  }

  console.log(`EUBUCCO enrichment complete. Updated ${enriched} buildings.`);
  console.log('Reminder: input must be converted to WGS84 lon/lat before this script.');
}

main().catch(console.error);
