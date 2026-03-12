"use client";

import type { TerraceWithStatus, SortMode } from "@/types";
import { priceLevelString, formatTime, sortTerraces, sunStatusColor, venueTypeIcon } from "@/lib/utils";

interface ListViewProps {
  terraces: TerraceWithStatus[];
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  onSelectVenue: (id: string) => void;
  favorites: Set<string>;
  onToggleFavorite: (id: string) => void;
}

const sortOptions: { value: SortMode; label: string }[] = [
  { value: "sunny_now", label: "Sunny Now" },
  { value: "sunny_next", label: "Sunny Next" },
  { value: "rating", label: "Top Rated" },
  { value: "nearest", label: "Nearest" },
];

function SunStatusLine({ venue }: { venue: TerraceWithStatus }) {
  if (venue.sunStatus === "sunny" && venue.sunEndTime) {
    return (
      <span className="text-[11px] font-medium text-amber-400">
        ☀️ Sunny until {formatTime(venue.sunEndTime)}
      </span>
    );
  }
  if (venue.sunStatus !== "sunny" && venue.nextSunnyTime) {
    return (
      <span className="text-[11px] font-medium text-amber-400">
        ☀️ Sunny from {formatTime(venue.nextSunnyTime)}
      </span>
    );
  }
  if (venue.sunStatus === "sunny") {
    return (
      <span className="text-[11px] font-medium text-amber-400">
        ☀️ Sunny
      </span>
    );
  }
  return (
    <span className="text-[11px] font-medium text-neutral-500">
      ☁️ Shaded
    </span>
  );
}

export default function ListView({
  terraces,
  sortMode,
  onSortChange,
  onSelectVenue,
  favorites,
  onToggleFavorite,
}: ListViewProps) {
  const sorted = sortTerraces(terraces, sortMode);

  return (
    <div className="flex h-full flex-col">
      {/* Sort bar */}
      <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar">
        {sortOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSortChange(opt.value)}
            className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
              sortMode === opt.value
                ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                : "bg-white/5 text-neutral-400 hover:bg-white/10 hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Venue list */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="space-y-2">
          {sorted.map((venue) => (
            <button
              key={venue.id}
              onClick={() => onSelectVenue(venue.id)}
              className="group w-full flex rounded-xl bg-[#1a1a1a] border border-[#2a2a2a] overflow-hidden text-left transition-all hover:bg-[#222] active:scale-[0.98]"
            >
              {/* Left color bar */}
              <div
                className="w-[3px] shrink-0"
                style={{ backgroundColor: sunStatusColor(venue.sunStatus) }}
              />

              <div className="flex-1 p-3.5 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-white truncate">
                      {venueTypeIcon(venue.type)} {venue.name}
                    </h3>
                    <p className="text-[11px] text-neutral-400 mt-0.5">
                      <span className="text-amber-400">★ {venue.rating}</span>
                      {" · "}
                      {priceLevelString(venue.priceLevel)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(venue.id);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                      aria-label={favorites.has(venue.id) ? "Remove from favorites" : "Add to favorites"}
                    >
                      <span className="text-sm">
                        {favorites.has(venue.id) ? "❤️" : "🤍"}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="mt-1.5">
                  <SunStatusLine venue={venue} />
                </div>

                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {venue.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-neutral-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
