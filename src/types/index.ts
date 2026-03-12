export type VenueType = "bar" | "restaurant" | "cafe";

export type SunStatus = "sunny" | "partial" | "shaded";

export type SortMode = "sunny_now" | "sunny_next" | "rating" | "nearest";

export type FilterMode = "all" | "sunny" | "partial" | "shaded" | "saved";

export interface Terrace {
  id: string;
  name: string;
  type: VenueType;
  address: string;
  lat: number;
  lng: number;
  facingDegrees: number;
  shadingRadius: number;
  rating: number;
  priceLevel: number;
  tags: string[];
  description: string;
}

export interface TerraceWithStatus extends Terrace {
  sunStatus: SunStatus;
  nextSunnyTime: Date | null;
  sunEndTime: Date | null;
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
