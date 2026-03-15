import * as fs from "fs";
import * as path from "path";
import type { Terrace, BuildingInfo } from "@/types";
import { getTerraceQuality, hasRealLidarSchedule } from "@/lib/dataQuality";
import { getArchetype, getNeedsTerraceReview } from "@/lib/archetypeHeuristics";

interface EvalReport {
  generatedAt: string;
  venueCount: number;
  coordinateSources: Record<string, number>;
  terraceCoordinateSources: Record<string, number>;
  confidence: Record<string, number>;
  terracePointCoverage: { explicit: number; implicit: number };
  lidarCoverage: { realLidar: number; noSchedule: number };
  heightSources: Record<string, number>;
  archetypes: Record<string, number>;
  needsTerraceReview: number;
  weakestVenues: Array<{
    id: string;
    name: string;
    confidence: string;
    heightCoverage: number;
    coordinateSource: string;
    terraceCoordinateSource: string;
    archetype: string;
  }>;
  reviewQueue: string[];
  fullyEstimatedVenues: string[];
  goldenCases: Array<{
    id: string;
    name: string;
    confidence: string;
    coordinateSource: string;
    terraceCoordinateSource: string;
    archetype: string;
  }>;
}

const root = path.resolve(__dirname, "../..");
const terracesPath = path.join(root, "src/data/terraces.json");
const buildingIndexPath = path.join(root, "src/data/buildingIndex.json");
const goldenPath = path.join(root, "evals/goldenCases.json");
const outPath = path.join(root, "evals/latest-report.json");
const outMdPath = path.join(root, "evals/latest-report.md");

function increment(map: Record<string, number>, key: string) {
  map[key] = (map[key] || 0) + 1;
}

function getHeightSource(building: BuildingInfo): string {
  if (building.heightSource) return building.heightSource;
  if (building.levels !== null && building.levels > 0) return "osm-levels";
  if (building.height !== 15) return "overture";
  return "default-estimate";
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function main() {
  const terraces = JSON.parse(fs.readFileSync(terracesPath, "utf-8")) as Terrace[];
  const buildingIndex = JSON.parse(fs.readFileSync(buildingIndexPath, "utf-8")) as Record<string, BuildingInfo[]>;
  const golden = JSON.parse(fs.readFileSync(goldenPath, "utf-8")) as Array<{ id: string; name: string }>;

  const coordinateSources: Record<string, number> = {};
  const terraceCoordinateSources: Record<string, number> = {};
  const confidence: Record<string, number> = {};
  const heightSources: Record<string, number> = {};
  const archetypeMap: Record<string, number> = {};

  let explicitTerracePoints = 0;
  let implicitTerracePoints = 0;
  let realLidarCount = 0;
  let noScheduleCount = 0;
  let needsReviewCount = 0;
  const reviewQueue: string[] = [];

  const venueRows = terraces.map((terrace) => {
    const buildings = buildingIndex[terrace.id] || [];
    const quality = getTerraceQuality(terrace, buildings);

    increment(coordinateSources, terrace.coordinateSource || "missing");
    increment(
      terraceCoordinateSources,
      terrace.terraceCoordinateSource || terrace.coordinateSource || "missing"
    );
    increment(confidence, quality.confidence);
    increment(archetypeMap, quality.archetype);

    if (terrace.terraceLat !== undefined && terrace.terraceLng !== undefined) {
      explicitTerracePoints++;
    } else {
      implicitTerracePoints++;
    }

    if (hasRealLidarSchedule(terrace.id)) {
      realLidarCount++;
    } else {
      noScheduleCount++;
    }

    if (getNeedsTerraceReview(terrace)) {
      needsReviewCount++;
      reviewQueue.push(terrace.id);
    }

    for (const b of buildings) increment(heightSources, getHeightSource(b));

    return {
      id: terrace.id,
      name: terrace.name,
      confidence: quality.confidence,
      heightCoverage: quality.heightCoverage,
      coordinateSource: terrace.coordinateSource || "missing",
      terraceCoordinateSource: terrace.terraceCoordinateSource || terrace.coordinateSource || "missing",
      archetype: quality.archetype,
    };
  });

  const weakestVenues = [...venueRows]
    .sort((a, b) => a.heightCoverage - b.heightCoverage)
    .slice(0, 10);

  const fullyEstimatedVenues = terraces
    .filter((terrace) => {
      const buildings = buildingIndex[terrace.id] || [];
      return buildings.length > 0 && buildings.every((b) => getHeightSource(b) === "default-estimate");
    })
    .map((t) => t.id);

  const goldenCases = golden.map((g) => {
    const row = venueRows.find((v) => v.id === g.id);
    return {
      id: g.id,
      name: g.name,
      confidence: row?.confidence || "missing",
      coordinateSource: row?.coordinateSource || "missing",
      terraceCoordinateSource: row?.terraceCoordinateSource || "missing",
      archetype: row?.archetype || "missing",
    };
  });

  const report: EvalReport = {
    generatedAt: new Date().toISOString(),
    venueCount: terraces.length,
    coordinateSources,
    terraceCoordinateSources,
    confidence,
    terracePointCoverage: { explicit: explicitTerracePoints, implicit: implicitTerracePoints },
    lidarCoverage: { realLidar: realLidarCount, noSchedule: noScheduleCount },
    heightSources,
    archetypes: archetypeMap,
    needsTerraceReview: needsReviewCount,
    weakestVenues,
    reviewQueue,
    fullyEstimatedVenues,
    goldenCases,
  };

  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + "\n");

  const md = `# Latest Eval Report\n\nGenerated: ${report.generatedAt}\n\n## Overview\n- Venues: ${report.venueCount}\n- Explicit terrace points: ${report.terracePointCoverage.explicit}\n- Implicit terrace points: ${report.terracePointCoverage.implicit}\n- Needs terrace review: ${report.needsTerraceReview}\n\n## LiDAR Coverage\n- Real LiDAR shadow schedules: ${report.lidarCoverage.realLidar}\n- No schedule (fallback): ${report.lidarCoverage.noSchedule}\n\n## Confidence\n${Object.entries(report.confidence).map(([k,v]) => `- ${k}: ${v}`).join("\n")}\n\n## Archetypes\n${Object.entries(report.archetypes).map(([k,v]) => `- ${k}: ${v}`).join("\n")}\n\n## Coordinate Sources\n${Object.entries(report.coordinateSources).map(([k,v]) => `- ${k}: ${v}`).join("\n")}\n\n## Terrace Coordinate Sources\n${Object.entries(report.terraceCoordinateSources).map(([k,v]) => `- ${k}: ${v}`).join("\n")}\n\n## Building Data Sources (legacy fallback)\nThese building heights are used for visual display only. Shadow accuracy comes from LiDAR schedules.\n${Object.entries(report.heightSources).map(([k,v]) => `- ${k}: ${v}`).join("\n")}\n\n## Review Queue (needs terrace pinning)\n${report.reviewQueue.length ? report.reviewQueue.map(v => `- ${v}`).join("\n") : '- none'}\n\n## Weakest Venues\n${report.weakestVenues.map(v => `- ${v.id}: ${v.confidence}, archetype=${v.archetype}, height=${pct(v.heightCoverage)}, coord=${v.coordinateSource}, terrace=${v.terraceCoordinateSource}`).join("\n")}\n\n## Fully Estimated Venues\n${report.fullyEstimatedVenues.length ? report.fullyEstimatedVenues.map(v => `- ${v}`).join("\n") : '- none'}\n\n## Golden Cases\n${report.goldenCases.map(v => `- ${v.id}: confidence=${v.confidence}, archetype=${v.archetype}, coord=${v.coordinateSource}, terrace=${v.terraceCoordinateSource}`).join("\n")}\n`;

  fs.writeFileSync(outMdPath, md);
  console.log(`Wrote ${outPath}`);
  console.log(`Wrote ${outMdPath}`);
}

main();
