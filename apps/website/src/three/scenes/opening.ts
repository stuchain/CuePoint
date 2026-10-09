import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  Euler,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RGBAFormat,
  Scene,
  UnsignedByteType,
} from "three";
import type { PaletteUniforms } from "../palette";
import { PHASES, STILL_FRAMES as FRAMES } from "../phases";
import { layoutLabel, type LabelMask } from "../pixel-font";
import type { SceneInstance } from "./types";

/**
 * The home page's opening scene (SITE-06, DEC-189): the crate becomes the wheel, as one full-screen,
 * pinned story.
 *
 * The first screen is the hero: a voxel crate of 24 records in blank sleeves, and behind it, standing
 * tall, an empty Camelot wheel of 24 dark sockets. With nothing scrolled it moves on its own: the wheel
 * turns slowly, the records breathe in the crate, dust drifts through the light and the camera sways.
 * As the visitor scrolls, the camera dives into the crate and the records lift out past it, hang in a
 * grid and take their key as a pixel tag, then fly back into the wheel, each to its own key, and the
 * wheel lights up key by key as they land (the tags come back on the lit cells). Last, the camera squares
 * up to the lit wheel and a light runs round it, key by key, where the page hands over to the app window.
 *
 * The story is a pure function of the scroll progress (0 to 1). Everything between `recordPose` and the
 * camera is plain numbers, so opening.test.ts checks the story without WebGL; `create()` only turns those
 * numbers into instanced boxes, and adds the motion over time (`tick`) on top, which a still never has.
 */

export const REST_PROGRESS = 0;
/** The frames drawn as stills beside the resting one (see phases.ts). */
export const STILL_FRAMES: Readonly<Record<string, number>> = FRAMES;
/** The opening fills the screen: it has tall stills for a phone held upright too. */
export const TALL_STILLS = true;

export const RECORD_COUNT = 24;
/** Camelot keys, 1A to 12B. Record i carries KEYS[i]. */
export const KEYS: readonly string[] = Array.from({ length: RECORD_COUNT }, (_, i) => `${Math.floor(i / 2) + 1}${i % 2 === 0 ? "A" : "B"}`);

export { PHASES };

/** The crate, in world units. `height` is the top of its walls. */
export const CRATE = { halfWidth: 4.2, halfDepth: 1.9, height: 2.2, floor: 0.3, wall: 0.3 } as const;
/**
 * The wheel stands upright behind the crate, facing the camera: B (major) outside, A (minor) inside. Radii
 * are to the middle of a ring of cells; `depth` is a lit cell's thickness, `radial` its height across the ring.
 */
export const WHEEL = { innerRadius: 3.2, outerRadius: 5, depth: 0.7, radial: 1.5, center: [0, 7.6, -10] } as const;

const SLEEVE = { thick: 0.28, size: 3 } as const;
/** While the tags show, the sleeves hang smaller, in a grid, so no tag is hidden. */
const HUNG = { width: 3.2, height: 2.2, cols: 6, pitchX: 3.5, pitchY: 2.6, bottom: 3.4 } as const;
const PITCH = 0.3; // between records in the crate
/** A dark socket sits this far behind the face of a lit cell. */
const SOCKET_BACK = 0.55;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const wrapPi = (a: number): number => ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
const span = (p: number, range: readonly [number, number]): number => clamp01((p - range[0]) / (range[1] - range[0]));
/** A deterministic 0..1 number for (record, purpose): the same every render, so the still never changes. */
const rand = (i: number, salt: number): number => {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** A staggered 0..1: record `order01` (0..1) starts later, each takes half the phase. */
function staggered(p: number, range: readonly [number, number], order01: number): number {
  const half = (range[1] - range[0]) / 2;
  return clamp01((p - range[0] - order01 * half) / half);
}

export interface WheelSlot {
  x: number;
  y: number;
  z: number;
  /** Clockwise from the top, in radians, with the wheel's turn. */
  angle: number;
  ring: "A" | "B";
  /** 0 to 11 (Camelot number minus one). */
  index: number;
  radius: number;
  /** The cell's width along the ring. */
  width: number;
}

/** Where record i sits in the standing wheel, the wheel turned by `spin` radians clockwise. */
export function wheelSlot(i: number, spin = 0): WheelSlot {
  const number = Math.floor(i / 2) + 1;
  const ring = i % 2 === 0 ? "A" : "B";
  const radius = ring === "B" ? WHEEL.outerRadius : WHEEL.innerRadius;
  const angle = ((number - 12) * Math.PI) / 6 + spin;
  return {
    x: WHEEL.center[0] + radius * Math.sin(angle),
    y: WHEEL.center[1] + radius * Math.cos(angle),
    z: WHEEL.center[2],
    angle,
    ring,
    index: number - 1,
    radius,
    width: ((2 * Math.PI * radius) / 12) * 0.86,
  };
}

/** The order the wheel fills in: around the clock from 1, both rings together. 0 to 1. */
export const arrivalOrder = (i: number): number => (wheelSlot(i).index * 2 + (wheelSlot(i).ring === "A" ? 0 : 1)) / (RECORD_COUNT - 1);
const liftOrder = (i: number): number => i / (RECORD_COUNT - 1);

interface Spot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  roll: number;
}

function restSpot(i: number): Spot {
  return {
    x: (i - (RECORD_COUNT - 1) / 2) * PITCH,
    // some sleeves sit higher than others, as in a crate nobody has tidied
    y: CRATE.floor + SLEEVE.size / 2 + rand(i, 1) * 0.35,
    z: (rand(i, 2) - 0.5) * 0.24,
    yaw: (rand(i, 3) - 0.5) * 0.06,
    roll: (rand(i, 4) - 0.5) * 0.36,
  };
}

/** Where the records hang while their tags show: a grid of six by four, in a shuffled order. */
function hungSpot(i: number): Spot {
  const place = (i * 7 + 3) % RECORD_COUNT; // 7 and 24 share no factor: every place is used once
  const col = place % HUNG.cols;
  const row = Math.floor(place / HUNG.cols);
  return {
    x: (col - (HUNG.cols - 1) / 2) * HUNG.pitchX,
    y: HUNG.bottom + row * HUNG.pitchY + (rand(i, 5) - 0.5) * 0.25,
    z: 0.3 * Math.sin(col * 1.7 + row),
    yaw: Math.PI / 2,
    roll: (rand(i, 9) - 0.5) * 0.08,
  };
}

export interface RecordPose {
  x: number;
  y: number;
  z: number;
  /** Turn around the vertical axis (applied first). */
  yaw: number;
  /** Turn around the axis toward the camera (applied second): a lean in the crate, the key's angle in the wheel. */
  roll: number;
  /** The box's size: a sleeve at first, the wheel's cell at the end (x is the sleeve's thickness). */
  sx: number;
  sy: number;
  sz: number;
}

/** Record i at scroll progress p, with the wheel turned by `spin`. */
export function recordPose(i: number, progress: number, spin = 0): RecordPose {
  const p = clamp01(progress);
  const from = restSpot(i);
  const mid = hungSpot(i);
  const slot = wheelSlot(i, spin);

  const l = smooth(staggered(p, PHASES.lift, liftOrder(i)));
  const flyT = staggered(p, PHASES.fly, arrivalOrder(i));
  const f = smooth(flyT);

  const lifted = {
    x: lerp(from.x, mid.x, l),
    // a hop up out of the crate on the way
    y: lerp(from.y, mid.y, l) + Math.sin(Math.PI * l) * 1.6,
    z: lerp(from.z, mid.z, l),
    yaw: lerp(from.yaw, mid.yaw, l),
    roll: lerp(from.roll, mid.roll, l),
  };
  const targetRoll = lifted.roll + wrapPi(-slot.angle - lifted.roll);
  const shape = smooth(clamp01((flyT - 0.45) / 0.55));
  const hungY = lerp(SLEEVE.size, HUNG.height, l);
  const hungZ = lerp(SLEEVE.size, HUNG.width, l);
  return {
    x: lerp(lifted.x, slot.x, f),
    // an arc up and over on the way back into the wheel
    y: lerp(lifted.y, slot.y, f) + Math.sin(Math.PI * f) * 2.6,
    z: lerp(lifted.z, slot.z, f),
    yaw: lerp(lifted.yaw, Math.PI / 2, f),
    roll: lerp(lifted.roll, targetRoll, f),
    sx: lerp(SLEEVE.thick, WHEEL.depth, shape),
    sy: lerp(hungY, WHEEL.radial, shape),
    sz: lerp(hungZ, slot.width, shape),
  };
}

/** The label hold: the camera is still, every sleeve has stopped and every key is on show at full size. */
export const LABEL_HOLD = [0.38, PHASES.tag[1]] as const;

/**
 * How much of record i's hanging tag shows, 0 to 1: it pops in as the record settles into the hang (between the
 * start of the tagging and the start of the hold, so that the whole hold shows every key at one fixed size) and
 * goes as the record flies off.
 */
export function labelAmount(i: number, progress: number): number {
  const p = clamp01(progress);
  const appear = staggered(p, [PHASES.tag[0], LABEL_HOLD[0]], liftOrder(i));
  // the tag is gone before the record has turned far
  const leaving = smooth(clamp01((staggered(p, PHASES.fly, arrivalOrder(i)) - 0.15) / 0.3));
  return Math.max(0, Math.min(smooth(appear), 1 - leaving));
}

/** How lit record i's cell is, 0 to 1. It lights as the record lands and stays lit. */
export function litAmount(i: number, progress: number): number {
  const p = clamp01(progress);
  const half = (PHASES.fly[1] - PHASES.fly[0]) / 2;
  const arrival = PHASES.fly[0] + arrivalOrder(i) * half + half;
  return smooth(clamp01((p - (arrival - 0.04)) / 0.05));
}

/** How much the light running round the lit wheel lifts cell i, 0 to 1 (one lap through the finale). */
export function chaseAmount(i: number, progress: number): number {
  const s = span(clamp01(progress), [PHASES.finale[0], PHASES.finale[1] - 0.02]) * (RECORD_COUNT + 3) - 2;
  return Math.max(0, 1 - Math.abs(s - arrivalOrder(i) * (RECORD_COUNT - 1)) / 1.5);
}

/** How far below the floor the crate has sunk. */
export function crateDrop(progress: number): number {
  return smooth(span(clamp01(progress), [0.6, 0.78])) * 4.6;
}

/** 1 in the hero, 0 once the story has begun: how much the picture leans aside for the headline, and how much it moves on its own. */
export function heroAmount(progress: number): number {
  return 1 - smooth(span(clamp01(progress), [0.04, 0.2]));
}

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

type V3 = [number, number, number];
interface Key {
  p: number;
  position: V3;
  target: V3;
}

/**
 * The camera's flight, as keys along the scroll. Between keys it moves on a smooth curve through them
 * (a Hermite spline with Catmull-Rom tangents), so it never stops at a key in passing; it stops only at
 * the ends and through the label hold, where the two keys are the same and their tangents zero.
 */
const KEYS_CAMERA: readonly Key[] = [
  { p: 0, position: [12, 7.6, 25], target: [0, 6, -3.5] }, // the hero: the crate in front, the empty wheel looming behind
  { p: PHASES.hero[1], position: [8, 4.6, 12], target: [0, 3.6, -1] }, // pushing in
  { p: 0.24, position: [3.4, 4.8, 6.4], target: [-0.6, 4, -3] }, // the dive: over the rim, the records rising past the lens
  { p: 0.31, position: [0.6, 6.4, 10.5], target: [0, 6.8, -1] }, // pulling back under the rising records
  { p: LABEL_HOLD[0], position: [0, 7.4, 22], target: [0, 7, 0] }, // the tags, held
  { p: LABEL_HOLD[1], position: [0, 7.4, 22], target: [0, 7, 0] },
  { p: 0.68, position: [-12.5, 10.5, 12], target: [0, 7.2, -6] }, // swinging round as the records stream into the wheel
  { p: PHASES.fly[1], position: [7, 9.4, 10.5], target: [0, 7.6, -9.4] },
  { p: 1, position: [0, 7.6, 12.5], target: [0, 7.6, -10] }, // square to the lit wheel
];

/** Keys with a zero tangent: the ends, and both ends of the label hold. */
const STILL_KEYS = new Set([0, 4, 5, KEYS_CAMERA.length - 1]);

function tangent(k: number, which: "position" | "target"): V3 {
  if (STILL_KEYS.has(k)) return [0, 0, 0];
  const a = KEYS_CAMERA[k - 1]!;
  const b = KEYS_CAMERA[k + 1]!;
  const dp = b.p - a.p;
  return [0, 1, 2].map((n) => (b[which][n]! - a[which][n]!) / dp) as V3;
}

function hermite(k: number, u: number, dp: number, which: "position" | "target"): V3 {
  const a = KEYS_CAMERA[k]!;
  const b = KEYS_CAMERA[k + 1]!;
  const ta = tangent(k, which);
  const tb = tangent(k + 1, which);
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return [0, 1, 2].map((n) => h00 * a[which][n]! + h10 * dp * ta[n]! + h01 * b[which][n]! + h11 * dp * tb[n]!) as V3;
}

/** The camera at progress p (before the hero's lean and the drift over time, which create() adds). */
export function cameraPose(progress: number): CameraPose {
  const p = clamp01(progress);
  let k = 0;
  while (k < KEYS_CAMERA.length - 2 && p > KEYS_CAMERA[k + 1]!.p) k++;
  const a = KEYS_CAMERA[k]!;
  const b = KEYS_CAMERA[k + 1]!;
  if (p <= a.p) return { position: [...a.position], target: [...a.target] };
  if (p >= b.p) return { position: [...b.position], target: [...b.target] };
  if (STILL_KEYS.has(k) && STILL_KEYS.has(k + 1) && a.position.every((v, n) => v === b.position[n]) && a.target.every((v, n) => v === b.target[n])) {
    return { position: [...a.position], target: [...a.target] }; // the hold
  }
  const dp = b.p - a.p;
  const u = (p - a.p) / dp;
  return { position: hermite(k, u, dp, "position"), target: hermite(k, u, dp, "target") };
}

/**
 * The camera's vertical field of view for a screen of this shape. A wide screen keeps 32 degrees; an
 * upright phone widens it so the tags' grid and the wheel still fit across.
 */
export function fovFor(aspect: number): number {
  if (aspect >= 1.3) return 32;
  return 32 + (Math.min(1.3, 1.3 - aspect) / (1.3 - 0.46)) * 34;
}

/**
 * Where the hero leans the picture so the headline has room: on a wide screen the crate and the wheel sit
 * right of the middle (the headline is on the left); on an upright phone they sit low (the headline is on
 * top). In normalized screen units (2 is the whole width or height).
 */
export function heroLean(aspect: number): { x: number; y: number } {
  if (aspect >= 1.3) return { x: 0.36, y: 0.02 };
  if (aspect >= 0.9) return { x: 0.22, y: -0.18 };
  return { x: -0.1, y: -0.4 };
}

// ---- the Three.js side ----

// palette slots (see PALETTE_TOKENS in ../palette)
const SLOT = { app: 0, panel: 1, panelAlt: 2, borderMuted: 3, highlight: 4, light: 5, muted: 6, text: 7, primary: 8, primaryHover: 9, pressed: 10, secondary: 11, success: 12, warning: 13, danger: 14, info: 15 } as const;
const SLEEVE_SLOTS = [SLOT.danger, SLOT.warning, SLOT.info, SLOT.success, SLOT.secondary, SLOT.muted] as const;
const WHEEL_SLOTS = [SLOT.primary, SLOT.success, SLOT.warning, SLOT.danger, SLOT.primaryHover, SLOT.info] as const;
const DUST_SLOTS = [SLOT.highlight, SLOT.light, SLOT.primary, SLOT.muted] as const;
const DUST_COUNT = 90;
const DUST_BOX = { x: 15, y: 17, zMin: -16, zMax: 9 } as const;

/**
 * One tag texel, in world units. A tag shows the key only ("8A"); tempo and genre are in the step's text.
 * At the tags' camera (22 units away) a texel is about four scene pixels on a wide screen and about two on
 * an upright phone, whose wider view shows the middle three or four columns (opening.test.ts projects it).
 */
export const TAG = { texel: 0.27 } as const;
/** The key printed on a lit cell of the wheel: smaller, so "12B" fits the inner ring. */
export const CELL_TAG = { texel: 0.14 } as const;
const toColor = (c: readonly [number, number, number]): Color => new Color(c[0], c[1], c[2]);
const rgb255 = (c: readonly [number, number, number]): [number, number, number] => [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)];

interface Tag {
  mask: LabelMask;
  width: number;
  height: number;
  texture: DataTexture;
  material: MeshBasicMaterial;
  mesh: Mesh;
}

/** The tag's size in texels: the key's letters and nothing around them. */
export function tagTexels(i: number): { width: number; height: number } {
  const { width, height } = layoutLabel([KEYS[i]!]);
  return { width, height };
}

function makeTag(i: number, geometry: PlaneGeometry, texel: number, cutout: boolean): Tag {
  const mask = layoutLabel([KEYS[i]!]);
  const { width, height } = mask;
  const texture = new DataTexture(new Uint8Array(width * height * 4), width, height, RGBAFormat, UnsignedByteType);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  // a cell's key is ink alone, cut out of the lit cell; a sleeve's tag is a plate with the key on it
  const material = cutout ? new MeshBasicMaterial({ map: texture, alphaTest: 0.5 }) : new MeshBasicMaterial({ map: texture });
  const mesh = new Mesh(geometry, material);
  mesh.scale.set(width * texel, height * texel, 1);
  mesh.visible = false;
  return { mask, width, height, texture, material, mesh };
}

function paintTag(tag: Tag, ink: [number, number, number], plate: [number, number, number] | null): void {
  const data = tag.texture.image.data as Uint8Array;
  for (let y = 0; y < tag.height; y++) {
    for (let x = 0; x < tag.width; x++) {
      // texture rows run bottom to top
      const o = ((tag.height - 1 - y) * tag.width + x) * 4;
      const on = tag.mask.mask[y * tag.width + x];
      const c = on ? ink : (plate ?? ink);
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = on || plate ? 255 : 0;
    }
  }
  tag.texture.needsUpdate = true;
}

export function create(): SceneInstance {
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 16 / 9, 0.5, 140);

  scene.add(new AmbientLight(0xffffff, 0.58 * Math.PI));
  const sun = new DirectionalLight(0xffffff, 0.66 * Math.PI);
  sun.position.set(9, 18, 10);
  sun.target.position.set(0, 2, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 60;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  // the wheel's own light: it grows as the keys light, and throws their glow on the floor
  const glow = new PointLight(0xffffff, 0, 26, 1.2);
  glow.position.set(WHEEL.center[0], WHEEL.center[1] - 2, WHEEL.center[2] + 4);
  scene.add(glow);

  const box = new BoxGeometry(1, 1, 1);
  const floorMaterial = new MeshLambertMaterial();
  const floorGeometry = new PlaneGeometry(90, 90);
  const floor = new Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // the crate: a floor and three planks high on each side
  const crate = new Group();
  const plankDefs: { x: number; y: number; z: number; sx: number; sy: number; sz: number; alt: boolean }[] = [];
  const innerH = CRATE.height - CRATE.floor;
  const plankH = innerH / 3;
  plankDefs.push({ x: 0, y: CRATE.floor / 2, z: 0, sx: CRATE.halfWidth * 2, sy: CRATE.floor, sz: CRATE.halfDepth * 2, alt: false });
  for (let k = 0; k < 3; k++) {
    const y = CRATE.floor + plankH * (k + 0.5);
    for (const side of [-1, 1]) {
      plankDefs.push({ x: 0, y, z: side * (CRATE.halfDepth - CRATE.wall / 2), sx: CRATE.halfWidth * 2, sy: plankH - 0.04, sz: CRATE.wall, alt: k % 2 === 0 });
      plankDefs.push({ x: side * (CRATE.halfWidth - CRATE.wall / 2), y, z: 0, sx: CRATE.wall, sy: plankH - 0.04, sz: CRATE.halfDepth * 2 - CRATE.wall * 2, alt: k % 2 === 1 });
    }
  }
  const crateMaterial = new MeshLambertMaterial();
  const planks = new InstancedMesh(box, crateMaterial, plankDefs.length);
  planks.name = "crate";
  planks.castShadow = true;
  planks.receiveShadow = true;
  planks.frustumCulled = false;
  crate.add(planks);
  scene.add(crate);

  // the empty wheel: a dark socket for every key, a hub and a rim of studs, all turning together
  const socketMaterial = new MeshLambertMaterial();
  const sockets = new InstancedMesh(box, socketMaterial, RECORD_COUNT);
  sockets.name = "sockets";
  sockets.castShadow = true;
  sockets.receiveShadow = true;
  sockets.frustumCulled = false;
  for (let i = 0; i < RECORD_COUNT; i++) sockets.setColorAt(i, new Color(0xffffff));
  scene.add(sockets);
  const hubGeometry = new CylinderGeometry(2, 2, 0.8, 12);
  const hubMaterial = new MeshLambertMaterial();
  const hub = new Mesh(hubGeometry, hubMaterial);
  hub.rotation.x = Math.PI / 2;
  hub.position.set(WHEEL.center[0], WHEEL.center[1], WHEEL.center[2] - SOCKET_BACK);
  hub.castShadow = true;
  scene.add(hub);
  const STUDS = 48;
  const studMaterial = new MeshLambertMaterial();
  const studs = new InstancedMesh(box, studMaterial, STUDS);
  studs.castShadow = true;
  studs.frustumCulled = false;
  scene.add(studs);

  // the records
  const recordMaterial = new MeshLambertMaterial();
  const records = new InstancedMesh(box, recordMaterial, RECORD_COUNT);
  records.name = "records";
  records.castShadow = true;
  records.receiveShadow = true;
  records.frustumCulled = false;
  for (let i = 0; i < RECORD_COUNT; i++) records.setColorAt(i, new Color(0xffffff)); // allocate instanceColor up front
  scene.add(records);

  // dust in the light: tiny voxels drifting up through the whole scene
  const dustMaterial = new MeshBasicMaterial();
  const dust = new InstancedMesh(box, dustMaterial, DUST_COUNT);
  dust.frustumCulled = false;
  for (let i = 0; i < DUST_COUNT; i++) dust.setColorAt(i, new Color(0xffffff));
  scene.add(dust);

  const tagGeometry = new PlaneGeometry(1, 1);
  const tags = Array.from({ length: RECORD_COUNT }, (_, i) => makeTag(i, tagGeometry, TAG.texel, false));
  const cellTags = Array.from({ length: RECORD_COUNT }, (_, i) => makeTag(i, tagGeometry, CELL_TAG.texel, true));
  for (const tag of [...tags, ...cellTags]) scene.add(tag.mesh);

  let palette: PaletteUniforms | undefined;
  let progress = REST_PROGRESS;
  let level = 0;
  let time = 0;
  let aspect = 16 / 9;
  const dummy = new Object3D();
  const euler = new Euler(0, 0, 0, "ZYX");
  const tint = new Color();
  const plankA = new Color();
  const plankB = new Color();
  const socketColor = new Color();
  const socketLit = new Color();
  const white = new Color(1, 1, 1);
  const sleeveColors = Array.from({ length: RECORD_COUNT }, () => new Color());
  const keyColors = Array.from({ length: RECORD_COUNT }, () => new Color());

  function applyPalette(): void {
    if (!palette) return;
    scene.background = toColor(palette.background);
    floorMaterial.color.copy(toColor(palette.colors[SLOT.panel]!));
    plankA.copy(toColor(palette.colors[SLOT.panelAlt]!));
    plankB.copy(toColor(palette.colors[SLOT.highlight]!));
    socketColor.copy(toColor(palette.colors[SLOT.panelAlt]!));
    socketLit.copy(toColor(palette.colors[SLOT.pressed]!));
    hubMaterial.color.copy(toColor(palette.colors[SLOT.panel]!));
    studMaterial.color.copy(toColor(palette.colors[SLOT.borderMuted]!));
    glow.color.copy(toColor(palette.colors[SLOT.primary]!));
    plankDefs.forEach((d, k) => {
      dummy.position.set(d.x, d.y, d.z);
      dummy.scale.set(d.sx, d.sy, d.sz);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      planks.setMatrixAt(k, dummy.matrix);
      planks.setColorAt(k, d.alt ? plankB : plankA);
    });
    planks.instanceMatrix.needsUpdate = true;
    if (planks.instanceColor) planks.instanceColor.needsUpdate = true;
    for (let i = 0; i < RECORD_COUNT; i++) {
      // blank sleeves in colors that do not go together; the wheel's colors go by the key's number
      sleeveColors[i]!.copy(toColor(palette.colors[SLEEVE_SLOTS[Math.floor(rand(i, 8) * SLEEVE_SLOTS.length)]!]!));
      keyColors[i]!.copy(toColor(palette.colors[WHEEL_SLOTS[(Math.floor(i / 2) + (i % 2) * 3) % WHEEL_SLOTS.length]!]!));
    }
    for (let i = 0; i < DUST_COUNT; i++) dust.setColorAt(i, toColor(palette.colors[DUST_SLOTS[i % DUST_SLOTS.length]!]!));
    if (dust.instanceColor) dust.instanceColor.needsUpdate = true;
    const plate = rgb255(palette.colors[SLOT.panel]!);
    const ink = rgb255(palette.colors[SLOT.text]!);
    for (const tag of tags) paintTag(tag, ink, plate);
    for (const tag of cellTags) paintTag(tag, rgb255(palette.outline), null);
  }

  /** The wheel's turn: slow and endless in the hero, gone (back to 12 at the top) before a record lands. */
  function spinAt(): number {
    const keep = 1 - smooth(span(progress, [0.4, PHASES.fly[0]]));
    // the empty wheel looks the same every 30 degrees, so the turn wraps there without a jump
    return ((time * 0.11) % (Math.PI / 6)) * keep;
  }

  function layout(): void {
    const hero = heroAmount(progress);
    const spin = spinAt();
    let litSum = 0;
    for (let i = 0; i < RECORD_COUNT; i++) {
      const r = recordPose(i, progress, spin);
      const lit = litAmount(i, progress);
      litSum += lit;
      // the light running round the wheel: in the finale's scroll, and on its own once the scroll rests there
      const lap = (time * 3.2) % (RECORD_COUNT + 6);
      const idleChase = Math.min(1, time) * smooth(span(progress, [PHASES.finale[0] + 0.06, PHASES.finale[1]])) * Math.max(0, 1 - Math.abs(lap - arrivalOrder(i) * (RECORD_COUNT - 1)) / 1.5);
      const pop = Math.max(chaseAmount(i, progress), idleChase) * lit;
      // breathing in the crate, while the page is still
      const breathe = hero * 0.08 * Math.sin(time * 1.4 + i * 0.9);
      // the music moves the wheel: each box swells a little, each at its own time
      const swell = 1 + level * 0.28 * (0.5 + 0.5 * Math.sin(i * 2.3));
      dummy.position.set(r.x, r.y + breathe, r.z + pop * 0.7);
      dummy.scale.set(r.sx * (1 + pop * 0.6), r.sy * (lit > 0.5 ? swell : 1) * (1 + pop * 0.15), r.sz * (1 + pop * 0.15));
      euler.set(0, r.yaw, r.roll + hero * 0.04 * Math.sin(time * 1.1 + i * 1.7), "ZYX");
      dummy.rotation.copy(euler);
      dummy.updateMatrix();
      records.setMatrixAt(i, dummy.matrix);
      records.setColorAt(i, tint.copy(sleeveColors[i]!).lerp(keyColors[i]!, lit).lerp(white, pop * 0.35));

      // the socket behind it
      const slot = wheelSlot(i, spin);
      dummy.position.set(slot.x, slot.y, slot.z - SOCKET_BACK);
      dummy.scale.set(0.5, WHEEL.radial * 0.9, slot.width * 0.94);
      euler.set(0, Math.PI / 2, -slot.angle, "ZYX");
      dummy.rotation.copy(euler);
      dummy.updateMatrix();
      sockets.setMatrixAt(i, dummy.matrix);
      sockets.setColorAt(i, tint.copy(socketColor).lerp(socketLit, lit));

      const tag = tags[i]!;
      const a = labelAmount(i, progress);
      tag.mesh.visible = a > 0.01;
      if (tag.mesh.visible) {
        // a sticker on the sleeve's face; always whole texels at one size, so its letters stay whole
        tag.mesh.position.set(r.x, r.y + 0.1, r.z + SLEEVE.thick / 2 + 0.06);
        tag.mesh.scale.set(tag.width * TAG.texel, tag.height * TAG.texel, 1);
      }
      const cell = cellTags[i]!;
      cell.mesh.visible = lit > 0.6;
      if (cell.mesh.visible) cell.mesh.position.set(slot.x, slot.y, slot.z + (WHEEL.depth * (1 + pop * 0.6)) / 2 + pop * 0.7 + 0.03);
    }
    records.instanceMatrix.needsUpdate = true;
    if (records.instanceColor) records.instanceColor.needsUpdate = true;
    sockets.instanceMatrix.needsUpdate = true;
    if (sockets.instanceColor) sockets.instanceColor.needsUpdate = true;
    hub.rotation.y = spin;
    for (let k = 0; k < STUDS; k++) {
      const angle = (k / STUDS) * Math.PI * 2 + spin;
      const radius = WHEEL.outerRadius + WHEEL.radial / 2 + 0.55;
      dummy.position.set(WHEEL.center[0] + radius * Math.sin(angle), WHEEL.center[1] + radius * Math.cos(angle), WHEEL.center[2] - SOCKET_BACK);
      dummy.scale.set(0.34, 0.34, 0.5);
      dummy.rotation.set(0, 0, -angle);
      dummy.updateMatrix();
      studs.setMatrixAt(k, dummy.matrix);
    }
    studs.instanceMatrix.needsUpdate = true;
    glow.intensity = (litSum / RECORD_COUNT) * 22;

    for (let i = 0; i < DUST_COUNT; i++) {
      const rise = (rand(i, 21) * DUST_BOX.y + time * (0.25 + rand(i, 22) * 0.35)) % DUST_BOX.y;
      dummy.position.set(
        (rand(i, 23) * 2 - 1) * DUST_BOX.x + Math.sin(time * 0.3 + i) * 0.4,
        rise,
        lerp(DUST_BOX.zMin, DUST_BOX.zMax, rand(i, 24)),
      );
      const s = 0.08 + rand(i, 25) * 0.1;
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      dust.setMatrixAt(i, dummy.matrix);
    }
    dust.instanceMatrix.needsUpdate = true;

    crate.position.y = -crateDrop(progress);

    const cam = cameraPose(progress);
    // a slow handheld drift: in the hero, and a little at the end; never while the tags hold
    const drift = hero + smooth(span(progress, [PHASES.finale[0], 1])) * 0.4;
    camera.position.set(cam.position[0] + Math.sin(time * 0.21) * 1.4 * drift, cam.position[1] + Math.sin(time * 0.33) * 0.35 * drift, cam.position[2] + Math.cos(time * 0.17) * 0.8 * drift);
    camera.lookAt(...cam.target);
    camera.updateProjectionMatrix();
    // the hero leans the picture aside for the headline (a lens shift: the perspective stays true)
    const lean = heroLean(aspect);
    camera.projectionMatrix.elements[8] = -lean.x * hero;
    camera.projectionMatrix.elements[9] = -lean.y * hero;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
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
    resize(a) {
      aspect = a;
      camera.aspect = a;
      camera.fov = fovFor(a);
      layout();
    },
    dispose() {
      box.dispose();
      floorGeometry.dispose();
      tagGeometry.dispose();
      hubGeometry.dispose();
      for (const m of [floorMaterial, crateMaterial, recordMaterial, socketMaterial, hubMaterial, studMaterial, dustMaterial]) m.dispose();
      for (const mesh of [planks, records, sockets, studs, dust]) mesh.dispose();
      for (const tag of [...tags, ...cellTags]) {
        tag.texture.dispose();
        tag.material.dispose();
      }
      sun.shadow.map?.dispose();
    },
  };
}
