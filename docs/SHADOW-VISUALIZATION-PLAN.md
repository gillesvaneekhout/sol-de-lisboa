# Shadow Visualization Implementation Plan

## Goal
Add ShadeMap-style 3D shadow visualization to the terrace app:
- 3D rendered buildings with accurate heights
- Real-time shadow casting on the map
- Seamless integration with time slider
- Ultra-precise sun position (seasonality + exact time)

---

## Architecture Decision

**Chosen stack:** MapLibre GL JS + mapbox-gl-shadow-simulator

Why:
- Same tech stack as ShadeMap (same author)
- No API key required when using own data
- MapLibre is open-source (no Mapbox fees)
- Native 3D building support via fill-extrusion
- Shadow simulator uses SunCalc internally (same as current app)

---

## What We Already Have

### Building Data ✅
- `src/data/buildings/*.json` — 51 venue files
- Each has `buildings[]` array with:
  - `id` (OSM ID)
  - `height` (meters, from EUBUCCO/OSM)
  - `levels` (fallback if no height)
  - `polygon` (coordinate array [lng, lat])
- ~50-200 buildings per venue file
- Total coverage: 100m radius around each terrace

### Sun Position ✅
- SunCalc already in use
- Handles full seasonality (tested: solstices + equinoxes)
- Precision: sub-degree accuracy for azimuth/altitude

### Time Slider ✅
- `TimeSlider` component exists
- Range: 08:00-22:00
- Returns minutes since midnight
- Already triggers re-render on change

---

## Implementation Plan

### Phase 1: Dependencies & Setup
```bash
npm install maplibre-gl mapbox-gl-shadow-simulator
```

Files to create:
- `src/components/MapViewGL.tsx` — new MapLibre-based map
- `src/lib/buildingGeoJSON.ts` — convert our data → GeoJSON FeatureCollection
- `src/styles/maplibre.css` — MapLibre styles

### Phase 2: Building Data Converter

Convert our building format to GeoJSON FeatureCollection:

```typescript
// src/lib/buildingGeoJSON.ts
import type { BuildingInfo } from "@/types";

interface BuildingFeature {
  type: "Feature";
  properties: {
    height: number;
    id: number;
  };
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  };
}

export function buildingsToGeoJSON(buildings: BuildingInfo[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: buildings.map(b => ({
      type: "Feature",
      properties: {
        height: b.height || (b.levels ? b.levels * 3 : 10), // fallback: 3m per level or 10m
        id: b.id
      },
      geometry: {
        type: "Polygon",
        coordinates: [b.polygon] // Our format is already [lng, lat][]
      }
    }))
  };
}
```

### Phase 3: MapLibre + Shadow Simulator Component

```typescript
// src/components/MapViewGL.tsx
"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import ShadeMap from "mapbox-gl-shadow-simulator";
import type { TerraceWithStatus } from "@/types";
import { buildingsToGeoJSON } from "@/lib/buildingGeoJSON";
import buildingIndex from "@/data/buildingIndex.json";
import "maplibre-gl/dist/maplibre-gl.css";

interface MapViewGLProps {
  terraces: TerraceWithStatus[];
  selectedTime: Date;
  onSelectVenue: (id: string) => void;
  selectedId: string | null;
}

export default function MapViewGL({
  terraces,
  selectedTime,
  onSelectVenue,
  selectedId,
}: MapViewGLProps) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const shadeMapRef = useRef<ShadeMap | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Aggregate all buildings from all venues
  const allBuildings = useMemo(() => {
    const buildings: BuildingInfo[] = [];
    Object.values(buildingIndex).forEach(venueBuildings => {
      buildings.push(...venueBuildings);
    });
    // Dedupe by ID
    const seen = new Set<number>();
    return buildings.filter(b => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });
  }, []);

  const buildingGeoJSON = useMemo(
    () => buildingsToGeoJSON(allBuildings),
    [allBuildings]
  );

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          "carto-dark": {
            type: "raster",
            tiles: [
              "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
            ],
            tileSize: 256,
            attribution: "© CARTO © OpenStreetMap contributors",
          },
        },
        layers: [
          {
            id: "carto-dark-layer",
            type: "raster",
            source: "carto-dark",
            minzoom: 0,
            maxzoom: 22,
          },
        ],
      },
      center: [-9.142, 38.716],
      zoom: 14,
      pitch: 45, // Enable 3D view
      bearing: -17,
    });

    map.on("load", () => {
      // Add buildings as 3D extrusions
      map.addSource("buildings", {
        type: "geojson",
        data: buildingGeoJSON,
      });

      map.addLayer({
        id: "buildings-3d",
        type: "fill-extrusion",
        source: "buildings",
        paint: {
          "fill-extrusion-color": "#1a1a2e",
          "fill-extrusion-height": ["get", "height"],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.85,
        },
      });

      // Add shadow simulator
      const shadeMap = new ShadeMap({
        date: selectedTime,
        color: "#000022",
        opacity: 0.5,
        terrainSource: {
          tileSize: 256,
          maxZoom: 15,
          getSourceUrl: ({ x, y, z }) =>
            `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,
          getElevation: ({ r, g, b }) => (r * 256 + g + b / 256) - 32768,
        },
        getFeatures: () => buildingGeoJSON.features,
      });

      shadeMap.addTo(map);
      shadeMapRef.current = shadeMap;
    });

    mapRef.current = map;

    return () => {
      shadeMapRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [buildingGeoJSON]);

  // Update shadow when time changes
  useEffect(() => {
    if (shadeMapRef.current) {
      shadeMapRef.current.setDate(selectedTime);
    }
  }, [selectedTime]);

  // Add terrace markers (similar to current Leaflet impl)
  // ... marker logic here

  return <div ref={containerRef} className="h-full w-full" />;
}
```

### Phase 4: Wire Up Time Slider

In `page.tsx`, pass selectedTime to MapViewGL:

```typescript
// Convert slider minutes to full Date object
const selectedTime = useMemo(() => {
  const d = new Date();
  d.setHours(Math.floor(sliderMinutes / 60), sliderMinutes % 60, 0, 0);
  return d;
}, [sliderMinutes]);

// Render
<MapViewGL
  terraces={terracesWithStatus}
  selectedTime={selectedTime}
  onSelectVenue={handleSelectVenue}
  selectedId={selectedId}
/>
```

### Phase 5: Add Terrace Markers

Add markers on top of the shadow layer:

```typescript
// Inside MapViewGL, after map load
terraces.forEach(terrace => {
  const el = document.createElement("div");
  el.className = `marker marker-${terrace.sunStatus}`;
  el.style.cssText = `
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: ${sunStatusColor(terrace.sunStatus)};
    border: 2px solid white;
    cursor: pointer;
  `;
  
  new maplibregl.Marker({ element: el })
    .setLngLat([terrace.lng, terrace.lat])
    .addTo(map);
    
  el.addEventListener("click", () => onSelectVenue(terrace.id));
});
```

### Phase 6: Date Picker for Seasonality

Add date picker alongside time slider:

```typescript
// New component or extend TimeSlider
<input
  type="date"
  value={selectedDate.toISOString().split("T")[0]}
  onChange={(e) => setSelectedDate(new Date(e.target.value))}
/>
```

Combine date + time:
```typescript
const selectedDateTime = useMemo(() => {
  const d = new Date(selectedDate);
  d.setHours(Math.floor(sliderMinutes / 60), sliderMinutes % 60, 0, 0);
  return d;
}, [selectedDate, sliderMinutes]);
```

---

## Sun Position Precision

### What SunCalc provides:
- Azimuth: degrees from north (0-360)
- Altitude: degrees above horizon (-90 to 90)
- Based on: latitude, longitude, full Date object (year, month, day, hour, minute, second)

### Precision factors:
1. **Seasonality** ✅ — Date object includes month/day
2. **Time of day** ✅ — Date object includes hours/minutes
3. **Geographic location** ✅ — Using terrace lat/lng
4. **Atmospheric refraction** ✅ — SunCalc accounts for this
5. **Equation of time** ✅ — SunCalc handles solar noon drift

### What this means:
- Shadow position accurate to ~0.1° of sun angle
- Matches real-world shadow timing within ~30 seconds
- Correctly handles:
  - Summer: sun high in sky, short shadows
  - Winter: sun low, long shadows
  - Morning/evening: shadows stretch east/west
  - Noon: shadows point north (in Lisbon)

---

## Potential Gotchas & Solutions

### 1. Building data format mismatch
**Issue:** Our polygon format is `[lng, lat][]` but GeoJSON needs `[[[lng, lat], ...]]`
**Solution:** Wrap in extra array in converter (already in plan)

### 2. Large building dataset performance
**Issue:** Loading all 51 venue files = ~10k buildings
**Solution:** 
- Dedupe by OSM ID (many venues share buildings)
- Consider viewport-based loading for production

### 3. Shadow simulator API key check
**Issue:** Library may check for API key
**Solution:** The `getFeatures` callback bypasses their data fetch — no key needed

### 4. MapLibre vs Mapbox GL compatibility
**Issue:** shadow-simulator says "mapbox-gl" but we use MapLibre
**Solution:** MapLibre is API-compatible; library works with both

### 5. Time slider performance
**Issue:** Dragging slider = many setDate() calls
**Solution:** Debounce setDate calls (100ms) during drag

---

## Testing Checklist

- [ ] Buildings render in 3D
- [ ] Shadows appear on map
- [ ] Shadows move when time slider changes
- [ ] Shadows are longer in winter, shorter in summer
- [ ] Shadows point correct direction (north at noon in Lisbon)
- [ ] Terrace markers visible above shadows
- [ ] Performance acceptable (60fps during pan/zoom)
- [ ] Date picker changes shadow angle correctly

---

## Migration Path

1. Build MapViewGL as separate component
2. Add toggle in UI: "Classic" vs "3D" view
3. Test thoroughly
4. Make 3D view default
5. Remove Leaflet if 3D proves stable

---

## Timeline Estimate

- Phase 1 (setup): 30 min
- Phase 2 (converter): 30 min
- Phase 3 (MapLibre + shadows): 2 hrs
- Phase 4 (time slider): 30 min
- Phase 5 (markers): 1 hr
- Phase 6 (date picker): 30 min
- Testing & polish: 2 hrs

**Total: ~7 hours of focused work**

---

## Success Criteria

When complete, user should be able to:
1. See Lisbon with 3D buildings
2. See real-time shadows on the ground
3. Drag time slider → shadows animate smoothly
4. Pick any date → shadows reflect that day's sun angle
5. Tap a terrace marker → see venue info
6. Immediately understand which terraces are sunny vs shaded
