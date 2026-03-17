import type { StyleSpecification } from "maplibre-gl";

/**
 * Dark map style for the shadow visualization.
 * Uses CARTO dark basemap tiles.
 */
export const darkMapStyle: StyleSpecification = {
  version: 8,
  name: "Sol de Lisboa Dark",
  sources: {
    "carto-dark": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#0f0f0f",
      },
    },
    {
      id: "carto-tiles",
      type: "raster",
      source: "carto-dark",
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

/**
 * Light map style for day mode.
 * Uses CARTO Positron basemap tiles.
 */
export const lightMapStyle: StyleSpecification = {
  version: 8,
  name: "Sol de Lisboa Light",
  sources: {
    "carto-light": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: {
        "background-color": "#f5f5f5",
      },
    },
    {
      id: "carto-tiles",
      type: "raster",
      source: "carto-light",
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

/**
 * Building layer style for dark mode.
 */
export const darkBuildingStyle = {
  fill: "#2a2a2a",
  fillOpacity: 0.85,
  outline: "#3a3a3a",
  outlineWidth: 0.5,
};

/**
 * Building layer style for light mode.
 */
export const lightBuildingStyle = {
  fill: "#e0e0e0",
  fillOpacity: 0.85,
  outline: "#cccccc",
  outlineWidth: 0.5,
};

/**
 * Shadow colors by theme.
 */
export const shadowColors = {
  dark: { color: "#000033", opacity: 0.5 },
  light: { color: "#1a1a3a", opacity: 0.35 },
};
