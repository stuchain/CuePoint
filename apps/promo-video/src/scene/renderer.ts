import {
  BasicShadowMap,
  ColorManagement,
  LinearSRGBColorSpace,
  NoToneMapping,
  WebGLRenderer,
} from "three";

/**
 * The renderer, configured for the pixel look (SITE-05). Shared by the live stage and the stills
 * renderer, so a still is drawn the way the scene is. Palette tokens are used exactly as written
 * (no color management, no output conversion): a snapped pixel is the token's color.
 */
ColorManagement.enabled = false;

/** A renderer on its own canvas, configured for the pixel look. Null when WebGL 2 cannot be had. */
export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer | null {
  let gl: WebGL2RenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: "high-performance",
    });
  } catch {
    gl = null;
  }
  if (!gl) return null;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, context: gl });
  } catch {
    return null;
  }
  renderer.outputColorSpace = LinearSRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = BasicShadowMap; // hard, unblurred shadows
  renderer.setClearColor(0x000000, 1);
  return renderer;
}

/** Releases the context for good (WEBGL_lose_context). */
export function releaseContext(renderer: WebGLRenderer): void {
  const gl = renderer.getContext();
  renderer.dispose();
  gl.getExtension("WEBGL_lose_context")?.loseContext();
}

