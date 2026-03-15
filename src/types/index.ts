export type VenueType = "bar" | "restaurant" | "cafe";

export type SunStatus = "sunny" | "partial" | "shaded";

export type SortMode = "sunny_now" | "sunny_next" | "rating" | "nearest";

export type FilterMode = "all" | "sunny" | "partial" | "shaded" | "saved";

export type DataConfidence = "high" | "medium" | "low";
export type CoordinateSource = "osm" | "curated" | "estimated";
export type HeightSource = "osm-levels" | "overture" | "eubucco" | "default-estimate";
export type TerraceArchetype =
  | "rooftop"
  | "miradouro"
  | "waterfront"
  | "courtyard"
  | "street"
  | "unknown";

export interface Terrace {
  id: string;
  name: string;
  type: VenueType;
  address: string;
  lat: number;
  lng: number;
  terraceLat?: number;
  terraceLng?: number;
  coordinateSource?: CoordinateSource;
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

export interface TerraceQuality {
  confidence: DataConfidence;
  summary: string;
  coordinateSource: CoordinateSource;
  totalBuildings: number;
  buildingsWithMeasuredHeight: number;
  heightCoverage: number;
  archetype: TerraceArchetype;
}

export interface TerraceWithStatus extends Terrace {
  sunStatus: SunStatus;
  nextSunnyTime: Date | null;
  sunEndTime: Date | null;
  quality: TerraceQuality;
}

export interface SunPosition {
  azimuth: number;
  altitude: number;
}

export interface BuildingInfo {
  id: number;
  height: number;
  levels: number | null;
  polygon: Array<[number, number]>;
  centroid: [number, number];
  type: string;
  heightSource?: HeightSource;
}

export interface VenueBuildingData {
  venueId: string;
  venueName: string;
  lat: number;
  lng: number;
  fetchedAt: string;
  buildingCount: number;
  buildings: BuildingInfo[];
}
