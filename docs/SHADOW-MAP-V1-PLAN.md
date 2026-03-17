# Shadow Map V1 — Implementation Plan

## Goal
2D shadow visualization like ShadeMap: building shadows projected on the map, moving in real-time with the time slider.

---

## Visual Design

### Map Style: Dark Mode with Warm Accents

**Base map:** Dark gray/charcoal (#0f0f0f to #1a1a1a)
- Matches current app aesthetic
- Makes shadows and sunny areas pop
- Easy on the eyes for evening use

**Color Palette:**
```
Background:     #0f0f0f (near black)
Streets:        #1f1f1f (subtle dark gray)
Water:          #0a1628 (deep navy)
Parks:          #0f1f0f (dark green tint)
Buildings:      #2a2a2a (medium gray fill)
Building edge:  #3a3a3a (lighter outline)
Shadows:        #000033 at 50% opacity (deep blue-black)
Sunny ground:   #1a1a1a (no overlay — just base map)
```

**Why blue-tinted shadows?**
- Pure black shadows look flat/dead
- Blue tint mimics real ambient sky light in shadows
- Creates depth and atmosphere
- Same approach as ShadeMap

### Terrace Markers

**Sun status colors (keep current):**
```
Sunny:    #FFB800 (warm gold)
Partial:  #FF8C00 (orange)  
Shaded:   #4A5568 (cool gray)
```

**Marker style:**
- Circle with white border (current)
- Size: 12px default, 16px selected
- Slight glow/shadow for depth
- Favorite heart overlay (keep)

### UI Layout

```
┌─────────────────────────────────────────┐
│                                         │
│              MAP VIEW                   │
│         (full screen map)               │
│                                         │
│   ○ Sunny terrace                       │
│   ○ Shaded terrace                      │
│                                         │
│   ████████░░░░░░░░  (shadow areas)      │
│                                         │
├─────────────────────────────────────────┤
│  ☀️  ───────●─────────────────  🌙      │
│       8:00    12:00    18:00   22:00    │
│                                         │
│  📅 Mar 16, 2026              [Today]   │
└─────────────────────────────────────────┘
```

**Time Slider (enhanced):**
- Sun icon on left, moon on right
- Current time shown above thumb
- Tick marks at key hours (8, 12, 16, 20)
- Smooth drag with instant shadow update

**Date Picker:**
- Compact date display
- "Today" quick button
- Calendar dropdown for other dates
- Shows day of week

### Shadow Animation

**On slider drag:**
- Shadows update at 60fps (GPU-accelerated)
- Smooth interpolation between positions
- No flicker or jarring jumps

**Visual feedback:**
- As shadows move over a terrace marker, its color updates
- Subtle pulse animation when status changes

---

## Technical Architecture

### Stack

```
MapLibre GL JS          — Map rendering (free, open source)
mapbox-gl-shadow-simulator — Shadow projection
SunCalc                 — Sun position (already in use)
React                   — UI (already in use)
```

### Data Flow

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│ Time Slider │────▶│   SunCalc    │────▶│ Shadow Simulator│
│  (minutes)  │     │ (sun angle)  │     │  (projections)  │
└─────────────┘     └──────────────┘     └─────────────────┘
                                                  │
┌─────────────┐                                   ▼
│  Buildings  │──────────────────────────▶ MapLibre GL
│  (GeoJSON)  │                           (render all)
└─────────────┘
```

### File Structure

```
src/
├── components/
│   ├── MapViewGL.tsx        # NEW: MapLibre-based map
│   ├── MapView.tsx          # OLD: Leaflet (keep as backup)
│   ├── TimeSlider.tsx       # ENHANCE: add date picker
│   └── ShadowLayer.tsx      # NEW: shadow simulator wrapper
├── lib/
│   ├── buildingGeoJSON.ts   # NEW: convert buildings to GeoJSON
│   ├── sunCalc.ts           # EXISTING
│   └── mapStyle.ts          # NEW: dark map style definition
├── data/
│   ├── buildings/           # EXISTING: venue buildings
│   ├── lisbon-buildings.json # NEW: city-wide buildings
│   └── terraces.json        # EXISTING
└── styles/
    └── maplibre.css         # NEW: MapLibre styles
```

---

## Implementation Phases

### Phase 0: City-Wide Building Data (1.5 hrs)

**0a. Download Lisbon buildings from OSM**
```bash
# Overpass query for all buildings in central Lisbon
curl -X POST "https://overpass-api.de/api/interpreter" \
  -d '[out:json][timeout:120];
      way["building"](38.70,-9.20,38.76,-9.10);
      out body geom;' \
  > lisbon-buildings-raw.json
```

**0b. Process to GeoJSON with heights**
```javascript
// Extract footprints + heights
buildings.map(way => ({
  type: "Feature",
  properties: {
    id: way.id,
    height: way.tags.height || (way.tags["building:levels"] * 3) || 10
  },
  geometry: {
    type: "Polygon",
    coordinates: [way.geometry.map(n => [n.lon, n.lat])]
  }
}))
```

**0c. (Optional) Enhance heights from LiDAR**
- For buildings without OSM height, sample MDS tiles
- This can be a follow-up improvement

**Output:** `src/data/lisbon-buildings.json` (~2-5MB)

---

### Phase 1: Dependencies & Setup (30 min)

```bash
cd ~/code/terrace-sun-tracker
npm install maplibre-gl mapbox-gl-shadow-simulator
```

**Create map style:**
```typescript
// src/lib/mapStyle.ts
export const darkMapStyle: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "carto-dark": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png"
      ],
      tileSize: 256,
    }
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#0f0f0f" }
    },
    {
      id: "carto-tiles",
      type: "raster",
      source: "carto-dark"
    }
  ]
};
```

---

### Phase 2: Building Data Loader (30 min)

```typescript
// src/lib/buildingGeoJSON.ts
import lisbonBuildings from "@/data/lisbon-buildings.json";

export function getAllBuildings(): GeoJSON.FeatureCollection {
  return lisbonBuildings as GeoJSON.FeatureCollection;
}

// For shadow simulator's getFeatures callback
export function getBuildingFeatures(): GeoJSON.Feature[] {
  return lisbonBuildings.features;
}
```

---

### Phase 3: MapLibre + Shadow Simulator (2 hrs)

```typescript
// src/components/MapViewGL.tsx
"use client";

import { useEffect, useRef, useMemo } from "react";
import maplibregl from "maplibre-gl";
import ShadeMap from "mapbox-gl-shadow-simulator";
import { darkMapStyle } from "@/lib/mapStyle";
import { getBuildingFeatures } from "@/lib/buildingGeoJSON";
import "maplibre-gl/dist/maplibre-gl.css";

interface Props {
  selectedTime: Date;
  terraces: TerraceWithStatus[];
  onSelectVenue: (id: string) => void;
  selectedId: string | null;
}

export default function MapViewGL({ selectedTime, terraces, onSelectVenue, selectedId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const shadeMapRef = useRef<ShadeMap | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: darkMapStyle,
      center: [-9.142, 38.716],
      zoom: 14,
    });

    map.on("load", () => {
      // Add building layer (just outlines, shadows are separate)
      map.addSource("buildings", {
        type: "geojson",
        data: { type: "FeatureCollection", features: getBuildingFeatures() }
      });

      map.addLayer({
        id: "building-fills",
        type: "fill",
        source: "buildings",
        paint: {
          "fill-color": "#2a2a2a",
          "fill-opacity": 0.8
        }
      });

      map.addLayer({
        id: "building-outlines",
        type: "line",
        source: "buildings",
        paint: {
          "line-color": "#3a3a3a",
          "line-width": 0.5
        }
      });

      // Initialize shadow simulator
      const shadeMap = new ShadeMap({
        date: selectedTime,
        color: "#000033",
        opacity: 0.5,
        terrainSource: {
          tileSize: 256,
          maxZoom: 15,
          getSourceUrl: ({ x, y, z }) =>
            `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
          getElevation: ({ r, g, b }) => (r * 256 + g + b / 256) - 32768,
        },
        getFeatures: () => getBuildingFeatures(),
      });

      shadeMap.addTo(map);
      shadeMapRef.current = shadeMap;
    });

    mapRef.current = map;

    return () => {
      shadeMapRef.current?.remove();
      map.remove();
    };
  }, []);

  // Update shadows when time changes
  useEffect(() => {
    if (shadeMapRef.current) {
      shadeMapRef.current.setDate(selectedTime);
    }
  }, [selectedTime]);

  // Add terrace markers
  useEffect(() => {
    if (!mapRef.current) return;
    
    // Clear existing markers
    document.querySelectorAll(".terrace-marker").forEach(el => el.remove());

    terraces.forEach(terrace => {
      const color = terrace.sunStatus === "sunny" ? "#FFB800" 
                  : terrace.sunStatus === "partial" ? "#FF8C00" 
                  : "#4A5568";

      const el = document.createElement("div");
      el.className = "terrace-marker";
      el.style.cssText = `
        width: ${selectedId === terrace.id ? 16 : 12}px;
        height: ${selectedId === terrace.id ? 16 : 12}px;
        background: ${color};
        border: 2px solid white;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      `;

      new maplibregl.Marker({ element: el })
        .setLngLat([terrace.lng, terrace.lat])
        .addTo(mapRef.current!);

      el.addEventListener("click", () => onSelectVenue(terrace.id));
    });
  }, [terraces, selectedId, onSelectVenue]);

  return <div ref={containerRef} className="h-full w-full" />;
}
```

---

### Phase 4: Enhanced Time Slider with Date (1 hr)

```typescript
// src/components/TimeSlider.tsx (enhanced)
"use client";

import { useState } from "react";

interface Props {
  minutes: number;
  onMinutesChange: (m: number) => void;
  date: Date;
  onDateChange: (d: Date) => void;
}

export default function TimeSlider({ minutes, onMinutesChange, date, onDateChange }: Props) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const timeStr = `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;

  const setToday = () => onDateChange(new Date());

  return (
    <div className="bg-neutral-900 px-4 py-3 border-t border-neutral-800">
      {/* Time display */}
      <div className="text-center text-2xl font-light text-white mb-2">
        {timeStr}
      </div>

      {/* Slider */}
      <div className="flex items-center gap-3">
        <span className="text-lg">☀️</span>
        <input
          type="range"
          min={8 * 60}
          max={22 * 60}
          value={minutes}
          onChange={(e) => onMinutesChange(Number(e.target.value))}
          className="flex-1 h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
        />
        <span className="text-lg">🌙</span>
      </div>

      {/* Hour markers */}
      <div className="flex justify-between text-xs text-neutral-500 mt-1 px-6">
        <span>8:00</span>
        <span>12:00</span>
        <span>16:00</span>
        <span>20:00</span>
      </div>

      {/* Date picker */}
      <div className="flex items-center justify-center gap-3 mt-3">
        <input
          type="date"
          value={date.toISOString().split("T")[0]}
          onChange={(e) => onDateChange(new Date(e.target.value))}
          className="bg-neutral-800 text-white px-3 py-1 rounded border border-neutral-700 text-sm"
        />
        <button
          onClick={setToday}
          className="bg-amber-600 hover:bg-amber-500 text-white px-3 py-1 rounded text-sm"
        >
          Today
        </button>
      </div>
    </div>
  );
}
```

---

### Phase 5: Wire Up in Page (30 min)

```typescript
// src/app/page.tsx updates

const [selectedDate, setSelectedDate] = useState(new Date());
const [sliderMinutes, setSliderMinutes] = useState(getCurrentMinutes());

// Combine date + time
const selectedTime = useMemo(() => {
  const d = new Date(selectedDate);
  d.setHours(Math.floor(sliderMinutes / 60), sliderMinutes % 60, 0, 0);
  return d;
}, [selectedDate, sliderMinutes]);

// Render
<MapViewGL
  selectedTime={selectedTime}
  terraces={terracesWithStatus}
  onSelectVenue={handleSelectVenue}
  selectedId={selectedId}
/>

<TimeSlider
  minutes={sliderMinutes}
  onMinutesChange={setSliderMinutes}
  date={selectedDate}
  onDateChange={setSelectedDate}
/>
```

---

### Phase 6: Testing & Polish (1.5 hrs)

**Test cases:**
- [ ] Shadows render on map
- [ ] Shadows update when slider moves
- [ ] Shadows are longer in morning/evening
- [ ] Shadows are shorter at noon
- [ ] Shadows direction correct (north at noon in Lisbon)
- [ ] Date picker changes shadow angle
- [ ] Winter date = longer shadows
- [ ] Summer date = shorter shadows
- [ ] Terrace markers visible above shadows
- [ ] Markers change color based on shadow coverage
- [ ] Performance: 60fps during slider drag
- [ ] Mobile: touch slider works smoothly

**Polish:**
- Add loading state while buildings load
- Add attribution for data sources
- Optimize building GeoJSON file size
- Add "Return to current time" button

---

## Timeline

| Phase | Task | Time |
|-------|------|------|
| 0 | City-wide building data | 1.5 hrs |
| 1 | Dependencies & setup | 30 min |
| 2 | Building data loader | 30 min |
| 3 | MapLibre + shadow simulator | 2 hrs |
| 4 | Enhanced time slider | 1 hr |
| 5 | Wire up in page | 30 min |
| 6 | Testing & polish | 1.5 hrs |

**Total: ~7.5 hours**

---

## Future Enhancements (V2)

- **3D buildings:** Add fill-extrusion for 3D view with pitch/bearing controls
- **LiDAR height enhancement:** Sample MDS tiles for precise building heights
- **Shadow schedule cache:** Pre-compute shadow positions for faster scrubbing
- **Sun path visualization:** Show sun arc across the sky
- **Golden hour indicator:** Highlight magic hour times
- **Share time:** URL with embedded date/time for sharing

---

## Success Criteria

User can:
1. See Lisbon map with building outlines
2. See shadow projections matching current time
3. Drag slider → shadows animate smoothly across the city
4. Pick any date → shadows reflect that day's sun angle
5. See which terraces are sunny vs shaded at a glance
6. Tap terrace → see venue details
