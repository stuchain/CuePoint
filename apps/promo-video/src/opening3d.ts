import { readPalette } from "../../website/src/three/palette";
import { PHASES } from "../../website/src/three/phases";
import { PIXEL_SIZE, PixelPipeline } from "../../website/src/three/pixel";
import { createRenderer } from "../../website/src/three/renderer";
import { cameraPose, create as createOpening } from "../../website/src/three/scenes/opening";
import { at, BAR, BEAT, kickLevel, shot, snareLevel } from "./timing";

/**
 * The website's own 3D scene (DEC-189: the crate becoming the Camelot wheel), drawn through the site's
 * pixel pipeline and driven by time instead of scroll. The promo flies its own camera through it: an
 * orbit, a punch on every kick, a dive into the wheel at the first cut, and a slow turn around the lit
 * wheel behind the end card.
 */

/**
 * Time to the scene's progress, as keyframes built from the site's own story table (phases.ts), so the
 * captions stay on their beats if the site retunes the scene: the crate, each record taking its tag,
 * the flight into the wheel, the wheel facing us.
 */
export const KEYS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [at(0, 1), PHASES.lift[0]],
  [at(1), (PHASES.tag[0] + PHASES.tag[1]) / 2 - 0.08],
  [at(2), PHASES.fly[0]],
  [at(2, 3), 1],
];

/** From here the wheel is lit, and the kick pumps it (the site does this with the visitor's sound). */
export const PULSE_FROM = PHASES.fly[1];

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

type Vec3 = [number, number, number];

export interface CameraMove {
  /** Turn around the target, radians about the vertical axis. */
  yaw: number;
  /** 1 is the site's own distance; less is closer. */
  distance: number;
  /** Raise the camera, in world units. */
  rise: number;
  /** Field-of-view multiplier (a punch is a little less than 1). */
  zoom: number;
}

const ease = (u: number): number => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};

/** The promo's camera on top of the site's: a pure function of time. */
export function cameraMove(t: number): CameraMove {
  const punch = 1 - 0.07 * kickLevel(t) - 0.03 * snareLevel(t);
  const end = shot("end").start;
  if (t < end) {
    const u = t / shot("opening").end;
    // the dive: the last beat of the opening flies into the middle of the wheel
    const dive = ease((t - at(2, 3)) / BEAT);
    return { yaw: -0.55 + 0.75 * ease(u), distance: 1 - 0.18 * ease(u) - 0.78 * dive * dive, rise: 1.2 * (1 - u), zoom: punch };
  }
  const v = (t - end) / (4 * BAR);
  // the end card: pull out of the wheel, then turn slowly round it
  const out = ease((t - end) / BEAT);
  return { yaw: 0.7 - 1.1 * v, distance: 0.2 + 0.85 * out - 0.1 * v, rise: -1.5 + 3 * v, zoom: punch };
}

export function applyMove(pose: { position: Vec3; target: Vec3 }, m: CameraMove): Vec3 {
  const [px, py, pz] = pose.position;
  const [tx, ty, tz] = pose.target;
  const dx = px - tx;
  const dz = pz - tz;
  const c = Math.cos(m.yaw);
  const s = Math.sin(m.yaw);
  return [tx + (dx * c - dz * s) * m.distance, ty + (py - ty) * m.distance + m.rise, tz + (dx * s + dz * c) * m.distance];
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
  const baseFov = instance.camera.fov;

  return {
    canvas,
    draw(t) {
      const p = t >= shot("end").start ? 1 : progressAt(t);
      instance.setProgress(p);
      instance.setLevel?.(p >= PULSE_FROM ? kickLevel(t) * 0.9 : 0);
      const pose = cameraPose(p);
      const m = cameraMove(t);
      const cam = instance.camera;
      cam.position.set(...applyMove(pose, m));
      cam.lookAt(...pose.target);
      cam.fov = baseFov * m.zoom;
      cam.updateProjectionMatrix();
      pixel.render(renderer, instance.scene, cam);
    },
    async compile() {
      await renderer.compileAsync(instance.scene, instance.camera);
      pixel.compile(renderer);
    },
  };
}
