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

interface ShadowMapGLProps {
  terraces: TerraceWithStatus[];
  selectedTime: Date;
  onSelectVenue: (id: string) => void;
  selectedId: string | null;
  favorites: Set<string>;
  theme?: "dark" | "light" | "system";
}

export default function ShadowMapGL({
  terraces,
  selectedTime,
  onSelectVenue,
  selectedId,
  favorites,
  theme = "system",
}: ShadowMapGLProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const shadowRef = useRef<ShadowCanvas | null>(null);
  const rafRef = useRef<number>(0);
  const [mapLoaded, setMapLoaded] = useState(false);

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
        shadowColor: isDark ? [0, 0, 0.05, 0.6] : [0, 0, 0.05, 0.45],
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

    mapRef.current = map;

    return () => {
      cancelAnimationFrame(rafRef.current);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
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

    map.on("moveend", onMoveEnd);
    return () => { map.off("moveend", onMoveEnd); };
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
    <div ref={containerRef} className="h-full w-full">
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
      `}</style>
    </div>
  );
}
