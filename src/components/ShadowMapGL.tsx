"use client";

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { TerraceWithStatus } from "@/types";
import { sunStatusColor } from "@/lib/utils";
import { getTerracePoint } from "@/lib/terraceCoords";
import {
  darkMapStyle,
  lightMapStyle,
  darkBuildingStyle,
  lightBuildingStyle,
} from "@/lib/mapStyle";
import { getAllBuildings, getBuildingFeatures, type BuildingFeature } from "@/lib/buildingGeoJSON";
import { createShadowLayer, type ShadowLayerOptions } from "@/lib/gpu";

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
  const shadowLayerRef = useRef<ReturnType<typeof createShadowLayer> | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

  // Determine theme
  const isDark = useMemo(() => {
    if (theme === "dark") return true;
    if (theme === "light") return false;
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    }
    return true;
  }, [theme]);

  const mapStyle = isDark ? darkMapStyle : lightMapStyle;
  const buildingStyle = isDark ? darkBuildingStyle : lightBuildingStyle;

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle,
      center: [-9.142, 38.716],
      zoom: 14,
      minZoom: 12,
      maxZoom: 18,
    });

    map.on("load", () => {
      // Add building source
      const buildingsGeoJSON = getAllBuildings();
      map.addSource("buildings", {
        type: "geojson",
        data: buildingsGeoJSON,
      });

      // Add GPU shadow layer FIRST (below buildings)
      try {
        const buildings = getBuildingFeatures() as BuildingFeature[];
        const shadowLayer = createShadowLayer({
          buildings,
          date: selectedTime,
          shadowColor: isDark ? [0, 0, 0.15, 0.5] : [0, 0, 0.1, 0.4],
          textureSize: 1024,
        });
        map.addLayer(shadowLayer);
        shadowLayerRef.current = shadowLayer;
        console.log("[ShadowMapGL] GPU shadow layer added");
      } catch (e) {
        console.error("[ShadowMapGL] Failed to create shadow layer:", e);
      }

      // Building fill layer (on top of shadows)
      map.addLayer({
        id: "building-fills",
        type: "fill",
        source: "buildings",
        paint: {
          "fill-color": buildingStyle.fill,
          "fill-opacity": buildingStyle.fillOpacity,
        },
      });

      // Building outline layer
      map.addLayer({
        id: "building-outlines",
        type: "line",
        source: "buildings",
        paint: {
          "line-color": buildingStyle.outline,
          "line-width": buildingStyle.outlineWidth,
        },
      });

      setMapLoaded(true);
    });

    // Trigger shadow update on map move
    map.on("moveend", () => {
      map.triggerRepaint();
    });

    mapRef.current = map;

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      shadowLayerRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update shadow layer when time changes
  useEffect(() => {
    if (shadowLayerRef.current) {
      shadowLayerRef.current.updateDate(selectedTime);
    }
  }, [selectedTime]);

  // Update markers
  const updateMarkers = useCallback(() => {
    if (!mapRef.current || !mapLoaded) return;
    const map = mapRef.current;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current.clear();

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
        const div = el.querySelector("div");
        if (div) div.style.transform = "scale(1.2)";
      });
      el.addEventListener("mouseleave", () => {
        const div = el.querySelector("div");
        if (div) div.style.transform = "scale(1)";
      });
      el.addEventListener("click", () => {
        onSelectVenue(terrace.id);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([point.lng, point.lat])
        .addTo(map);

      const popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        offset: [0, -12],
        className: "terrace-tooltip",
      }).setHTML(`<span style="font-size:12px;font-weight:500;">${terrace.name}</span>`);

      el.addEventListener("mouseenter", () => {
        popup.setLngLat([point.lng, point.lat]).addTo(map);
      });
      el.addEventListener("mouseleave", () => {
        popup.remove();
      });

      markersRef.current.set(terrace.id, marker);
    });
  }, [terraces, selectedId, favorites, onSelectVenue, mapLoaded]);

  useEffect(() => {
    updateMarkers();
  }, [updateMarkers]);

  // Pan to selected terrace
  useEffect(() => {
    if (selectedId && mapRef.current) {
      const terrace = terraces.find((t) => t.id === selectedId);
      if (terrace) {
        const point = getTerracePoint(terrace);
        mapRef.current.easeTo({
          center: [point.lng, point.lat],
          duration: 500,
        });
      }
    }
  }, [selectedId, terraces]);

  return (
    <div ref={containerRef} className="h-full w-full">
      <style jsx global>{`
        .terrace-tooltip .maplibregl-popup-content {
          background: ${isDark ? "rgba(15, 15, 15, 0.9)" : "rgba(255, 255, 255, 0.95)"};
          color: ${isDark ? "white" : "black"};
          padding: 4px 8px;
          border-radius: 4px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
        .terrace-tooltip .maplibregl-popup-tip {
          border-top-color: ${isDark ? "rgba(15, 15, 15, 0.9)" : "rgba(255, 255, 255, 0.95)"};
        }
      `}</style>
    </div>
  );
}
