"use client";

import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import type { Map as LeafletMap, CircleMarker } from "leaflet";
import type { TerraceWithStatus } from "@/types";
import { sunStatusColor } from "@/lib/utils";

interface MapViewProps {
  terraces: TerraceWithStatus[];
  onSelectVenue: (id: string) => void;
  selectedId: string | null;
  favorites: Set<string>;
}

export default function MapView({
  terraces,
  onSelectVenue,
  selectedId,
  favorites,
}: MapViewProps) {
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Map<string, CircleMarker>>(new Map());
  const heartMarkersRef = useRef<Map<string, L.Marker>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [38.716, -9.142],
      zoom: 14,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer(
      "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        maxZoom: 19,
      }
    ).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const updateMarkers = useCallback(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();
    heartMarkersRef.current.forEach((marker) => marker.remove());
    heartMarkersRef.current.clear();

    terraces.forEach((terrace) => {
      const color = sunStatusColor(terrace.sunStatus);
      const isSelected = terrace.id === selectedId;

      const marker = L.circleMarker([terrace.lat, terrace.lng], {
        radius: isSelected ? 14 : 11,
        fillColor: color,
        color: "#ffffff",
        weight: isSelected ? 3 : 2,
        opacity: isSelected ? 1 : 0.8,
        fillOpacity: 0.95,
      }).addTo(map);

      if (isSelected) {
        marker.bringToFront();
      }

      marker.bindTooltip(terrace.name, {
        direction: "top",
        offset: [0, -12],
        className: "leaflet-tooltip",
      });

      marker.on("click", () => {
        onSelectVenue(terrace.id);
      });

      markersRef.current.set(terrace.id, marker);

      if (favorites.has(terrace.id)) {
        const heartIcon = L.divIcon({
          html: '<span style="font-size:10px;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.5))">❤️</span>',
          className: "",
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const heartMarker = L.marker([terrace.lat, terrace.lng], {
          icon: heartIcon,
          interactive: false,
          zIndexOffset: 1000,
        }).addTo(map);
        heartMarkersRef.current.set(terrace.id, heartMarker);
      }
    });
  }, [terraces, selectedId, onSelectVenue, favorites]);

  useEffect(() => {
    updateMarkers();
  }, [updateMarkers]);

  return (
    <div
      ref={containerRef}
      data-testid="map-container"
      className="h-full w-full"
      style={{ minHeight: "100%", position: "absolute", inset: 0 }}
    />
  );
}
