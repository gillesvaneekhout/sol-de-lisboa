import type { Terrace, TerraceArchetype } from "@/types";

const ARCHETYPE_BY_ID: Record<string, TerraceArchetype> = {
  "park-bar": "rooftop",
  "silk-club": "rooftop",
  "topo-chiado": "rooftop",
  "topo-martim-moniz": "rooftop",
  "memmo-alfama": "rooftop",
  "rio-maravilha": "rooftop",
  "noobai": "miradouro",
  "portas-do-sol": "miradouro",
  "graca-esplanada": "miradouro",
  "chapito": "miradouro",
  "quiosque-ribeira": "waterfront",
  "quiosque-renatinho": "waterfront",
  "timeout-market": "waterfront",
  "lost-in": "courtyard",
  "jardim-dos-sentidos": "courtyard",
  "landeau": "street",
  "cafe-a-brasileira": "street",
  "bistro-100-maneiras": "street",
  "pensao-amor": "street",
  "pavilhao-chines": "street",
  "dear-breakfast": "street",
  "senhor-uva": "street",
  "pharmacia": "street",
  "cervejaria-trindade": "street",
  "bettina-corallo": "street",
  "espresso-largo": "street",
  "majong": "street",
  "limao": "street",
  "bar-da-fabrica": "rooftop",
  "cafe-garagem": "miradouro",
};

// Tag heuristics as fallback
const ROOFTOP_TAGS = ["rooftop"];
const MIRADOURO_TAGS = ["views", "viewpoint", "miradouro"];
const WATERFRONT_TAGS = ["waterfront", "river", "tagus"];
const COURTYARD_TAGS = ["garden", "courtyard", "hidden"];

export function getArchetype(terrace: Terrace): TerraceArchetype {
  if (terrace.archetype && terrace.archetype !== "unknown") return terrace.archetype;
  if (ARCHETYPE_BY_ID[terrace.id]) return ARCHETYPE_BY_ID[terrace.id];
  const tags = terrace.tags.map((t) => t.toLowerCase());
  if (ROOFTOP_TAGS.some((t) => tags.includes(t))) return "rooftop";
  if (MIRADOURO_TAGS.some((t) => tags.includes(t))) return "miradouro";
  if (WATERFRONT_TAGS.some((t) => tags.includes(t))) return "waterfront";
  if (COURTYARD_TAGS.some((t) => tags.includes(t))) return "courtyard";
  return "unknown";
}

// Sky exposure factor per archetype — used to weight confidence and shadow heuristics
export const ARCHETYPE_SKY_FACTOR: Record<TerraceArchetype, number> = {
  rooftop: 1.0,
  miradouro: 0.95,
  waterfront: 0.9,
  courtyard: 0.6,
  street: 0.7,
  unknown: 0.5,
};

// Whether a venue archetype typically needs a dedicated terrace point
export function needsExplicitTerracePoint(archetype: TerraceArchetype): boolean {
  return archetype === "rooftop" || archetype === "miradouro" || archetype === "courtyard";
}

export function getNeedsTerraceReview(terrace: Terrace): boolean {
  if (terrace.needsTerraceReview !== undefined) return terrace.needsTerraceReview;
  const archetype = getArchetype(terrace);
  if (!needsExplicitTerracePoint(archetype)) return false;
  return terrace.terraceLat === undefined || terrace.terraceLng === undefined;
}
