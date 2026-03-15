import type { Terrace } from "@/types";

export function getTerracePoint(venue: Terrace): { lat: number; lng: number } {
  return {
    lat: venue.terraceLat ?? venue.lat,
    lng: venue.terraceLng ?? venue.lng,
  };
}

export function getTerraceCoordinateSource(venue: Terrace) {
  return venue.terraceCoordinateSource ?? venue.coordinateSource ?? "estimated";
}
