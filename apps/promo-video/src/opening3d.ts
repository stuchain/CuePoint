import { readPalette } from "../../website/src/three/palette";
import { PIXEL_SIZE, PixelPipeline } from "../../website/src/three/pixel";
import { createRenderer } from "../../website/src/three/renderer";
import { create as createOpening } from "../../website/src/three/scenes/opening";
import { at, kickLevel } from "./timing";

/**
 * The opening shot is the website's own 3D scene (DEC-189: the crate becoming the Camelot wheel),
 * drawn through the site's pixel pipeline, driven by time instead of scroll.
 */

/** Time to the scene's progress, as keyframes: the crate, the tags, the flight, the wheel facing us. */
const KEYS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [at(0, 2), 0.06],
  [at(2), 0.3],
  [at(3, 1), 0.5],
  [at(4, 2), 1],
];

export function progressAt(t: number): number {
  if (t <= KEYS[0]![0]) return KEYS[0]![1];
  for (let i = 1; i < KEYS.length; i++) {
    const [t1, p1] = KEYS[i]!;
    const [t0, p0] = KEYS[i - 1]!;
    if (t <= t1) {
      const u = (t - t0) / (t1 - t0);
      // ease in and out inside each stretch, so the story breathes between beats
      return p0 + (p1 - p0) * (u * u * (3 - 2 * u));
    }
  }
  return KEYS[KEYS.length - 1]![1];
}

export interface Opening {
  readonly canvas: HTMLCanvasElement;
  /** Draws the frame at time t (seconds into the video). */
  draw(t: number): void;
  compile(): Promise<void>;
}

export function createOpeningShot(width: number, height: number): Opening {
  const canvas = document.createElement("canvas");
  canvas.className = "scene3d";
  const renderer = createRenderer(canvas);
  if (!renderer) throw new Error("WebGL 2 is not available in this browser");
  const pixel = new PixelPipeline();
  const instance = createOpening();

  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  pixel.resize(width, height, PIXEL_SIZE);
  const palette = readPalette();
  pixel.setPalette(palette);
  instance.setPalette(palette);
  instance.resize(width / height);
  instance.setShadowSize?.(1024);

  return {
    canvas,
    draw(t) {
      const p = progressAt(t);
      instance.setProgress(p);
      // once the wheel is lit, the kick pumps it (the site does this with the visitor's sound)
      instance.setLevel?.(p >= 0.8 ? kickLevel(t) * 0.7 : 0);
      pixel.render(renderer, instance.scene, instance.camera);
    },
    async compile() {
      await renderer.compileAsync(instance.scene, instance.camera);
      pixel.compile(renderer);
    },
  };
}
