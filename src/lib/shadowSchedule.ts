import type { SunStatus } from "@/types";

type ScheduleStatus = "sun" | "shade" | "below_horizon";

interface ShadowSchedule {
  venueId: string;
  lat: number;
  lng: number;
  computedAt: string;
  schedule: Record<string, Record<string, ScheduleStatus>>;
}

// Lazy-loaded cache of shadow schedules keyed by venue ID
const scheduleCache = new Map<string, ShadowSchedule | null>();

function loadSchedule(venueId: string): ShadowSchedule | null {
  if (scheduleCache.has(venueId)) {
    return scheduleCache.get(venueId)!;
  }
  try {
    // eslint-disable-next-line
    const data = require(`@/data/shadow-schedules/${venueId}.json`) as ShadowSchedule;
    scheduleCache.set(venueId, data);
    return data;
  } catch {
    scheduleCache.set(venueId, null);
    return null;
  }
}

/**
 * Map shadow schedule status values to app SunStatus.
 * Schedule uses "sun"/"shade"/"below_horizon"; app uses "sunny"/"partial"/"shaded".
 */
function mapStatus(status: ScheduleStatus): SunStatus {
  if (status === "sun") return "sunny";
  return "shaded"; // both "shade" and "below_horizon" → shaded
}

/**
 * Get sun status from pre-computed shadow schedule.
 * Returns the mapped status or "unknown" if no data exists.
 */
export function getSunStatus(
  venueId: string,
  month: number,
  hour: number
): "sun" | "shade" | "below_horizon" | "unknown" {
  const schedule = loadSchedule(venueId);
  if (!schedule) return "unknown";
  const monthData = schedule.schedule[String(month)];
  if (!monthData) return "unknown";
  const status = monthData[String(hour)];
  if (!status) return "unknown";
  return status;
}

/**
 * Get a full day timeline for a venue in a given month.
 */
export function getVenueSunTimeline(
  venueId: string,
  month: number
): Array<{ hour: number; status: string }> {
  const schedule = loadSchedule(venueId);
  if (!schedule) return [];
  const monthData = schedule.schedule[String(month)];
  if (!monthData) return [];
  return Object.entries(monthData)
    .map(([h, status]) => ({ hour: Number(h), status }))
    .sort((a, b) => a.hour - b.hour);
}

/**
 * Check if a pre-computed shadow schedule exists for a venue.
 */
export function hasSchedule(venueId: string): boolean {
  return loadSchedule(venueId) !== null;
}

/**
 * Get the SunStatus from a shadow schedule for a given venue and date.
 * For half-hour slots, uses the enclosing hour's status.
 * Returns null if no schedule data is available (caller should fall back).
 */
export function getScheduleStatus(
  venueId: string,
  date: Date
): SunStatus | null {
  const month = date.getMonth() + 1; // JS months are 0-based
  const hour = date.getHours();
  const raw = getSunStatus(venueId, month, hour);
  if (raw === "unknown") return null;
  return mapStatus(raw);
}
