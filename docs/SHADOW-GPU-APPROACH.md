# GPU Shadow Rendering Approach

## Research Summary

ShadeMap (by Ted Piotrowski) achieves fast, precise shadows using GPU-based raycasting, NOT polygon projection.

## Current Problem

Our polygon projection approach:
- Generates 38,597 shadow polygons on CPU
- Updates GeoJSON source on every time change
- Very slow, laggy, memory-intensive

## ShadeMap's Approach

### 1. Building Height Rasterization

Convert building GeoJSON → image texture where pixel value = building height:

```
Building footprint polygon → Draw filled polygon → Pixel color = height encoding
```

This is done ONCE on map load, not on every time change.

### 2. Combined Height Texture

Merge:
- Terrain elevation tiles (e.g., Amazon Terrain tiles)
- Building height rasterization
- LiDAR tree canopy (optional)

Result: Single height texture where each pixel = ground + building height at that location.

### 3. GPU Fragment Shader Raycasting

For each pixel on screen:
```glsl
// Pseudo-GLSL
void main() {
  vec2 pixelPos = gl_FragCoord.xy;
  float groundHeight = texture2D(heightMap, pixelPos).r;
  
  // Get sun direction from time/date
  vec3 sunDir = calculateSunDirection(date, lat, lng);
  
  // Raycast toward sun
  for (int i = 0; i < MAX_STEPS; i++) {
    vec2 samplePos = pixelPos + sunDir.xy * float(i) * stepSize;
    float sampleHeight = texture2D(heightMap, samplePos).r;
    
    // Expected height if ray were unobstructed
    float expectedHeight = groundHeight + sunDir.z * float(i) * stepSize;
    
    // If terrain/building is higher than ray → shadow
    if (sampleHeight > expectedHeight) {
      gl_FragColor = shadowColor;
      return;
    }
  }
  
  // No obstruction found → sunlit
  gl_FragColor = vec4(0.0); // transparent
}
```

### 4. Why This Is Fast

- All computation in GPU shaders (massively parallel)
- Height texture loaded once, reused
- Only sun direction changes with time (uniform value)
- No GeoJSON parsing or polygon generation

## Implementation Plan for Our App

### Phase 1: Building Height Rasterization
1. Create WebGL canvas off-screen
2. Load building GeoJSON
3. For each building, draw filled polygon with height-encoded color
4. Result: Canvas texture with building heights

### Phase 2: Height Texture Integration
1. Load terrain tiles from Amazon S3 (same as ShadeMap uses)
2. Combine terrain + building textures in shader

### Phase 3: Shadow Fragment Shader
1. Create custom MapLibre layer with WebGL shader
2. Implement raycasting logic in fragment shader
3. Pass sun position as uniform

### Phase 4: Optimization
1. Limit raycast steps based on max building height
2. Use mipmaps for distant pixels
3. Consider early-exit optimizations

## Resources

- ShadeMap blog: https://tedpiotrowski.svbtle.com/
- Terrain tiles: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png`
- Elevation encoding: `elevation = (r * 256 + g + b / 256) - 32768`

## Alternative: Use Existing Library Differently

The `mapbox-gl-shadow-simulator` library DOES use this approach internally, but requires API key.
Options:
1. Fork and remove API check (done, but designed for Mapbox not MapLibre)
2. Build our own implementation

## Complexity Assessment

**Building height rasterization:** Medium (WebGL canvas drawing)
**Fragment shader raycasting:** High (GLSL knowledge required)
**MapLibre integration:** Medium (custom layer API)

Total estimated effort: 15-20 hours for quality implementation.

## Quick Win: Optimize Current Approach

If GPU approach is too complex, optimize polygon approach:
1. Only generate shadows for visible buildings (viewport culling)
2. Reduce polygon complexity (simplify building footprints)
3. Use Web Workers for shadow calculation
4. Throttle updates (don't recalculate on every slider move)

This would get us to "acceptable" performance without rewriting everything.
