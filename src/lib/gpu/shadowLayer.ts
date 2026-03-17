/**
 * MapLibre Custom Layer for GPU-based shadow rendering.
 * 
 * Implements the CustomLayerInterface to render shadows using WebGL shaders.
 */

import type { CustomLayerInterface, Map as MaplibreMap } from 'maplibre-gl';
import SunCalc from 'suncalc';
import type { BuildingFeature } from '../buildingGeoJSON';
import { createProgram, createQuadBuffer } from './shaderUtils';
import { createHeightTexture, filterBuildingsByBounds } from './heightTexture';
import {
  SHADOW_VERTEX_SHADER,
  SHADOW_FRAGMENT_SHADER,
  getShaderUniforms,
  type ShadowShaderUniforms,
} from './shadowShader';

export interface ShadowLayerOptions {
  /** All building features (will be filtered by viewport) */
  buildings: BuildingFeature[];
  /** Current date/time for sun position */
  date: Date;
  /** Shadow color [r, g, b, a] in 0-1 range */
  shadowColor?: [number, number, number, number];
  /** Height texture resolution */
  textureSize?: number;
  /** Center latitude for sun calculation */
  centerLat?: number;
  /** Center longitude for sun calculation */
  centerLng?: number;
}

/**
 * Create a MapLibre custom layer for shadow rendering.
 */
export function createShadowLayer(
  options: ShadowLayerOptions
): CustomLayerInterface & { updateDate: (date: Date) => void } {
  const {
    buildings,
    shadowColor = [0, 0, 0.15, 0.5],
    textureSize = 1024,
    centerLat = 38.716,
    centerLng = -9.142,
  } = options;

  let currentDate = options.date;
  let gl: WebGLRenderingContext | null = null;
  let map: MaplibreMap | null = null;
  let program: WebGLProgram | null = null;
  let uniforms: ShadowShaderUniforms | null = null;
  let quadBuffer: WebGLBuffer | null = null;
  let heightTexture: WebGLTexture | null = null;
  let positionLoc: number = -1;
  let needsHeightUpdate = true;
  let lastBounds: string | null = null;

  const layer: CustomLayerInterface & { updateDate: (date: Date) => void } = {
    id: 'shadow-layer',
    type: 'custom',
    renderingMode: '2d',

    onAdd(mapInstance, glContext) {
      map = mapInstance;
      gl = glContext;

      // Compile shaders and create program
      program = createProgram(gl, SHADOW_VERTEX_SHADER, SHADOW_FRAGMENT_SHADER);
      uniforms = getShaderUniforms(gl, program);
      positionLoc = gl.getAttribLocation(program, 'a_position');

      // Create quad buffer for full-screen rendering
      quadBuffer = createQuadBuffer(gl);

      console.log('[ShadowLayer] Initialized');
    },

    onRemove() {
      if (gl) {
        if (program) gl.deleteProgram(program);
        if (quadBuffer) gl.deleteBuffer(quadBuffer);
        if (heightTexture) gl.deleteTexture(heightTexture);
      }
      gl = null;
      map = null;
      program = null;
      uniforms = null;
      quadBuffer = null;
      heightTexture = null;
    },

    render(glContext, matrix) {
      if (!map || !program || !uniforms || !quadBuffer) return;
      gl = glContext;

      // Get current map bounds
      const bounds = map.getBounds();
      const boundsKey = `${bounds.getWest().toFixed(4)},${bounds.getSouth().toFixed(4)},${bounds.getEast().toFixed(4)},${bounds.getNorth().toFixed(4)}`;

      // Update height texture if bounds changed significantly
      if (needsHeightUpdate || boundsKey !== lastBounds) {
        lastBounds = boundsKey;
        
        const mapBounds = {
          minLng: bounds.getWest(),
          maxLng: bounds.getEast(),
          minLat: bounds.getSouth(),
          maxLat: bounds.getNorth(),
        };

        // Filter buildings to viewport
        const visibleBuildings = filterBuildingsByBounds(buildings, mapBounds);
        console.log(`[ShadowLayer] Rasterizing ${visibleBuildings.length} buildings`);

        // Create new height texture
        if (heightTexture) {
          gl.deleteTexture(heightTexture);
        }
        heightTexture = createHeightTexture(gl, visibleBuildings, mapBounds, textureSize);
        needsHeightUpdate = false;
      }

      if (!heightTexture) return;

      // Calculate sun position
      const sunPos = SunCalc.getPosition(currentDate, centerLat, centerLng);

      // Calculate pixel scale (meters per texture pixel)
      const mapBounds = {
        minLng: bounds.getWest(),
        maxLng: bounds.getEast(),
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
      };
      const widthMeters = (mapBounds.maxLng - mapBounds.minLng) * 111320 * Math.cos((centerLat * Math.PI) / 180);
      const heightMeters = (mapBounds.maxLat - mapBounds.minLat) * 111320;
      const pixelScaleX = widthMeters / textureSize;
      const pixelScaleY = heightMeters / textureSize;

      // Find max building height
      const maxHeight = buildings.reduce((max, b) => Math.max(max, b.properties.height || 10), 0);

      // Set up WebGL state
      gl.useProgram(program);

      // Bind height texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, heightTexture);
      gl.uniform1i(uniforms.u_heightMap, 0);

      // Set uniforms
      gl.uniform2f(uniforms.u_resolution, textureSize, textureSize);
      gl.uniform1f(uniforms.u_sunAzimuth, sunPos.azimuth);
      gl.uniform1f(uniforms.u_sunAltitude, sunPos.altitude);
      gl.uniform1f(uniforms.u_maxHeight, maxHeight);
      gl.uniform4f(uniforms.u_shadowColor, ...shadowColor);
      gl.uniform2f(uniforms.u_pixelScale, pixelScaleX, pixelScaleY);

      // Set up vertex attribute
      gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

      // Enable blending for transparent shadows
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // Draw full-screen quad
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Clean up state
      gl.disable(gl.BLEND);
      gl.disableVertexAttribArray(positionLoc);
    },

    updateDate(date: Date) {
      currentDate = date;
      if (map) {
        map.triggerRepaint();
      }
    },
  };

  return layer;
}
