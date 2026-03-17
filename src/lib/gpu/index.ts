/**
 * GPU Shadow Rendering Module
 * 
 * Exports the main API for GPU-based shadow rendering.
 */

export { createShadowLayer, type ShadowLayerOptions } from './shadowLayer';
export { createHeightTexture, filterBuildingsByBounds } from './heightTexture';
export {
  SHADOW_VERTEX_SHADER,
  SHADOW_FRAGMENT_SHADER,
  getShaderUniforms,
  type ShadowShaderUniforms,
} from './shadowShader';
export {
  compileShader,
  createProgram,
  createQuadBuffer,
  createTexture,
  createFramebuffer,
} from './shaderUtils';
