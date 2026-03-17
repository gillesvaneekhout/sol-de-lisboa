/**
 * Shadow rendering via an off-screen canvas.
 *
 * Inspired by Ted Piotrowski's ShadeMap (shademap.app) architecture:
 *   - Render shadow texture to a SEPARATE hidden canvas (own WebGL context)
 *   - Register that canvas as a MapLibre "canvas" source
 *   - Add a "raster" layer over it — no interference with basemap tiles
 *
 * Height encoding matches ShadeMap:
 *   units = meters * 5  (up to ~13,000m range)
 *   R = floor(units / 255) / 255
 *   G = floor(units % 255) / 255
 *   Written to both RG and BA channels: vec4(r, g, r, g)
 *
 * Shadow shader: proper 3D ray marching in texture space, matching ShadeMap's
 * sun position algorithm (hour angle based) and curvature correction.
 */

import SunCalc from "suncalc";
import type { BuildingFeature } from "./buildingGeoJSON";

// ── GLSL programs ──────────────────────────────────────────────────────────────

/** Rasterise building polygons into the height texture. */
const RASTER_VERT = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position * 2.0 - 1.0, 0.0, 1.0);
  }
`;

const RASTER_FRAG = `
  precision highp float;
  uniform vec2 u_height; // r, g encoded height
  void main() {
    gl_FragColor = vec4(u_height.x, u_height.y, u_height.x, u_height.y);
  }
`;

/** Full-screen shadow raymarcher — adapted from ShadeMap's fragment shader. */
const SHADOW_VERT = `
  attribute vec2 a_pos;
  attribute vec2 a_tex_pos;
  varying vec2 vTexCoord;
  varying vec2 vTexCoordFull;
  void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
    vTexCoordFull = (gl_Position * 0.5 + 0.5).xy;
    vTexCoord = a_tex_pos;
  }
`;

/**
 * Shadow fragment shader — mirrors ShadeMap's approach:
 *  - Decodes height: (r * 255 * 256 + g * 255) / 5000  (km units internally)
 *  - Computes dx/dy in texture space, dz in km/pixel
 *  - Marches toward sun, exits when occluded
 *  - Applies earth curvature correction
 */
const SHADOW_FRAG = `
  #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
  #else
    precision mediump float;
  #endif

  uniform sampler2D u_heightMap;
  uniform float user_width;      // texture width  (pixels)
  uniform float user_height;     // texture height (pixels)
  uniform float user_maxHeight;  // max height in km
  uniform float user_zoom;       // map zoom level
  uniform float user_topYCoord;  // web mercator Y of top-left pixel / tile
  uniform float user_ySize;      // web mercator Y span of texture
  uniform float user_west;       // west longitude (degrees)
  uniform float user_dLng;       // longitude span (degrees)
  uniform float user_dec;        // sun declination (radians)
  uniform float user_Hi;         // sun hour angle base
  uniform vec4 u_shadowColor;    // rgba shadow color
  uniform float user_step;       // step size in pixels

  varying vec2 vTexCoord;
  varying vec2 vTexCoordFull;

  const int LOOP_MAX = 1000;
  const float PI = 3.141592653589793;
  const float TWO_PI = 6.283185307179586;
  const float EARTH_RADIUS_KM = 6378.137;
  const float SHADOW_BIAS = 0.0005;

  float getDSMElevation(vec2 uv) {
    vec4 c = texture2D(u_heightMap, uv);
    // height encoded as: (r * 255 * 256 + g * 255) / 5000  km
    return (c.r * 255.0 * 256.0 + c.g * 255.0) / 5000.0;
  }

  float intMod(float x, float y) {
    float res = floor(mod(x, y));
    return res * (res > floor(y) - 1.0 ? 0.0 : 1.0);
  }
  float divInt(float x, float y) {
    if (floor(x) == x && floor(y) == y && intMod(x, y) == 0.0)
      return float(int(x) / int(y));
    return x / y;
  }
  float intCorrMod(float n, float d) {
    if (n < 0.0) { n = abs(n); if (d < 0.0) d = abs(d); return -(n - (d * floor(divInt(n, d)))); }
    if (d < 0.0) d = abs(d);
    return n - (d * floor(divInt(n, d)));
  }

  void main() {
    float user_x = vTexCoord.x;
    float user_y = vTexCoord.y;

    float user_z = getDSMElevation(vec2(user_x, user_y));
    float user_lit = 1.0;

    float user_y_coord = user_topYCoord + (user_y * user_ySize);
    float user_lat_coord = (user_y_coord - 0.5) / -0.15915494309189532;
    float user_lat = (2.0 * atan(exp(user_lat_coord))) - (PI / 2.0);
    float user_rad = 0.017453292519943295;
    float user_lng = user_west + (user_dLng * user_x);
    float user_H = intCorrMod((user_Hi - (user_rad * -user_lng)), TWO_PI);

    float sun_azimuth = atan(sin(user_H),
      (cos(user_H) * sin(user_lat) - tan(user_dec) * cos(user_lat)));
    float sun_altitude = asin(
      sin(user_lat) * sin(user_dec) + cos(user_lat) * cos(user_dec) * cos(user_H));

    float user_zoom_factor = pow(2.0, user_zoom);
    float user_kmPerPixel = (156.5430339296875 / user_zoom_factor) * abs(cos(user_lat));

    float user_dx = (-sin(sun_azimuth) * cos(sun_altitude) * user_step) / user_width;
    float user_dy =  (cos(sun_azimuth) * cos(sun_altitude) * user_step) / user_height;
    float user_dz =   sin(sun_altitude) * user_kmPerPixel * user_step;

    float minAngle = asin(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + user_z)) - (PI / 2.0);

    if (user_z < 0.0 || sun_altitude < minAngle) {
      user_lit = 0.0;
    } else {
      float xIter = ceil(user_dx < 0.0 ? abs(user_x / user_dx) : (1.0 - user_x) / user_dx);
      float yIter = ceil(user_dy < 0.0 ? abs(user_y / user_dy) : (1.0 - user_y) / user_dy);
      float zIter = ceil(user_dz < 0.0 ? float(LOOP_MAX) : (user_maxHeight - user_z) / user_dz);
      int iter = int(min(xIter, min(yIter, zIter)));

      user_x += user_dx;
      user_y += user_dy;
      user_z += user_dz;

      float step_dist = sqrt(pow(user_dx * user_width, 2.0) + pow(user_dy * user_height, 2.0))
                        * user_kmPerPixel / EARTH_RADIUS_KM;

      for (int safeI = 0; safeI < LOOP_MAX; safeI++) {
        if (safeI > iter) break;
        float cur_height = getDSMElevation(vec2(user_x, user_y));
        if (cur_height - user_z > SHADOW_BIAS) {
          float curvature = EARTH_RADIUS_KM * (1.0 - cos(step_dist * float(safeI + 1)));
          if (user_z < cur_height - curvature) {
            user_lit = 0.0;
            iter = 0;
            break;
          }
        }
        user_x += user_dx;
        user_y += user_dy;
        user_z += user_dz;
      }
    }

    if (user_lit == 1.0) {
      gl_FragColor = vec4(0.0); // transparent = in sun
    } else {
      gl_FragColor = u_shadowColor;
    }
  }
`;

// ── Utilities ─────────────────────────────────────────────────────────────────

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error: ${gl.getShaderInfoLog(s)}`);
  }
  return s;
}

function createProgram(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(`Program link error: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

function encodeHeight(meters: number): [number, number] {
  // ShadeMap encoding: units = meters * 5, encoded into two 8-bit channels
  const units = Math.max(0, Math.min(65535, Math.round(meters * 5)));
  const r = Math.floor(units / 255) / 255;
  const g = Math.floor(units % 255) / 255;
  return [r, g];
}

// earcut polygon triangulation (tiny inline version)
function triangulateSimple(coords: [number, number][]): Float32Array {
  // Only convex polygons for speed — uses ear-clipping for simple cases
  const n = coords.length;
  const verts: number[] = [];
  // fan triangulation from first vertex (works for convex polygons)
  for (let i = 1; i < n - 2; i++) {
    verts.push(coords[0][0], coords[0][1]);
    verts.push(coords[i][0], coords[i][1]);
    verts.push(coords[i + 1][0], coords[i + 1][1]);
  }
  return new Float32Array(verts);
}

// ── Main shadow canvas ────────────────────────────────────────────────────────

export interface ShadowCanvasBounds {
  minLng: number;
  maxLng: number;
  minLat: number;
  maxLat: number;
}

export interface ShadowCanvasOptions {
  buildings: BuildingFeature[];
  date: Date;
  bounds: ShadowCanvasBounds;
  zoom: number;
  shadowColor?: [number, number, number, number];
  textureSize?: number;
}

export interface ShadowCanvas {
  canvas: HTMLCanvasElement;
  update: (date: Date, bounds: ShadowCanvasBounds, zoom: number) => void;
  destroy: () => void;
}

/**
 * Create a hidden canvas that renders building shadows using ShadeMap's approach.
 * The canvas is updated via `update()` and can be fed into MapLibre as a canvas source.
 */
export function createShadowCanvas(options: ShadowCanvasOptions): ShadowCanvas | null {
  const {
    buildings,
    shadowColor = [0, 0, 0.1, 0.55],
    textureSize = 1024,
  } = options;

  // Create hidden canvas with its OWN WebGL context (separate from MapLibre)
  const canvas = document.createElement("canvas");
  canvas.width = textureSize;
  canvas.height = textureSize;
  canvas.style.display = "none";

  const gl = canvas.getContext("webgl", {
    antialias: false,
    preserveDrawingBuffer: true,
  }) as WebGLRenderingContext | null;

  if (!gl) {
    console.error("[ShadowCanvas] WebGL not available");
    return null;
  }

  // Compile programs
  let rasterProg: WebGLProgram;
  let shadowProg: WebGLProgram;
  try {
    rasterProg = createProgram(gl, RASTER_VERT, RASTER_FRAG);
    shadowProg = createProgram(gl, SHADOW_VERT, SHADOW_FRAG);
  } catch (e) {
    console.error("[ShadowCanvas] Shader error:", e);
    return null;
  }

  // Raster program locations
  const rasterPosLoc = gl.getAttribLocation(rasterProg, "a_position");
  const rasterHeightLoc = gl.getUniformLocation(rasterProg, "u_height");

  // Shadow program locations
  const shadowPosLoc = gl.getAttribLocation(shadowProg, "a_pos");
  const shadowTexPosLoc = gl.getAttribLocation(shadowProg, "a_tex_pos");
  const uHeightMap = gl.getUniformLocation(shadowProg, "u_heightMap");
  const uWidth = gl.getUniformLocation(shadowProg, "user_width");
  const uHeight = gl.getUniformLocation(shadowProg, "user_height");
  const uMaxHeight = gl.getUniformLocation(shadowProg, "user_maxHeight");
  const uZoom = gl.getUniformLocation(shadowProg, "user_zoom");
  const uTopY = gl.getUniformLocation(shadowProg, "user_topYCoord");
  const uYSize = gl.getUniformLocation(shadowProg, "user_ySize");
  const uWest = gl.getUniformLocation(shadowProg, "user_west");
  const uDLng = gl.getUniformLocation(shadowProg, "user_dLng");
  const uDec = gl.getUniformLocation(shadowProg, "user_dec");
  const uHi = gl.getUniformLocation(shadowProg, "user_Hi");
  const uShadowColor = gl.getUniformLocation(shadowProg, "u_shadowColor");
  const uStep = gl.getUniformLocation(shadowProg, "user_step");

  // Buffers
  const vbuf = gl.createBuffer()!;
  const ibuf = gl.createBuffer()!;
  const quadBuf = gl.createBuffer()!;
  const texPosBuf = gl.createBuffer()!;

  // Full-screen quad positions [-1,-1 to 1,1]
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  // Height texture (buildings rasterized into it)
  const heightTex = gl.createTexture()!;

  /**
   * Rasterize buildings into the height texture for the given bounds.
   */
  function buildHeightTexture(bounds: ShadowCanvasBounds): void {
    if (!gl) return;
    const { minLng, maxLng, minLat, maxLat } = bounds;

    // Framebuffer for off-screen rasterization
    const fb = gl.createFramebuffer()!;
    gl.bindTexture(gl.TEXTURE_2D, heightTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, textureSize, textureSize, 0,
                  gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0,
                            gl.TEXTURE_2D, heightTex, 0);
    gl.viewport(0, 0, textureSize, textureSize);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(rasterProg);
    gl.disable(gl.BLEND);

    const lngSpan = maxLng - minLng;
    const latSpan = maxLat - minLat;

    // Filter buildings to this viewport (padded)
    const pad = 0.002;
    const visible = buildings.filter((b) => {
      const c = b.geometry.coordinates[0];
      for (const [lng, lat] of c) {
        if (lng >= minLng - pad && lng <= maxLng + pad &&
            lat >= minLat - pad && lat <= maxLat + pad) return true;
      }
      return false;
    });

    console.log(`[ShadowCanvas] Rasterising ${visible.length} buildings`);

    for (const building of visible) {
      const coords = building.geometry.coordinates[0] as [number, number][];
      if (!coords || coords.length < 3) continue;

      const height = building.properties.height || 5;
      const [r, g] = encodeHeight(height);

      // Transform lng/lat to [0,1] texture coords
      const texCoords: [number, number][] = coords.map(([lng, lat]) => [
        (lng - minLng) / lngSpan,
        (lat - minLat) / latSpan,
      ]);

      try {
        const tris = triangulateSimple(texCoords);
        if (tris.length === 0) continue;

        gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
        gl.bufferData(gl.ARRAY_BUFFER, tris, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(rasterPosLoc);
        gl.vertexAttribPointer(rasterPosLoc, 2, gl.FLOAT, false, 0, 0);
        gl.uniform2f(rasterHeightLoc, r, g);
        gl.drawArrays(gl.TRIANGLES, 0, tris.length / 2);
      } catch (e) {
        // skip bad polygons
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
  }

  /**
   * Render shadow overlay onto the canvas for the given date+bounds+zoom.
   * Uses ShadeMap's sun position algorithm (declination + hour angle).
   */
  function render(date: Date, bounds: ShadowCanvasBounds, zoom: number): void {
    buildHeightTexture(bounds);

    const { minLng, maxLng, minLat, maxLat } = bounds;
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;

    // ShadeMap sun position: declination (dec) + hour angle (Hi)
    // This matches the shader's formula exactly
    const timeMs = date.valueOf();
    const daysSinceJ2000 = timeMs / 86400000 - 10957.5;
    const M = 6.240059966692059 + 0.017201969994578018 * daysSinceJ2000;
    const lambda = M + 0.017453292519943295 * (
      1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)
    ) + 1.796593062783907 + Math.PI;
    const OBLIQUITY = 0.40909994067971484; // radians
    const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(lambda));
    // Hi = Greenwich Hour Angle of the sun
    const Hi = (4.889714432387314 + 6.3003876824396166 * daysSinceJ2000 -
               Math.atan2(Math.sin(lambda) * Math.cos(OBLIQUITY), Math.cos(lambda)))
               % (2 * Math.PI) + 2 * Math.PI;

    // Web Mercator Y coordinates for the bounds
    const toMercatorY = (lat: number) =>
      (1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2;

    const topY = toMercatorY(maxLat);
    const botY = toMercatorY(minLat);
    const ySize = botY - topY;

    // Max height in km
    const maxHeight = Math.max(...buildings.map(b => b.properties.height || 5)) / 1000;

    if (!gl) return;
    // Render to canvas
    gl.viewport(0, 0, textureSize, textureSize);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(shadowProg);

    // Bind height texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, heightTex);
    gl.uniform1i(uHeightMap, 0);

    // Uniforms
    gl.uniform1f(uWidth, textureSize);
    gl.uniform1f(uHeight, textureSize);
    gl.uniform1f(uMaxHeight, maxHeight);
    gl.uniform1f(uZoom, zoom);
    gl.uniform1f(uTopY, topY);
    gl.uniform1f(uYSize, ySize);
    gl.uniform1f(uWest, minLng);
    gl.uniform1f(uDLng, maxLng - minLng);
    gl.uniform1f(uDec, dec);
    gl.uniform1f(uHi, Hi);
    gl.uniform4fv(uShadowColor, shadowColor);
    gl.uniform1f(uStep, 1.0);

    // Screen quad positions (clip coords -1..1) + texture coords (0..1)
    // The texture coords map the viewport to the height texture
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(shadowPosLoc);
    gl.vertexAttribPointer(shadowPosLoc, 2, gl.FLOAT, false, 0, 0);

    // tex_pos = identical to screen quad but remapped [0,1]
    const texQuad = new Float32Array([0,0, 1,0, 0,1, 1,1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, texPosBuf);
    gl.bufferData(gl.ARRAY_BUFFER, texQuad, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(shadowTexPosLoc);
    gl.vertexAttribPointer(shadowTexPosLoc, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);

    gl.flush();
  }

  let lastBoundsKey = "";

  function update(date: Date, bounds: ShadowCanvasBounds, zoom: number): void {
    const boundsKey = `${bounds.minLng.toFixed(4)},${bounds.minLat.toFixed(4)},${bounds.maxLng.toFixed(4)},${bounds.maxLat.toFixed(4)}`;
    // Re-raster buildings if viewport changed significantly
    if (boundsKey !== lastBoundsKey) {
      lastBoundsKey = boundsKey;
    }
    render(date, bounds, zoom);
  }

  function destroy(): void {
    if (!gl) return;
    gl.deleteTexture(heightTex);
    gl.deleteBuffer(vbuf);
    gl.deleteBuffer(ibuf);
    gl.deleteBuffer(quadBuf);
    gl.deleteBuffer(texPosBuf);
    gl.deleteProgram(rasterProg);
    gl.deleteProgram(shadowProg);
  }

  // Initial render
  render(options.date, options.bounds, options.zoom);

  return { canvas, update, destroy };
}
