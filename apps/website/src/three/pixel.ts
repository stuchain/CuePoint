import {
  DepthTexture,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  UnsignedIntType,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type WebGLRenderer,
} from "three";
import { PALETTE_SIZE, type PaletteUniforms } from "./palette";

/** One scene pixel is this many CSS pixels wide: the render target is the canvas divided by it. */
export const PIXEL_SIZE = 4;

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const fragment = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uTexel;
uniform float uNear;
uniform float uFar;
uniform vec3 uPalette[${PALETTE_SIZE}];
uniform vec3 uOutline;
varying vec2 vUv;

float linearDepth(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  if (d >= 0.99999) return uFar;
  float z = d * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}

// the palette color nearest to c, weighted toward green the way the eye is
vec3 snap(vec3 c) {
  vec3 best = uPalette[0];
  float bestD = 1e9;
  for (int i = 0; i < ${PALETTE_SIZE}; i++) {
    vec3 d = c - uPalette[i];
    float dist = dot(d * d, vec3(0.299, 0.587, 0.114));
    if (dist < bestD) {
      bestD = dist;
      best = uPalette[i];
    }
  }
  return best;
}

void main() {
  float here = linearDepth(vUv);
  float nearest = here;
  nearest = min(nearest, linearDepth(vUv + vec2(uTexel.x, 0.0)));
  nearest = min(nearest, linearDepth(vUv - vec2(uTexel.x, 0.0)));
  nearest = min(nearest, linearDepth(vUv + vec2(0.0, uTexel.y)));
  nearest = min(nearest, linearDepth(vUv - vec2(0.0, uTexel.y)));
  // a pixel with a clearly nearer neighbor is the outline: one scene pixel wide, on the far side
  bool edge = (here - nearest) > max(0.6, here * 0.05);
  gl_FragColor = vec4(edge ? uOutline : snap(texture2D(tColor, vUv).rgb), 1.0);
}`;

const blitFragment = /* glsl */ `
uniform sampler2D tMap;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(texture2D(tMap, vUv).rgb, 1.0);
}`;

/**
 * Scene to a small nearest-neighbor render target, then one full-screen pass that snaps colors to the
 * palette and draws the outline, still at the small size (so the cost is per scene pixel, not per screen
 * pixel); a last pass stretches the result over the canvas with nearest-neighbor filtering. The target
 * keeps the scene's own depth, so outlines follow the shapes.
 */
export class PixelPipeline {
  readonly target: WebGLRenderTarget;
  private readonly snapped: WebGLRenderTarget;
  private readonly blit: ShaderMaterial;
  private readonly blitScene = new Scene();
  private readonly quadScene = new Scene();
  private readonly quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: ShaderMaterial;
  private readonly quad: Mesh;

  constructor() {
    const depth = new DepthTexture(1, 1, UnsignedIntType);
    depth.minFilter = NearestFilter;
    depth.magFilter = NearestFilter;
    this.target = new WebGLRenderTarget(1, 1, {
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: true,
      depthTexture: depth,
      samples: 0,
    });
    this.snapped = new WebGLRenderTarget(1, 1, { minFilter: NearestFilter, magFilter: NearestFilter, depthBuffer: false });
    this.blit = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: blitFragment,
      depthTest: false,
      depthWrite: false,
      uniforms: { tMap: { value: this.snapped.texture } },
    });
    this.blitScene.add(this.makeQuad(this.blit));
    this.material = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tColor: { value: this.target.texture },
        tDepth: { value: depth },
        uTexel: { value: [1, 1] },
        uNear: { value: 0.1 },
        uFar: { value: 100 },
        uPalette: { value: Array.from({ length: PALETTE_SIZE }, () => new Vector3()) },
        uOutline: { value: new Vector3() },
      },
    });
    this.quad = this.makeQuad(this.material);
    this.quadScene.add(this.quad);
  }

  private makeQuad(material: ShaderMaterial): Mesh {
    const quad = new Mesh(new PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    return quad;
  }

  /** Sizes the target for a canvas of this many CSS pixels; returns the target's size in scene pixels. */
  resize(cssWidth: number, cssHeight: number, pixelSize: number = PIXEL_SIZE): { width: number; height: number } {
    const w = Math.max(1, Math.ceil(cssWidth / pixelSize));
    const h = Math.max(1, Math.ceil(cssHeight / pixelSize));
    this.target.setSize(w, h);
    this.snapped.setSize(w, h);
    this.material.uniforms["uTexel"]!.value = [1 / w, 1 / h];
    return { width: w, height: h };
  }

  setPalette(p: PaletteUniforms): void {
    const list = this.material.uniforms["uPalette"]!.value as Vector3[];
    p.colors.forEach((c, i) => list[i]!.set(c[0], c[1], c[2]));
    (this.material.uniforms["uOutline"]!.value as Vector3).set(p.outline[0], p.outline[1], p.outline[2]);
  }

  render(renderer: WebGLRenderer, scene: Scene, camera: Camera & { near?: number; far?: number }): void {
    this.material.uniforms["uNear"]!.value = camera.near ?? 0.1;
    this.material.uniforms["uFar"]!.value = camera.far ?? 100;
    renderer.setRenderTarget(this.target);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(this.snapped);
    renderer.render(this.quadScene, this.quadCamera);
    renderer.setRenderTarget(null);
    renderer.render(this.blitScene, this.quadCamera);
  }

  /** Compiles the full-screen pass's program (the scene's own is compiled by the stage). */
  compile(renderer: WebGLRenderer): void {
    renderer.compile(this.quadScene, this.quadCamera);
    renderer.compile(this.blitScene, this.quadCamera);
  }

  dispose(): void {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    this.snapped.dispose();
    this.material.dispose();
    this.blit.dispose();
    this.quad.geometry.dispose();
    for (const child of this.blitScene.children) (child as Mesh).geometry.dispose();
  }
}
