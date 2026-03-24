"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { TerraceWithStatus } from "@/types";
import { sunStatusColor } from "@/lib/utils";
import { getTerracePoint } from "@/lib/terraceCoords";
import { darkMapStyle, lightMapStyle } from "@/lib/mapStyle";
import { getBuildingFeatures, type BuildingFeature } from "@/lib/buildingGeoJSON";
import { createShadowCanvas, type ShadowCanvas } from "@/lib/shadowCanvas";

const SHADOW_CANVAS_SOURCE = "shadow-canvas-source";
const SHADOW_CANVAS_LAYER = "shadow-canvas-layer";

export interface CustomPin {
  lng: number;
  lat: number;
  name?: string;
}

interface ShadowMapGLProps {
  terraces: TerraceWithStatus[];
  selectedTime: Date;
  onSelectVenue: (id: string) => void;
  selectedId: string | null;
  favorites: Set<string>;
  theme?: "dark" | "light" | "system";
  onPinLocation?: (pin: CustomPin) => void;
  customPins?: CustomPin[];
}

export default function ShadowMapGL({
  terraces,
  selectedTime,
  onSelectVenue,
  selectedId,
  favorites,
  theme = "system",
  onPinLocation,
  customPins = [],
}: ShadowMapGLProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const customPinMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const shadowRef = useRef<ShadowCanvas | null>(null);
  const rafRef = useRef<number>(0);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [tempPin, setTempPin] = useState<CustomPin | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // ── User location ─────────────────────────────────────────────────────────
  const goToUserLocation = useCallback(() => {
    if (!mapRef.current) return;
    
    if (!navigator.geolocation) {
      setLocationError("Geolocation not supported");
      return;
    }

    setLocationLoading(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { longitude, latitude } = position.coords;
        setUserLocation({ lng: longitude, lat: latitude });
        setLocationLoading(false);
        
        if (mapRef.current) {
          mapRef.current.flyTo({
            center: [longitude, latitude],
            zoom: 16,
            duration: 1000,
          });
        }
      },
      (error) => {
        setLocationLoading(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError("Location access denied");
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError("Location unavailable");
            break;
          case error.TIMEOUT:
            setLocationError("Location request timed out");
            break;
          default:
            setLocationError("Unable to get location");
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, []);

  // ── User location marker ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !userLocation) return;

    // Remove existing user marker
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
    }

    // Create pulsing user location marker
    const el = document.createElement("div");
    el.className = "user-location-marker";
    el.innerHTML = `
      <div class="user-marker-pulse"></div>
      <div class="user-marker-dot"></div>
    `;

    userMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([userLocation.lng, userLocation.lat])
      .addTo(mapRef.current);

    return () => {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
    };
  }, [userLocation, mapLoaded]);

  // ── Temp pin marker (when user clicks on map) ─────────────────────────────
  const tempPinMarkerRef = useRef<maplibregl.Marker | null>(null);
  
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    // Remove existing temp pin marker
    if (tempPinMarkerRef.current) {
      tempPinMarkerRef.current.remove();
      tempPinMarkerRef.current = null;
    }

    if (!tempPin) return;

    // Create pin marker with sun status indicator
    const el = document.createElement("div");
    el.className = "custom-pin-marker";
    el.innerHTML = `
      <div class="custom-pin-icon">📍</div>
      <div class="custom-pin-label">Tap for sun info</div>
    `;

    const popup = new maplibregl.Popup({
      closeButton: true,
      closeOnClick: false,
      offset: [0, -20],
      className: "custom-pin-popup",
    }).setHTML(`
      <div style="padding: 8px; min-width: 150px;">
        <div style="font-weight: 600; margin-bottom: 4px;">📍 Custom Pin</div>
        <div style="font-size: 12px; color: #888;">
          ${tempPin.lat.toFixed(5)}°, ${tempPin.lng.toFixed(5)}°
        </div>
        <div style="margin-top: 8px; font-size: 12px;">
          Tap a venue marker to see sun details, or save this location to your favorites.
        </div>
      </div>
    `);

    tempPinMarkerRef.current = new maplibregl.Marker({ 
      element: el, 
      anchor: "bottom",
    })
      .setLngLat([tempPin.lng, tempPin.lat])
      .setPopup(popup)
      .addTo(mapRef.current);

    // Auto-open popup
    tempPinMarkerRef.current.togglePopup();

    return () => {
      if (tempPinMarkerRef.current) {
        tempPinMarkerRef.current.remove();
        tempPinMarkerRef.current = null;
      }
    };
  }, [tempPin, mapLoaded]);

  const isDark = useMemo(() => {
    if (theme === "dark") return true;
    if (theme === "light") return false;
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true;
  }, [theme]);

  // ── Map init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: isDark ? darkMapStyle : lightMapStyle,
      center: [-9.142, 38.716],
      zoom: 14,
      minZoom: 12,
      maxZoom: 18,
    });

    map.on("load", () => {
      const buildings = getBuildingFeatures() as BuildingFeature[];
      const bounds = map.getBounds();
      const mapBounds = {
        minLng: bounds.getWest(),
        maxLng: bounds.getEast(),
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
      };

      // ── Shadow canvas (ShadeMap pattern) ────────────────────────────────
      // Render to a SEPARATE hidden canvas, then register as a MapLibre canvas
      // source. This avoids touching the map's own WebGL context.
      const shadow = createShadowCanvas({
        buildings,
        date: selectedTime,
        bounds: mapBounds,
        zoom: map.getZoom(),
        // Dark mode: use a lighter purple/blue tint so shadows are visible against dark background
        // Light mode: use darker shadows for contrast
        shadowColor: isDark ? [0.1, 0.05, 0.25, 0.5] : [0, 0, 0.15, 0.7],
        textureSize: 1024,
      });

      if (shadow) {
        document.body.appendChild(shadow.canvas);
        shadowRef.current = shadow;

        const ne = bounds.getNorthEast();
        const nw = bounds.getNorthWest();
        const se = bounds.getSouthEast();
        const sw = bounds.getSouthWest();

        map.addSource(SHADOW_CANVAS_SOURCE, {
          type: "canvas",
          canvas: shadow.canvas,
          // [nw, ne, se, sw] — maplibre canvas source coordinates
          coordinates: [
            [nw.lng, nw.lat],
            [ne.lng, ne.lat],
            [se.lng, se.lat],
            [sw.lng, sw.lat],
          ],
          animate: true,
        });

        map.addLayer({
          id: SHADOW_CANVAS_LAYER,
          type: "raster",
          source: SHADOW_CANVAS_SOURCE,
          paint: { "raster-fade-duration": 0, "raster-opacity": 1 },
        });

        console.log("[ShadowMapGL] Shadow canvas source added");
      }

      // ── Building outlines (above shadows) ───────────────────────────────
      map.addSource("buildings", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: buildings,
        } as GeoJSON.FeatureCollection,
      });

      map.addLayer({
        id: "building-fills",
        type: "fill",
        source: "buildings",
        paint: {
          "fill-color": isDark ? "#2a2a2a" : "#e0e0e0",
          "fill-opacity": 0.7,
        },
      });

      map.addLayer({
        id: "building-outlines",
        type: "line",
        source: "buildings",
        paint: {
          "line-color": isDark ? "#3a3a3a" : "#cccccc",
          "line-width": 0.5,
        },
      });

      setMapLoaded(true);
    });

    // ── Map click handler for custom pins ─────────────────────────────────
    map.on("click", (e) => {
      // Check if click was on a marker (don't create pin on marker click)
      const features = map.queryRenderedFeatures(e.point, {
        layers: ["building-fills"],
      });
      
      // Create temp pin at click location
      const pin: CustomPin = {
        lng: e.lngLat.lng,
        lat: e.lngLat.lat,
      };
      setTempPin(pin);
      
      // Notify parent if callback provided
      if (onPinLocation) {
        onPinLocation(pin);
      }
    });

    mapRef.current = map;

    return () => {
      cancelAnimationFrame(rafRef.current);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      customPinMarkersRef.current.forEach((m) => m.remove());
      customPinMarkersRef.current.clear();
      if (shadowRef.current) {
        document.body.removeChild(shadowRef.current.canvas);
        shadowRef.current.destroy();
        shadowRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update shadow when time changes ──────────────────────────────────────
  useEffect(() => {
    if (!shadowRef.current || !mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    const doUpdate = () => {
      if (!shadowRef.current || !mapRef.current) return;
      const bounds = map.getBounds();
      const mapBounds = {
        minLng: bounds.getWest(),
        maxLng: bounds.getEast(),
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
      };
      shadowRef.current.update(selectedTime, mapBounds, map.getZoom());

      // Reposition canvas source to current viewport
      const src = map.getSource(SHADOW_CANVAS_SOURCE) as maplibregl.CanvasSource | undefined;
      if (src) {
        const ne = bounds.getNorthEast();
        const nw = bounds.getNorthWest();
        const se = bounds.getSouthEast();
        const sw = bounds.getSouthWest();
        src.setCoordinates([
          [nw.lng, nw.lat],
          [ne.lng, ne.lat],
          [se.lng, se.lat],
          [sw.lng, sw.lat],
        ]);
      }
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(doUpdate);
  }, [selectedTime, mapLoaded]);

  // Also update on map move
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    /** Reposition the shadow canvas source to match the current viewport bounds. */
    const syncCoordinates = () => {
      const src = map.getSource(SHADOW_CANVAS_SOURCE) as maplibregl.CanvasSource | undefined;
      if (!src) return;
      const bounds = map.getBounds();
      const ne = bounds.getNorthEast();
      const nw = bounds.getNorthWest();
      const se = bounds.getSouthEast();
      const sw = bounds.getSouthWest();
      src.setCoordinates([
        [nw.lng, nw.lat],
        [ne.lng, ne.lat],
        [se.lng, se.lat],
        [sw.lng, sw.lat],
      ]);
    };

    /** Full re-render once movement stops, then reposition. */
    const onMoveEnd = () => {
      if (!shadowRef.current) return;
      const bounds = map.getBounds();
      const mapBounds = {
        minLng: bounds.getWest(),
        maxLng: bounds.getEast(),
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
      };
      shadowRef.current.update(selectedTime, mapBounds, map.getZoom());
      syncCoordinates();
    };

    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
    };
  }, [selectedTime]);

  // ── Markers ───────────────────────────────────────────────────────────────
  const updateMarkers = useCallback(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    const prevMarkers = markersRef.current;
    prevMarkers.forEach((m) => m.remove());
    prevMarkers.clear();

    terraces.forEach((terrace) => {
      const point = getTerracePoint(terrace);
      const color = sunStatusColor(terrace.sunStatus);
      const isSelected = terrace.id === selectedId;
      const isFavorite = favorites.has(terrace.id);

      const el = document.createElement("div");
      el.className = "terrace-marker";
      el.innerHTML = `
        <div style="
          width: ${isSelected ? 18 : 14}px;
          height: ${isSelected ? 18 : 14}px;
          background: ${color};
          border: 2px solid white;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0,0,0,0.4);
          transition: transform 0.15s ease;
          position: relative;
        ">
          ${isFavorite ? '<span style="position:absolute;top:-8px;right:-8px;font-size:10px;">❤️</span>' : ""}
        </div>
      `;

      el.addEventListener("mouseenter", () => {
        (el.querySelector("div") as HTMLElement).style.transform = "scale(1.2)";
      });
      el.addEventListener("mouseleave", () => {
        (el.querySelector("div") as HTMLElement).style.transform = "scale(1)";
      });
      el.addEventListener("click", () => onSelectVenue(terrace.id));

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([point.lng, point.lat])
        .addTo(map);

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: [0, -12],
        className: "terrace-tooltip",
      }).setHTML(`<span style="font-size:12px;font-weight:500;">${terrace.name}</span>`);

      el.addEventListener("mouseenter", () => popup.setLngLat([point.lng, point.lat]).addTo(map));
      el.addEventListener("mouseleave", () => popup.remove());

      markersRef.current.set(terrace.id, marker);
    });
  }, [terraces, selectedId, favorites, onSelectVenue, mapLoaded]);

  useEffect(() => { updateMarkers(); }, [updateMarkers]);

  // Pan to selected
  useEffect(() => {
    if (selectedId && mapRef.current) {
      const t = terraces.find((x) => x.id === selectedId);
      if (t) {
        const pt = getTerracePoint(t);
        mapRef.current.easeTo({ center: [pt.lng, pt.lat], duration: 500 });
      }
    }
  }, [selectedId, terraces]);

  return (
    <div ref={containerRef} className="h-full w-full relative">
      {/* Location button + error toast wrapper */}
      <div className="absolute right-4 top-4 z-[400] flex flex-col items-end gap-2">
        <button
          onClick={goToUserLocation}
          disabled={locationLoading}
          className={`flex h-11 w-11 items-center justify-center rounded-xl
            ${isDark ? "bg-neutral-800/90 hover:bg-neutral-700/90" : "bg-white/90 hover:bg-neutral-100/90"}
            shadow-lg backdrop-blur-sm transition-all duration-200
            ${locationLoading ? "opacity-70 cursor-wait" : "cursor-pointer"}
            ${locationError ? "ring-2 ring-red-500" : ""}
          `}
          title={locationError || "Go to my location"}
          aria-label="Go to my location"
        >
          {locationLoading ? (
            <svg className="h-5 w-5 animate-spin text-amber-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg
              className={`h-5 w-5 ${userLocation ? "text-amber-500" : isDark ? "text-neutral-300" : "text-neutral-600"}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v2m0 16v2m-8-10H2m20 0h-2m-2.93-5.07l-1.41 1.41m-9.32 9.32l-1.41 1.41m0-12.14l1.41 1.41m9.32 9.32l1.41 1.41" />
            </svg>
          )}
        </button>

        {/* Error toast — below the location button */}
        {locationError && (
          <div className="rounded-lg bg-red-500/90 px-3 py-2 text-xs text-white shadow-lg backdrop-blur-sm animate-fade-in">
            {locationError}
          </div>
        )}
      </div>

      <style jsx global>{`
        .terrace-tooltip .maplibregl-popup-content {
          background: ${isDark ? "rgba(15,15,15,0.9)" : "rgba(255,255,255,0.95)"};
          color: ${isDark ? "white" : "black"};
          padding: 4px 8px;
          border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .terrace-tooltip .maplibregl-popup-tip {
          border-top-color: ${isDark ? "rgba(15,15,15,0.9)" : "rgba(255,255,255,0.95)"};
        }
        .user-location-marker {
          position: relative;
          width: 24px;
          height: 24px;
        }
        .user-marker-dot {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 14px;
          height: 14px;
          background: #3b82f6;
          border: 3px solid white;
          border-radius: 50%;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.5);
        }
        .user-marker-pulse {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 40px;
          height: 40px;
          background: rgba(59, 130, 246, 0.3);
          border-radius: 50%;
          animation: pulse 2s ease-out infinite;
        }
        @keyframes pulse {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
        .custom-pin-marker {
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
        }
        .custom-pin-icon {
          font-size: 28px;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
          animation: bounce-in 0.3s ease-out;
        }
        .custom-pin-label {
          background: ${isDark ? "rgba(15,15,15,0.9)" : "rgba(255,255,255,0.95)"};
          color: ${isDark ? "white" : "black"};
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 4px;
          white-space: nowrap;
          margin-top: 2px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.2);
        }
        .custom-pin-popup .maplibregl-popup-content {
          background: ${isDark ? "rgba(20,20,20,0.95)" : "rgba(255,255,255,0.98)"};
          color: ${isDark ? "white" : "black"};
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          padding: 0;
        }
        .custom-pin-popup .maplibregl-popup-close-button {
          color: ${isDark ? "#888" : "#666"};
          font-size: 18px;
          padding: 4px 8px;
        }
        .custom-pin-popup .maplibregl-popup-tip {
          border-top-color: ${isDark ? "rgba(20,20,20,0.95)" : "rgba(255,255,255,0.98)"};
        }
        @keyframes bounce-in {
          0% { transform: scale(0) translateY(-20px); }
          60% { transform: scale(1.2) translateY(0); }
          100% { transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
