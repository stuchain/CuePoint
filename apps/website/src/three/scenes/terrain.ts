import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  InstancedMesh,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
} from "three";
import type { PaletteUniforms } from "../palette";
import type { SceneInstance } from "./types";

/**
 * The Waveforms section's prop (SITE-06): a track's waveform as a voxel landscape. Columns run along the
 * track; each column is mirrored across the middle row, tallest there, in three bands the way the app
 * draws one (lows, mids, highs). On its own the waveform slides under a fixed playhead, as if playing, and
 * a few cue markers ride along the floor. The scroll brings the camera down from above to the side.
 *
 * It is a drawing of the idea, not the app's picture: the track is made up of sines (deterministic, so the
 * still never changes), and the app's real waveform is in the screenshot slot beside it.
 */

export const REST_PROGRESS = 0.5;

/** Columns along the track, and rows across it (odd: one middle row). */
export const COLS = 48;
export const ROWS = 11;
/** One loop of the made-up track, in columns. */
export const TRACK_LENGTH = 96;
/** Columns a second the waveform slides by. */
export const SPEED = 6;
/** Heights move in steps this tall, so the landscape stays blocky. */
export const STEP = 0.25;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * The made-up track's loudness at column `x` (any number; it loops every TRACK_LENGTH), 0 to 1: an intro,
 * a build, a drop, a breakdown and a second drop, with a kick every four columns.
 */
export function loudness(x: number): number {
  const xm = ((x % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
  const t = xm / TRACK_LENGTH;
  const section = t < 0.15 ? 0.3 : t < 0.3 ? lerp(0.35, 0.8, (t - 0.15) / 0.15) : t < 0.5 ? 1 : t < 0.62 ? 0.18 : t < 0.68 ? lerp(0.25, 0.85, (t - 0.62) / 0.06) : 1;
  const kick = Math.floor(xm) % 4 === 0 ? 1 : Math.floor(xm) % 2 === 0 ? 0.62 : 0.78;
  const wobble = 0.8 + 0.2 * Math.sin(xm * 0.9) * Math.cos(xm * 0.37);
  return clamp01(section * kick * wobble);
}

/** The height of the column at track position x, row `row` (0..ROWS-1), in whole steps. */
export function columnHeight(x: number, row: number): number {
  const mid = (ROWS - 1) / 2;
  const across = 1 - Math.abs(row - mid) / (mid + 1); // 1 in the middle row, small at the edges
  const h = 0.25 + loudness(x) * 6.4 * Math.pow(across, 1.6);
  return Math.max(STEP, Math.round(h / STEP) * STEP);
}

/** The band a row is drawn in: 0 lows (the tall middle rows), 1 mids, 2 highs (the low outer rows). */
export const band = (row: number): 0 | 1 | 2 => {
  const d = Math.abs(row - (ROWS - 1) / 2);
  return d <= 1 ? 0 : d <= 3 ? 1 : 2;
};

export function cameraAt(progress: number): { position: [number, number, number]; target: [number, number, number] } {
  const p = smooth(clamp01(progress));
  return { position: [lerp(-6, 5, p), lerp(15, 11, p), lerp(20, 23, p)], target: [0, 1.2, 0] };
}

const SLOT = { panel: 1, panelAlt: 2, borderMuted: 3, highlight: 4, text: 7, primary: 8, warning: 13, danger: 14, success: 12, info: 15 } as const;
const BAND_SLOTS = [SLOT.primary, SLOT.warning, SLOT.text] as const;
const CUE_SLOTS = [SLOT.danger, SLOT.success, SLOT.info, SLOT.warning] as const;
const toColor = (c: readonly [number, number, number]): Color => new Color(c[0], c[1], c[2]);
const PITCH = 0.62;
const CUES = 4;

export function create(): SceneInstance {
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 16 / 9, 0.5, 90);
  scene.add(new AmbientLight(0xffffff, 0.6 * Math.PI));
  const sun = new DirectionalLight(0xffffff, 0.75 * Math.PI);
  sun.position.set(-8, 16, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  for (const k of ["left", "bottom"] as const) sun.shadow.camera[k] = -18;
  for (const k of ["right", "top"] as const) sun.shadow.camera[k] = 18;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const box = new BoxGeometry(1, 1, 1);
  const material = new MeshLambertMaterial();
  const count = COLS * ROWS;
  const field = new InstancedMesh(box, material, count);
  field.castShadow = true;
  field.receiveShadow = true;
  field.frustumCulled = false;
  for (let i = 0; i < count; i++) field.setColorAt(i, new Color(0xffffff));
  scene.add(field);

  const baseMaterial = new MeshLambertMaterial();
  const base = new InstancedMesh(box, baseMaterial, 2);
  base.receiveShadow = true;
  const dummy = new Object3D();
  const width = COLS * PITCH;
  dummy.position.set(0, -0.3, 0);
  dummy.scale.set(width + 1.2, 0.6, ROWS * PITCH + 1.2);
  dummy.updateMatrix();
  base.setMatrixAt(0, dummy.matrix);
  // the playhead: a thin wall across the waveform, at the middle
  dummy.position.set(0, 2.4, 0);
  dummy.scale.set(0.14, 4.8, ROWS * PITCH + 1.4);
  dummy.updateMatrix();
  base.setMatrixAt(1, dummy.matrix);
  base.setColorAt(0, new Color(0xffffff));
  base.setColorAt(1, new Color(0xffffff));
  scene.add(base);

  const cueMaterial = new MeshLambertMaterial();
  const cues = new InstancedMesh(box, cueMaterial, CUES);
  cues.castShadow = true;
  cues.frustumCulled = false;
  for (let i = 0; i < CUES; i++) cues.setColorAt(i, new Color(0xffffff));
  scene.add(cues);

  let progress = REST_PROGRESS;
  let time = 0;
  let level = 0;
  let palette: PaletteUniforms | undefined;
  const bands = [new Color(), new Color(), new Color()];
  const cueColors = CUE_SLOTS.map(() => new Color());

  function applyPalette(): void {
    if (!palette) return;
    scene.background = toColor(palette.background);
    BAND_SLOTS.forEach((s, k) => bands[k]!.copy(toColor(palette!.colors[s]!)));
    CUE_SLOTS.forEach((s, k) => cueColors[k]!.copy(toColor(palette!.colors[s]!)));
    base.setColorAt(0, toColor(palette.colors[SLOT.panel]!));
    base.setColorAt(1, toColor(palette.colors[SLOT.text]!));
    if (base.instanceColor) base.instanceColor.needsUpdate = true;
  }

  function layout(): void {
    const offset = time * SPEED;
    const shift = offset - Math.floor(offset); // the sub-column slide, so the motion is smooth
    for (let c = 0; c < COLS; c++) {
      const x = c + Math.floor(offset);
      for (let r = 0; r < ROWS; r++) {
        const h = columnHeight(x, r) * (1 + level * 0.35);
        const i = c * ROWS + r;
        dummy.position.set((c - shift - (COLS - 1) / 2) * PITCH, h / 2, (r - (ROWS - 1) / 2) * PITCH);
        dummy.scale.set(PITCH * 0.86, h, PITCH * 0.86);
        dummy.updateMatrix();
        field.setMatrixAt(i, dummy.matrix);
        field.setColorAt(i, bands[band(r)]!);
      }
    }
    field.instanceMatrix.needsUpdate = true;
    if (field.instanceColor) field.instanceColor.needsUpdate = true;
    // cue markers every quarter of the loop, riding along the front edge
    for (let k = 0; k < CUES; k++) {
      const at = ((((k * TRACK_LENGTH) / CUES + 20 - offset) % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
      const visible = at < COLS;
      dummy.position.set((at - (COLS - 1) / 2) * PITCH, 0.35, ((ROWS - 1) / 2) * PITCH + 0.9);
      dummy.scale.set(visible ? 0.5 : 0.0001, 0.7, 0.5);
      dummy.updateMatrix();
      cues.setMatrixAt(k, dummy.matrix);
      cues.setColorAt(k, cueColors[k]!);
    }
    cues.instanceMatrix.needsUpdate = true;
    if (cues.instanceColor) cues.instanceColor.needsUpdate = true;
    const cam = cameraAt(progress);
    camera.position.set(...cam.position);
    camera.lookAt(...cam.target);
  }

  return {
    scene,
    camera,
    setPalette(p) {
      palette = p;
      applyPalette();
      layout();
    },
    setProgress(p) {
      progress = clamp01(p);
      layout();
    },
    setLevel(l) {
      level = clamp01(l);
      layout();
    },
    tick(seconds) {
      time = seconds;
      layout();
      return true;
    },
    setShadowSize(size) {
      sun.castShadow = size > 0;
      if (size > 0) sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    },
    resize(aspect) {
      camera.aspect = aspect;
      camera.fov = aspect < 1.2 ? 30 / Math.max(0.6, aspect / 1.2) : 30;
      camera.updateProjectionMatrix();
    },
    dispose() {
      box.dispose();
      material.dispose();
      baseMaterial.dispose();
      cueMaterial.dispose();
      field.dispose();
      base.dispose();
      cues.dispose();
      sun.shadow.map?.dispose();
    },
  };
}
