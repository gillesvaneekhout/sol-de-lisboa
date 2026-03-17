/**
 * GLSL shaders for GPU-based shadow raycasting.
 * 
 * Based on Ted Piotrowski's ShadeMap approach:
 * - Height texture encodes terrain + building heights
 * - Fragment shader raycasts from each pixel toward sun
 * - If ray intersects higher terrain → pixel is in shadow
 */

// Vertex shader - full screen quad
export const SHADOW_VERTEX_SHADER = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  
  void main() {
    // a_position is in [-1, 1] range
    v_texCoord = a_position * 0.5 + 0.5; // Convert to [0, 1] for texture
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Fragment shader - shadow raycasting
export const SHADOW_FRAGMENT_SHADER = `
  precision highp float;
  
  uniform sampler2D u_heightMap;
  uniform vec2 u_resolution;       // Texture resolution
  uniform float u_sunAzimuth;      // Sun azimuth in radians (0 = south, + = west)
  uniform float u_sunAltitude;     // Sun altitude in radians above horizon
  uniform float u_maxHeight;       // Maximum building height in meters
  uniform vec4 u_shadowColor;      // Shadow color (RGBA)
  uniform vec2 u_pixelScale;       // Meters per pixel (x, y)
  
  varying vec2 v_texCoord;
  
  const int MAX_STEPS = 200;
  const float MIN_ALTITUDE = 0.05; // ~3 degrees - sun too low
  
  // Decode height from RG channels (16-bit, centimeters)
  float getHeight(vec2 uv) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      return 0.0;
    }
    vec4 color = texture2D(u_heightMap, uv);
    return (color.r * 255.0 * 256.0 + color.g * 255.0) / 100.0; // cm to m
  }
  
  void main() {
    // Sun below horizon or very low - everything in shadow
    if (u_sunAltitude < MIN_ALTITUDE) {
      gl_FragColor = u_shadowColor;
      return;
    }
    
    float groundHeight = getHeight(v_texCoord);
    
    // No building data at this pixel
    if (groundHeight < 0.01) {
      gl_FragColor = vec4(0.0);
      return;
    }
    
    // Calculate ray direction in texture space
    // Sun azimuth: 0 = south, positive = clockwise (west)
    // Shadow ray goes TOWARD sun (opposite of shadow direction)
    vec2 rayDir;
    rayDir.x = -sin(u_sunAzimuth);
    rayDir.y = cos(u_sunAzimuth);
    
    // Step size in texture coordinates
    // We want to step roughly 1-2 meters per iteration
    float stepMeters = 2.0;
    vec2 stepUV = vec2(
      stepMeters / u_pixelScale.x / u_resolution.x,
      stepMeters / u_pixelScale.y / u_resolution.y
    );
    
    // Height change per step
    float dz = tan(u_sunAltitude) * stepMeters;
    
    // Current ray position
    vec2 sampleUV = v_texCoord;
    float rayHeight = groundHeight;
    
    // March toward sun
    for (int i = 1; i < MAX_STEPS; i++) {
      sampleUV += rayDir * stepUV;
      rayHeight += dz;
      
      // Out of texture bounds - no obstruction found
      if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || 
          sampleUV.y < 0.0 || sampleUV.y > 1.0) {
        break;
      }
      
      // Ray is above max possible height - no obstruction
      if (rayHeight > u_maxHeight + 10.0) {
        break;
      }
      
      // Sample terrain/building height at this position
      float sampleHeight = getHeight(sampleUV);
      
      // If terrain/building is higher than ray → shadow
      // Add small bias to prevent self-shadowing
      if (sampleHeight > rayHeight + 0.5) {
        gl_FragColor = u_shadowColor;
        return;
      }
    }
    
    // No obstruction found - in sun (fully transparent)
    gl_FragColor = vec4(0.0);
  }
`;

/**
 * Shader program configuration.
 */
export interface ShadowShaderUniforms {
  u_heightMap: WebGLUniformLocation | null;
  u_resolution: WebGLUniformLocation | null;
  u_sunAzimuth: WebGLUniformLocation | null;
  u_sunAltitude: WebGLUniformLocation | null;
  u_maxHeight: WebGLUniformLocation | null;
  u_shadowColor: WebGLUniformLocation | null;
  u_pixelScale: WebGLUniformLocation | null;
}

export function getShaderUniforms(
  gl: WebGLRenderingContext,
  program: WebGLProgram
): ShadowShaderUniforms {
  return {
    u_heightMap: gl.getUniformLocation(program, 'u_heightMap'),
    u_resolution: gl.getUniformLocation(program, 'u_resolution'),
    u_sunAzimuth: gl.getUniformLocation(program, 'u_sunAzimuth'),
    u_sunAltitude: gl.getUniformLocation(program, 'u_sunAltitude'),
    u_maxHeight: gl.getUniformLocation(program, 'u_maxHeight'),
    u_shadowColor: gl.getUniformLocation(program, 'u_shadowColor'),
    u_pixelScale: gl.getUniformLocation(program, 'u_pixelScale'),
  };
}
