import type { SortMode, TerraceWithStatus, VenueType } from "@/types";

/**
 * Format a Date to HH:MM string.
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString("pt-PT", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Calculate distance between two lat/lng points in km (Haversine formula).
 */
export function distanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Sort terraces based on the selected mode.
 */
export function sortTerraces(
  terraces: TerraceWithStatus[],
  mode: SortMode,
  userLat?: number,
  userLng?: number
): TerraceWithStatus[] {
  const sorted = [...terraces];

  switch (mode) {
    case "sunny_now":
      sorted.sort((a, b) => {
        const order = { sunny: 0, partial: 1, shaded: 2 };
        return order[a.sunStatus] - order[b.sunStatus];
      });
      break;

    case "sunny_next":
      sorted.sort((a, b) => {
        if (a.sunStatus === "sunny" && b.sunStatus !== "sunny") return -1;
        if (b.sunStatus === "sunny" && a.sunStatus !== "sunny") return 1;
        const aTime = a.nextSunnyTime?.getTime() ?? Infinity;
        const bTime = b.nextSunnyTime?.getTime() ?? Infinity;
        return aTime - bTime;
      });
      break;

    case "rating":
      sorted.sort((a, b) => b.rating - a.rating);
      break;

    case "nearest":
      if (userLat !== undefined && userLng !== undefined) {
        sorted.sort(
          (a, b) =>
            distanceKm(userLat, userLng, a.lat, a.lng) -
            distanceKm(userLat, userLng, b.lat, b.lng)
        );
      }
      break;
  }

  return sorted;
}

/**
 * Get the color for a sun status.
 */
export function sunStatusColor(status: string): string {
  switch (status) {
    case "sunny":
      return "#FBBF24";
    case "partial":
      return "#FB923C";
    case "shaded":
      return "#4B5563";
    default:
      return "#4B5563";
  }
}

/**
 * Price level to string.
 */
export function priceLevelString(level: number): string {
  return "\u20AC".repeat(level);
}

/**
 * Get venue type icon.
 */
export function venueTypeIcon(type: VenueType): string {
  switch (type) {
    case "bar":
      return "\uD83C\uDF7A";
    case "restaurant":
      return "\uD83C\uDF7D";
    case "cafe":
      return "\u2615";
  }
}

/**
 * Format a time difference in hours and minutes.
 */
export function formatTimeDiff(from: Date, to: Date): string {
  const diffMs = to.getTime() - from.getTime();
  if (diffMs <= 0) return "0min";
  const totalMin = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hours === 0) return `${mins}min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}
