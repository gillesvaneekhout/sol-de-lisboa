# ShadeMap-Style Shadow Implementation Plan

Based on Ted Piotrowski's documented approach at https://tedpiotrowski.svbtle.com/

## Ted's Core Architecture

Ted's ShadeMap uses a multi-layer approach:

### 1. Height Data Pipeline
```
Terrain tiles (Amazon S3) + Building rasterization + LiDAR (optional)
            ↓
   Combined height texture (WebGL)
            ↓
   GPU fragment shader raycasting
            ↓
   Shadow overlay
```

### 2. Data Sources Ted Uses
- **Terrain**: Amazon OpenData tiles `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
- **Elevation encoding**: `elevation = (r * 256 + g + b / 256) - 32768` (Terrarium format)
- **Buildings**: Mapbox vector tiles `map.querySourceFeatures('composite', { sourceLayer: 'building' })`
- **LiDAR**: Regional GeoTIFF converted to RGB-encoded tiles

### 3. Building Integration
From Ted's blog "Adding buildings to Shade Map":
> "I convert the GeoJSON information into an image tile where I draw the area of the building and fill its pixels with the corresponding height. Then I combine the elevation image tile with the building image tile to get a final elevation tile with buildings included."

---

## Our Implementation Plan

### Phase 0: Understand Current Assets (Done ✅)
- [x] 38,597 buildings from OSM
- [x] LiDAR heights from DGT MDS tiles (72% enhanced)
- [x] Lisbon-specific data ready

### Phase 1: Building Height Rasterization
**Goal**: Convert building GeoJSON to height texture

**Steps**:
1. Create off-screen WebGL canvas (match map tile size, e.g., 512x512)
2. For each building in viewport:
   - Transform polygon coordinates to canvas pixels
   - Draw filled polygon
   - Color encodes height: `r = height / 256`, `g = height % 256`
3. Output: WebGL texture with building heights

**Code pattern** (from Ted's library):
```javascript
// BuildingRasterizer class in the library handles this
// Key: raster() method creates height texture from GeoJSON features
```

**Files to create**:
- `src/lib/buildingRasterizer.ts` - WebGL canvas rasterization

### Phase 2: Terrain Tile Integration
**Goal**: Load + decode Amazon terrain tiles

**Steps**:
1. Calculate visible tile coordinates based on map bounds
2. Fetch terrain tiles from `elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
3. Decode using Terrarium format: `elevation = (r * 256 + g + b / 256) - 32768`
4. Create WebGL texture

**Tile math** (from Ted's code):
```javascript
const getTileCoords = (lat, lng, zoom) => {
  const x = Math.floor((lng + 180) / 360 * Math.pow(2, zoom));
  const y = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 
    1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * Math.pow(2, zoom));
  return { x, y, z: zoom };
};
```

**Files to create**:
- `src/lib/terrainTiles.ts` - Tile fetching and decoding
- `src/lib/tileMerger.ts` - Combine multiple tiles into single texture

### Phase 3: Combined Height Texture
**Goal**: Merge terrain + buildings into single texture

**Steps**:
1. Render terrain texture to framebuffer
2. Overlay building heights (additive blending)
3. Result: Combined DSM (Digital Surface Model)

**From Ted's BuildingRasterizer**:
```javascript
// Combines elevation image tile with building image tile
// Uses WebGL framebuffer operations
```

### Phase 4: Shadow Fragment Shader
**Goal**: GPU raycasting for shadow determination

**Core algorithm** (reverse-engineered from Ted's shader):
```glsl
// For each pixel:
// 1. Get ground height at pixel location
// 2. Calculate sun direction from date/time
// 3. Cast ray toward sun
// 4. Sample height texture along ray
// 5. If any sample is higher than ray → shadow

uniform sampler2D heightMap;
uniform float sunAzimuth;
uniform float sunAltitude;
uniform float maxHeight;

void main() {
  vec2 pos = gl_FragCoord.xy;
  float groundHeight = texture2D(heightMap, pos / resolution).r;
  
  // Ray direction from sun position
  vec2 rayDir = vec2(-sin(sunAzimuth), cos(sunAzimuth));
  float dz = tan(sunAltitude);
  
  // March along ray
  for (int i = 1; i < MAX_STEPS; i++) {
    vec2 samplePos = pos + rayDir * float(i) * stepSize;
    float sampleHeight = texture2D(heightMap, samplePos / resolution).r;
    float rayHeight = groundHeight + dz * float(i) * stepSize;
    
    if (sampleHeight > rayHeight) {
      gl_FragColor = shadowColor;
      return;
    }
  }
  
  gl_FragColor = vec4(0.0); // transparent - in sun
}
```

**Files to create**:
- `src/lib/shadowShader.ts` - GLSL shader compilation
- `src/lib/shadowRenderer.ts` - WebGL rendering pipeline

### Phase 5: MapLibre Custom Layer
**Goal**: Integrate shader as MapLibre layer

**Approach**:
- Use MapLibre's Custom Layer API
- Render to texture, overlay on map
- Update sun position uniform on time change

**Example**:
```javascript
map.addLayer({
  id: 'shadow-layer',
  type: 'custom',
  onAdd: function(map, gl) {
    // Initialize WebGL program
    this.program = createShadowProgram(gl);
    this.heightTexture = createHeightTexture(gl, buildings, terrain);
  },
  render: function(gl, matrix) {
    // Update sun uniform
    const sun = SunCalc.getPosition(date, lat, lng);
    gl.uniform1f(this.sunAzimuthLoc, sun.azimuth);
    gl.uniform1f(this.sunAltitudeLoc, sun.altitude);
    // Render shadow
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
});
```

### Phase 6: Optimizations
1. **Tile caching**: Store processed height tiles
2. **Level of detail**: Reduce raycast steps at lower zoom
3. **Viewport culling**: Only process visible area
4. **Mipmap sampling**: Faster texture lookups

---

## Alternative: Use Ted's Library Directly

Ted's `mapbox-gl-shadow-simulator` is designed for Mapbox GL, not MapLibre, but they share similar WebGL context.

**Option A: Fork + Adapt**
1. Fork the library
2. Remove API key check
3. Replace Mapbox-specific calls with MapLibre equivalents
4. Key differences: `map.painter.context.gl` → `map.getCanvas().getContext('webgl')`

**Option B: Extract Core Shader**
Ted's shader code is in the minified bundle. We could:
1. De-minify the fragment shader
2. Understand the raycast algorithm
3. Reimplement with MapLibre integration

---

## Estimated Effort

| Phase | Hours | Complexity |
|-------|-------|------------|
| 1. Building rasterization | 4h | Medium |
| 2. Terrain tiles | 3h | Low |
| 3. Combined texture | 3h | Medium |
| 4. Shadow shader | 8h | High |
| 5. MapLibre layer | 4h | Medium |
| 6. Optimizations | 4h | Medium |
| **Total** | **26h** | |

**Alternative (fork library)**: ~8h if we can adapt cleanly

---

## Resources

### Ted's Documentation
- Blog: https://tedpiotrowski.svbtle.com/
- Examples: https://github.com/ted-piotrowski/shademap-examples
- API docs: https://shademap.app/about

### Key Blog Posts
1. "Adding buildings to Shade Map" - Building rasterization
2. "Using LiDAR to map tree shadows" - High-res elevation data
3. "Spring update on Shade Map" - Performance optimizations
4. "Sun and Shadow Maps: Models vs Reality" - Philosophy + future

### Terrain Tiles
- Amazon: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
- Encoding: Terrarium (r*256 + g + b/256 - 32768)
- Max zoom: 15

### Our Data Advantage
- We have Portuguese DGT LiDAR (50cm resolution)
- Already processed building heights from LiDAR
- Can create higher-quality height textures than Ted's default

---

## Next Steps

1. **Quick test**: Try forking Ted's library with API bypass
2. If that fails: Implement Phase 1-5 from scratch
3. Use our LiDAR data for superior Lisbon coverage

## Decision Point

Before starting: should we:
- A) Spend 8h trying to adapt Ted's library (faster but risky)
- B) Build from scratch using his documented approach (26h but reliable)
- C) Hybrid: Use Ted's shader code, build our own data pipeline (15h)

Recommendation: **Option C** - Extract Ted's proven shader algorithm, build data pipeline ourselves using our superior LiDAR data.
