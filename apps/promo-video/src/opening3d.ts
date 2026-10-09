import { readPalette } from "./scene/palette";
import { PHASES } from "./scene/phases";
import { PIXEL_SIZE, PixelPipeline } from "./scene/pixel";
import { createRenderer } from "./scene/renderer";
import { cameraPose, create as createOpening, LABEL_HOLD } from "./scene/opening";
import { at, BEAT, kickLevel, shot } from "./timing";
import { addVinyl } from "./vinyl";
import { addWheelLights } from "./wheelLights";

/**
 * The website's own 3D scene (DEC-189: the crate becoming the Camelot wheel), drawn through the site's
 * pixel pipeline and driven by time instead of scroll. The promo flies its own camera through it: a slow
 * orbit in, a short push toward the wheel at the first cut, and a steady turn around the lit wheel
 * behind the end card.
 */

/**
 * Time to the scene's progress, as keyframes built from the site's own story table (phases.ts), so the
 * captions stay on their beats if the site retunes the scene: the crate, each record taking its tag,
 * the flight into the wheel, the wheel facing us.
 */
export const KEYS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [at(0, 0.15), PHASES.lift[0]],
  // every record is on the board with its tag by the middle of the first bar, then the board holds
  [at(0, 2.5), LABEL_HOLD[0] + 0.01],
  [at(1, 1), PHASES.fly[0]],
  [at(1, 3.25), 1],
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
  // a breath on the kick, not a jolt
  const punch = 1 - 0.015 * kickLevel(t);
  const end = shot("end").start;
  if (t < end) {
    const u = t / shot("opening").end;
    // further back than the site while the records take their tags, so the tags never fill the frame,
    // then in to the wheel, and in the last beat a short push toward it that the cut finishes
    const back = ease((t - at(0, 0.5)) / (at(0, 3) - at(0, 0.5))) * (1 - ease((t - at(1, 1)) / (BEAT * 2)));
    // the last half beat dives into the wheel's middle: the cut into the app finishes the move
    const push = ease((t - at(1, 3.5)) / (BEAT / 2));
    return { yaw: -0.6 + 0.7 * ease(u), distance: 1.12 + 0.55 * back - 0.1 * ease(u) - 0.6 * push * push * push, rise: 1.1 * (1 - u), zoom: punch };
  }
  // the end card: a slow, steady turn round the lit wheel, settling as the words land
  const v = (t - end) / (shot("end").end - end);
  // a steady turn to the last frame (not eased out, so the end never stops moving)
  return { yaw: 0.35 - 0.55 * v, distance: 1.35 - 0.08 * v, rise: 0.4 * (1 - ease(v)), zoom: punch };
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
  /** Changes the drawing size (the phone cut's end card fills the frame; its opening does not). */
  resize(width: number, height: number): void;
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
  const resize = (w: number, h: number): void => {
    renderer.setSize(w, h, false);
    pixel.resize(w, h, PIXEL_SIZE);
    instance.resize(w / h);
  };
  const palette = readPalette();
  pixel.setPalette(palette);
  instance.setPalette(palette);
  const vinyl = addVinyl(instance.scene);
  vinyl.setPalette(palette);
  const lights = addWheelLights(instance.scene);
  resize(width, height);
  instance.setShadowSize?.(1024);
  const baseFov = instance.camera.fov;

  return {
    canvas,
    resize,
    draw(t) {
      const p = t >= shot("end").start ? 1 : progressAt(t);
      instance.setProgress(p);
      vinyl.update(p);
      lights.update(t);
      // the kick pumps the wheel as it fills; behind the end card the promo's own lights do the pumping
      instance.setLevel?.(p >= PULSE_FROM && t < shot("end").start ? kickLevel(t) * 0.9 : 0);
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
