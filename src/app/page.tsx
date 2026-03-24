"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import type { SortMode, TerraceWithStatus, FilterMode, BuildingInfo } from "@/types";
import { getTerraceStatus, findNextSunnyTime, findSunEndTime } from "@/lib/sunCalc";
import { getTerraceQuality } from "@/lib/dataQuality";
import terraceData from "@/data/terraces.json";
import type { Terrace } from "@/types";
import { AnimatePresence, motion } from "framer-motion";
import TimeSlider from "@/components/TimeSlider";
import ListView from "@/components/ListView";
import VenueSheet from "@/components/VenueSheet";

// Old Leaflet map (backup)
const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#0f0f0f]">
      <div className="animate-pulse text-neutral-600">Loading map...</div>
    </div>
  ),
});

// MapLibre GL map with GPU shadow visualization
const ShadowMapGL = dynamic(() => import("@/components/ShadowMapGL"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-[#0f0f0f]">
      <div className="animate-pulse text-neutral-600">Loading GPU shadow map...</div>
    </div>
  ),
});

const terraces = terraceData as Terrace[];

// Building data indexed by venue ID, bundled at build time
import buildingIndex from "@/data/buildingIndex.json";
const buildingData = buildingIndex as unknown as Record<string, BuildingInfo[]>;

function getTimeFromMinutes(minutes: number, baseDate: Date): Date {
  const d = new Date(baseDate);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

function getCurrentMinutes(): number {
  const now = new Date();
  const hours = now.getHours();
  const minutes = hours * 60 + now.getMinutes();
  // Outside hours: default to last valid hour (22:00) instead of jumping to 08:00
  if (hours < 8 || hours >= 22) return 22 * 60;
  return Math.max(8 * 60, Math.min(22 * 60, minutes));
}

function isOutsideHours(): boolean {
  const now = new Date();
  const hours = now.getHours();
  return hours < 8 || hours >= 22;
}

const FAVORITES_KEY = "sol-de-lisboa-favorites";

// Toggle to use new shadow map or classic map
const USE_SHADOW_MAP = true;

function loadFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function saveFavorites(favs: Set<string>) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favs]));
  } catch {}
}

const filterOptions: { value: FilterMode; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sunny", label: "\u2600\uFE0F Sunny" },
  { value: "partial", label: "\uD83C\uDF24 Partial" },
  { value: "shaded", label: "\u2601\uFE0F Shaded" },
  { value: "saved", label: "\u2764\uFE0F Saved" },
];

export default function Home() {
  const [view, setView] = useState<"map" | "list">("map");
  const [timeMinutes, setTimeMinutes] = useState(getCurrentMinutes);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("sunny_now");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [outsideHours, setOutsideHours] = useState(false);

  useEffect(() => {
    setFavorites(loadFavorites());
    setOutsideHours(isOutsideHours());
  }, []);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      saveFavorites(next);
      return next;
    });
  }, []);

  const handleNow = useCallback(() => {
    setTimeMinutes(getCurrentMinutes());
  }, []);

  // Combine selected date with time slider
  const selectedDateTime = useMemo(
    () => getTimeFromMinutes(timeMinutes, selectedDate),
    [timeMinutes, selectedDate]
  );

  const terracesWithStatus: TerraceWithStatus[] = useMemo(() => {
    return terraces.map((t) => {
      const buildings = buildingData[t.id];
      const sunStatus = getTerraceStatus(t, selectedDateTime, buildings);
      return {
        ...t,
        sunStatus,
        nextSunnyTime: sunStatus !== "sunny" ? findNextSunnyTime(t, selectedDateTime, buildings) : null,
        sunEndTime: sunStatus === "sunny" ? findSunEndTime(t, selectedDateTime, buildings) : null,
        quality: getTerraceQuality(t, buildings),
      };
    });
  }, [selectedDateTime]);

  const filteredTerraces = useMemo(() => {
    if (filterMode === "all") return terracesWithStatus;
    if (filterMode === "saved") return terracesWithStatus.filter((t) => favorites.has(t.id));
    return terracesWithStatus.filter((t) => t.sunStatus === filterMode);
  }, [terracesWithStatus, filterMode, favorites]);

  const selectedVenue = useMemo(
    () => terracesWithStatus.find((t) => t.id === selectedId) ?? null,
    [terracesWithStatus, selectedId]
  );

  const handleSelectVenue = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const handleCloseSheet = useCallback(() => {
    setSelectedId(null);
  }, []);

  const sunnyCount = filteredTerraces.filter(
    (t) => t.sunStatus === "sunny"
  ).length;

  return (
    <main className="relative h-[100dvh] w-full bg-[#0f0f0f]">
      {/* Full-screen content layer */}
      <div className="absolute inset-0">
        {view === "map" ? (
          USE_SHADOW_MAP ? (
            <ShadowMapGL
              terraces={filteredTerraces}
              selectedTime={selectedDateTime}
              onSelectVenue={handleSelectVenue}
              selectedId={selectedId}
              favorites={favorites}
            />
          ) : (
            <MapView
              terraces={filteredTerraces}
              onSelectVenue={handleSelectVenue}
              selectedId={selectedId}
              favorites={favorites}
            />
          )
        ) : (
          <div className="h-full pt-28 pb-24">
            <ListView
              terraces={filteredTerraces}
              sortMode={sortMode}
              onSortChange={setSortMode}
              onSelectVenue={handleSelectVenue}
              favorites={favorites}
              onToggleFavorite={toggleFavorite}
            />
          </div>
        )}
      </div>

      {/* Floating header */}
      <header className="absolute left-4 right-4 top-4 z-[500]">
        <div className="flex items-center justify-between rounded-2xl glass px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15">
              <span className="text-lg">{"\u2600\uFE0F"}</span>
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">
                Sol de Lisboa
              </h1>
              <p className="text-[11px] text-neutral-400" suppressHydrationWarning>
                {outsideHours ? (
                  <span className="text-neutral-500">Showing evening view</span>
                ) : (
                  <>{sunnyCount} sunny terrace{sunnyCount !== 1 ? "s" : ""} now</>
                )}
              </p>
            </div>
          </div>

          <div className="flex rounded-xl bg-white/5 p-0.5">
            <button
              data-testid="view-map"
              onClick={() => setView("map")}
              className={`rounded-lg px-5 py-2.5 text-xs font-semibold transition-all min-h-[44px] active:scale-95 ${
                view === "map"
                  ? "bg-amber-500 text-black shadow-lg shadow-amber-500/25"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Map
            </button>
            <button
              data-testid="view-list"
              onClick={() => setView("list")}
              className={`rounded-lg px-5 py-2.5 text-xs font-semibold transition-all min-h-[44px] active:scale-95 ${
                view === "list"
                  ? "bg-amber-500 text-black shadow-lg shadow-amber-500/25"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              List
            </button>
          </div>
        </div>

        {/* Filter pills - increased touch targets */}
        <div className="flex gap-2 overflow-x-auto mt-2 px-1 no-scrollbar" data-testid="filter-bar">
          {filterOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilterMode(opt.value)}
              className={`whitespace-nowrap rounded-full px-4 py-2.5 text-xs font-semibold transition-all min-h-[44px] ${
                filterMode === opt.value
                  ? opt.value === "sunny"
                    ? "bg-amber-500 text-black shadow-lg shadow-amber-500/20"
                    : opt.value === "all"
                    ? "bg-white/25 text-white ring-1 ring-white/50 font-bold"
                    : "bg-white/15 text-white"
                  : "glass text-neutral-400 hover:text-white active:scale-95"
              }`}
              data-testid={`filter-${opt.value}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </header>

      {/* After-hours banner */}
      {outsideHours && (
        <div className="absolute left-4 right-4 top-[140px] z-[450]">
          <div className="rounded-xl bg-neutral-800/90 backdrop-blur-md border border-neutral-700 px-4 py-3 text-center">
            <p className="text-sm font-medium text-white">🌙 Sun has set for the day</p>
            <p className="text-xs text-neutral-400 mt-1">
              Showing evening view — use the slider to plan ahead
            </p>
          </div>
        </div>
      )}

      {/* Floating time slider - with safe area */}
      <div className="absolute bottom-4 left-4 right-4 z-[500] safe-bottom" data-testid="time-slider-container">
        <div className="rounded-2xl glass px-4 py-4">
          <TimeSlider
            value={timeMinutes}
            onChange={setTimeMinutes}
            sunnyCount={sunnyCount}
            onNow={handleNow}
            date={selectedDate}
            onDateChange={setSelectedDate}
          />
        </div>
      </div>

      {/* Venue bottom sheet */}
      <AnimatePresence>
        {selectedVenue && (
          <>
            <motion.div
              className="fixed inset-0 z-[999] bg-black/50 backdrop-blur-sm"
              onClick={handleCloseSheet}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
            <VenueSheet
              venue={selectedVenue}
              selectedDate={selectedDateTime}
              onClose={handleCloseSheet}
              isFavorite={favorites.has(selectedVenue.id)}
              onToggleFavorite={() => toggleFavorite(selectedVenue.id)}
              buildings={buildingData[selectedVenue.id]}
            />
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
