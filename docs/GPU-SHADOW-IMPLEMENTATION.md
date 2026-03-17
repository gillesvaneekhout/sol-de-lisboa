# GPU Shadow Implementation - Execution Plan

## Feasibility: CONFIRMED ✅

All requirements satisfied:
- MapLibre GL: ✅ v5.20.1 installed, CustomLayerInterface available
- WebGL context: ✅ Provided by MapLibre
- SunCalc: ✅ Already installed
- Terrain tiles: ✅ Amazon S3 accessible (HTTP 200)
- Building data: ✅ 38,597 buildings with heights
- LiDAR data: ✅ 33 DGT MDS tiles available
- No additional npm packages needed

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MapLibre GL Map                              │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │           Custom Shadow Layer (WebGL)                     │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐  │  │
│  │  │  Height     │  │  Shadow     │  │   Uniforms        │  │  │
│  │  │  Texture    │──│  Shader     │──│   - sunAzimuth    │  │  │
│  │  │  (terrain+  │  │  (raycast)  │  │   - sunAltitude   │  │  │
│  │  │   buildings)│  │             │  │   - shadowColor   │  │  │
│  │  └─────────────┘  └─────────────┘  └───────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │ Building    │  │ Terrain     │  │ Terrace     │             │
│  │ Layer       │  │ Layer       │  │ Markers     │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

## Files to Create

1. `src/lib/gpu/heightTexture.ts` - Rasterize buildings to WebGL texture
2. `src/lib/gpu/terrainLoader.ts` - Fetch and decode terrain tiles
3. `src/lib/gpu/shadowShader.ts` - GLSL vertex/fragment shaders
4. `src/lib/gpu/shadowLayer.ts` - MapLibre CustomLayerInterface impl
5. `src/components/ShadowMapGL.tsx` - React component using new layer

## Phase 1: Height Texture Generation

### Building Rasterization

Convert building GeoJSON to height texture (off-screen WebGL):

```typescript
// src/lib/gpu/heightTexture.ts

export function createHeightTexture(
  gl: WebGLRenderingContext,
  buildings: BuildingFeature[],
  bounds: LngLatBounds,
  textureSize: number = 512
): WebGLTexture {
  // 1. Create framebuffer for off-screen rendering
  // 2. For each building:
  //    - Transform polygon to texture coordinates
  //    - Draw filled polygon
  //    - Color = height encoded as RGB
  // 3. Return texture
}
```

Height encoding (16-bit in RG channels):
```
height_cm = height_m * 100
R = Math.floor(height_cm / 256) / 255
G = (height_cm % 256) / 255
```

### Polygon Rasterization (WebGL)

Use triangulation (earcut) + simple fill shader:
```glsl
// Vertex shader
attribute vec2 a_position;
uniform mat3 u_transform;
void main() {
  vec2 pos = (u_transform * vec3(a_position, 1.0)).xy;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}

// Fragment shader
uniform vec2 u_height; // encoded as RG
void main() {
  gl_FragColor = vec4(u_height, 0.0, 1.0);
}
```

## Phase 2: Terrain Tile Loading

```typescript
// src/lib/gpu/terrainLoader.ts

export async function loadTerrainTiles(
  bounds: LngLatBounds,
  zoom: number = 14
): Promise<ImageData[]> {
  const tiles = getTilesForBounds(bounds, zoom);
  const images = await Promise.all(
    tiles.map(tile => 
      loadImage(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${tile.z}/${tile.x}/${tile.y}.png`)
    )
  );
  return images;
}

export function decodeTerrarium(r: number, g: number, b: number): number {
  return (r * 256 + g + b / 256) - 32768; // meters
}
```

## Phase 3: Shadow Raycast Shader

```glsl
// src/lib/gpu/shadowShader.ts

const SHADOW_FRAGMENT_SHADER = `
precision highp float;

uniform sampler2D u_heightMap;
uniform vec2 u_resolution;
uniform float u_sunAzimuth;   // radians
uniform float u_sunAltitude;  // radians
uniform float u_maxHeight;    // meters
uniform vec4 u_shadowColor;

varying vec2 v_texCoord;

const int MAX_STEPS = 128;
const float STEP_SIZE = 0.002; // ~2m at texture resolution

float getHeight(vec2 uv) {
  vec4 color = texture2D(u_heightMap, uv);
  return (color.r * 256.0 + color.g) * 100.0; // cm to m
}

void main() {
  vec2 uv = v_texCoord;
  float groundHeight = getHeight(uv);
  
  // Skip if no elevation data
  if (groundHeight < 0.1) {
    gl_FragColor = vec4(0.0);
    return;
  }
  
  // Ray direction (horizontal component)
  vec2 rayDir = vec2(-sin(u_sunAzimuth), cos(u_sunAzimuth));
  float rayDz = tan(u_sunAltitude) * length(rayDir) * STEP_SIZE * 111320.0;
  
  float rayHeight = groundHeight;
  vec2 sampleUV = uv;
  
  // March toward sun
  for (int i = 1; i < MAX_STEPS; i++) {
    sampleUV += rayDir * STEP_SIZE;
    rayHeight += rayDz;
    
    // Out of bounds check
    if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || 
        sampleUV.y < 0.0 || sampleUV.y > 1.0) {
      break;
    }
    
    // Height at sample point
    float sampleHeight = getHeight(sampleUV);
    
    // If terrain/building blocks ray -> shadow
    if (sampleHeight > rayHeight + 0.5) {
      gl_FragColor = u_shadowColor;
      return;
    }
    
    // Early exit if ray is above max height
    if (rayHeight > u_maxHeight) {
      break;
    }
  }
  
  // No obstruction -> in sun (transparent)
  gl_FragColor = vec4(0.0);
}
`;
```

## Phase 4: MapLibre Custom Layer

```typescript
// src/lib/gpu/shadowLayer.ts

import type { CustomLayerInterface } from 'maplibre-gl';

export function createShadowLayer(
  buildings: BuildingFeature[],
  options: ShadowOptions
): CustomLayerInterface {
  let program: WebGLProgram;
  let heightTexture: WebGLTexture;
  let quadBuffer: WebGLBuffer;
  
  return {
    id: 'shadow-layer',
    type: 'custom',
    renderingMode: '2d',
    
    onAdd(map, gl) {
      // 1. Compile shaders
      program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
      
      // 2. Create height texture from buildings
      heightTexture = createHeightTexture(gl, buildings, map.getBounds());
      
      // 3. Create full-screen quad
      quadBuffer = createQuadBuffer(gl);
      
      // 4. Get uniform locations
      // ...
    },
    
    render(gl, matrix) {
      // 1. Calculate sun position
      const sun = SunCalc.getPosition(options.date, lat, lng);
      
      // 2. Set uniforms
      gl.uniform1f(sunAzimuthLoc, sun.azimuth);
      gl.uniform1f(sunAltitudeLoc, sun.altitude);
      
      // 3. Bind texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, heightTexture);
      
      // 4. Draw full-screen quad
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  };
}
```

## Phase 5: React Integration

```typescript
// src/components/ShadowMapGL.tsx

export default function ShadowMapGL({ selectedTime, ... }) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const shadowLayerRef = useRef<CustomLayerInterface | null>(null);
  
  useEffect(() => {
    if (!mapRef.current) return;
    
    // Create shadow layer
    const layer = createShadowLayer(buildings, {
      date: selectedTime,
      shadowColor: [0, 0, 0.2, 0.5]
    });
    
    mapRef.current.addLayer(layer, 'building-fills');
    shadowLayerRef.current = layer;
    
    return () => {
      mapRef.current?.removeLayer('shadow-layer');
    };
  }, []);
  
  // Update sun position when time changes
  useEffect(() => {
    if (shadowLayerRef.current) {
      // Trigger re-render with new time
      mapRef.current?.triggerRepaint();
    }
  }, [selectedTime]);
}
```

## Execution Order

1. ✅ Create `src/lib/gpu/` directory
2. ⏳ Implement `heightTexture.ts` - building rasterization
3. ⏳ Implement `terrainLoader.ts` - terrain tile fetching
4. ⏳ Implement `shadowShader.ts` - GLSL shaders
5. ⏳ Implement `shadowLayer.ts` - CustomLayerInterface
6. ⏳ Create `ShadowMapGL.tsx` - React component
7. ⏳ Update `page.tsx` to use new component
8. ⏳ Test and iterate

## Success Criteria

- [ ] Shadows render in <100ms on time change
- [ ] Smooth slider interaction (60fps)
- [ ] Correct shadow direction based on sun position
- [ ] Building shadows visible at zoom 14+
- [ ] No visual artifacts at shadow edges

## Fallback Plan

If GPU approach has issues:
1. Keep optimized polygon approach as fallback
2. Add toggle in UI to switch between modes
3. Use polygon mode for low-end devices
