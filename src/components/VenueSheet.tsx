"use client";

import type { TerraceWithStatus, BuildingInfo } from "@/types";
import SunBadge from "./SunBadge";
import { priceLevelString, formatTime, venueTypeIcon, formatTimeDiff } from "@/lib/utils";
import { getTerraceStatus } from "@/lib/sunCalc";

interface VenueSheetProps {
  venue: TerraceWithStatus;
  selectedDate: Date;
  onClose: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  buildings?: BuildingInfo[];
}

function generateTimeline(
  venue: TerraceWithStatus,
  baseDate: Date,
  buildings?: BuildingInfo[]
): { time: string; hour: number; minute: number; status: "sunny" | "partial" | "shaded" }[] {
  const slots: { time: string; hour: number; minute: number; status: "sunny" | "partial" | "shaded" }[] = [];
  for (let h = 8; h <= 21; h++) {
    for (let m = 0; m < 60; m += 30) {
      if (h === 21 && m === 30) break;
      const d = new Date(baseDate);
      d.setHours(h, m, 0, 0);
      const status = getTerraceStatus(venue, d, buildings);
      slots.push({
        time: `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`,
        hour: h,
        minute: m,
        status,
      });
    }
  }
  return slots;
}

function getSunnySummary(
  venue: TerraceWithStatus,
  selectedDate: Date
): string {
  if (venue.sunStatus === "sunny" && venue.sunEndTime) {
    return `Sunny until ${formatTime(venue.sunEndTime)} (${formatTimeDiff(selectedDate, venue.sunEndTime)} left)`;
  }
  if (venue.sunStatus !== "sunny" && venue.nextSunnyTime) {
    return `Next sunny: ${formatTime(venue.nextSunnyTime)} (in ${formatTimeDiff(selectedDate, venue.nextSunnyTime)})`;
  }
  if (venue.sunStatus === "sunny") {
    return "Sunny for the rest of the day";
  }
  return "No more sun expected today";
}

const statusColors: Record<string, string> = {
  sunny: "bg-amber-400",
  partial: "bg-orange-400",
  shaded: "bg-neutral-700",
};

export default function VenueSheet({
  venue,
  selectedDate,
  onClose,
  isFavorite,
  onToggleFavorite,
  buildings,
}: VenueSheetProps) {
  const timeline = generateTimeline(venue, selectedDate, buildings);
  const currentHour = selectedDate.getHours();
  const currentMinute = selectedDate.getMinutes();
  const sunnySummary = getSunnySummary(venue, selectedDate);

  // Calculate current time position as percentage of timeline
  const timelineStartMin = 8 * 60;
  const timelineEndMin = 21 * 60 + 30;
  const currentMin = currentHour * 60 + currentMinute;
  const timePercent = Math.max(0, Math.min(100,
    ((currentMin - timelineStartMin) / (timelineEndMin - timelineStartMin)) * 100
  ));

  return (
    <div className="bottom-sheet fixed inset-x-0 bottom-0 z-[1000] max-h-[75vh] overflow-y-auto rounded-t-[24px] bg-[#1a1a1a] border-t border-white/[0.06] shadow-2xl">
      {/* Handle */}
      <div className="sticky top-0 z-10 flex justify-center pt-3 pb-1 bg-[#1a1a1a] rounded-t-[24px]">
        <div className="h-1 w-10 rounded-full bg-neutral-700" />
      </div>

      {/* Header */}
      <div className="px-5 pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-white tracking-tight">{venue.name}</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              {venueTypeIcon(venue.type)}{" "}
              <span className="capitalize">{venue.type}</span>
              {" · "}
              {priceLevelString(venue.priceLevel)}
              {" · "}
              <span className="text-amber-400">★ {venue.rating}</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onToggleFavorite}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 hover:bg-white/10 transition-colors"
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <span className="text-lg">{isFavorite ? "❤️" : "🤍"}</span>
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-neutral-400 hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Sun Timeline Bar */}
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-neutral-600">
              Sun Timeline
            </h3>
            <SunBadge status={venue.sunStatus} size="sm" />
          </div>
          <div className="relative">
            <div className="flex gap-px rounded-lg overflow-hidden">
              {timeline.map((slot) => (
                <div
                  key={slot.time}
                  className={`h-6 flex-1 ${statusColors[slot.status]} transition-colors`}
                  title={`${slot.time}: ${slot.status}`}
                />
              ))}
            </div>
            {/* Current time indicator */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_rgba(255,255,255,0.6)]"
              style={{ left: `${timePercent}%` }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            {[8, 10, 12, 14, 16, 18, 20].map((h) => (
              <span key={h} className="text-[9px] tabular-nums text-neutral-600">
                {h}
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-[10px] text-neutral-600">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
              Sunny
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-orange-400" />
              Partial
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-neutral-700" />
              Shaded
            </span>
          </div>
        </div>

        {/* When is it sunny? */}
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2.5" data-testid="sun-summary">
          <span className="text-amber-400 text-sm">{venue.sunStatus === "sunny" ? "☀️" : "🔍"}</span>
          <span className="text-sm font-medium text-amber-400">
            {sunnySummary}
          </span>
        </div>

        {/* Address + Tags */}
        <p className="mt-3 text-xs text-neutral-500">{venue.address}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {venue.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-white/5 px-2.5 py-0.5 text-xs text-neutral-400"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
