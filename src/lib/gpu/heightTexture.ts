/**
 * Building height rasterization to WebGL texture.
 * 
 * Converts building GeoJSON polygons into a height texture where
 * each pixel's RG channels encode the building height in centimeters.
 */

import type { BuildingFeature } from '../buildingGeoJSON';
import { createProgram, createTexture, createFramebuffer } from './shaderUtils';
import earcut from 'earcut';

// Vertex shader for polygon rasterization
const RASTER_VERTEX_SHADER = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position * 2.0 - 1.0, 0.0, 1.0);
  }
`;

// Fragment shader - output height as RG (16-bit)
const RASTER_FRAGMENT_SHADER = `
  precision highp float;
  uniform vec2 u_height; // R = high byte, G = low byte
  void main() {
    gl_FragColor = vec4(u_height, 0.0, 1.0);
  }
`;

interface Bounds {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

/**
 * Encode height in meters to two bytes (RG channels).
 * Range: 0-655.35 meters with 1cm precision.
 */
function encodeHeight(heightMeters: number): [number, number] {
  const heightCm = Math.max(0, Math.min(65535, Math.round(heightMeters * 100)));
  const r = Math.floor(heightCm / 256) / 255;
  const g = (heightCm % 256) / 255;
  return [r, g];
}

/**
 * Convert lng/lat to texture coordinates (0-1).
 */
function lngLatToTexCoord(
  lng: number,
  lat: number,
  bounds: Bounds
): [number, number] {
  const x = (lng - bounds.minLng) / (bounds.maxLng - bounds.minLng);
  const y = (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat);
  return [x, y];
}

/**
 * Triangulate a polygon using earcut.
 */
function triangulatePolygon(coordinates: [number, number][][]): {
  vertices: Float32Array;
  indices: Uint16Array;
} {
  const flatCoords: number[] = [];
  const holes: number[] = [];

  // First ring is exterior, rest are holes
  for (let i = 0; i < coordinates.length; i++) {
    if (i > 0) {
      holes.push(flatCoords.length / 2);
    }
    for (const coord of coordinates[i]) {
      flatCoords.push(coord[0], coord[1]);
    }
  }

  const indices = earcut(flatCoords, holes.length > 0 ? holes : undefined, 2);
  
  return {
    vertices: new Float32Array(flatCoords),
    indices: new Uint16Array(indices),
  };
}

/**
 * Create a height texture from building features.
 */
export function createHeightTexture(
  gl: WebGLRenderingContext,
  buildings: BuildingFeature[],
  bounds: Bounds,
  textureSize: number = 1024
): WebGLTexture {
  // Create output texture
  const heightTexture = createTexture(gl, textureSize, textureSize, null);
  const framebuffer = createFramebuffer(gl, heightTexture);

  // Create shader program
  const program = createProgram(gl, RASTER_VERTEX_SHADER, RASTER_FRAGMENT_SHADER);
  const positionLoc = gl.getAttribLocation(program, 'a_position');
  const heightLoc = gl.getUniformLocation(program, 'u_height');

  // Create buffers
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();

  // Set up rendering state
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.viewport(0, 0, textureSize, textureSize);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(program);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.BLEND);

  // Render each building
  for (const building of buildings) {
    const coords = building.geometry.coordinates;
    if (!coords || coords.length === 0) continue;

    const height = building.properties.height || 10;
    const [r, g] = encodeHeight(height);

    // Transform coordinates to texture space
    const transformedCoords = coords.map(ring =>
      ring.map(([lng, lat]) => lngLatToTexCoord(lng, lat, bounds))
    );

    try {
      const { vertices, indices } = triangulatePolygon(transformedCoords);
      if (indices.length === 0) continue;

      // Upload vertex data
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(positionLoc);
      gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

      // Upload index data
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.DYNAMIC_DRAW);

      // Set height uniform
      gl.uniform2f(heightLoc, r, g);

      // Draw
      gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    } catch (e) {
      // Skip invalid polygons
      console.warn('Failed to triangulate building:', e);
    }
  }

  // Clean up
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(framebuffer);
  gl.deleteBuffer(vertexBuffer);
  gl.deleteBuffer(indexBuffer);
  gl.deleteProgram(program);

  return heightTexture;
}

/**
 * Filter buildings to those within bounds.
 */
export function filterBuildingsByBounds(
  buildings: BuildingFeature[],
  bounds: Bounds,
  padding: number = 0.002 // ~200m padding
): BuildingFeature[] {
  const expandedBounds = {
    minLng: bounds.minLng - padding,
    maxLng: bounds.maxLng + padding,
    minLat: bounds.minLat - padding,
    maxLat: bounds.maxLat + padding,
  };

  return buildings.filter((b) => {
    const coords = b.geometry.coordinates[0];
    if (!coords) return false;
    
    // Check if any vertex is within bounds
    for (const [lng, lat] of coords) {
      if (
        lng >= expandedBounds.minLng &&
        lng <= expandedBounds.maxLng &&
        lat >= expandedBounds.minLat &&
        lat <= expandedBounds.maxLat
      ) {
        return true;
      }
    }
    return false;
  });
}
