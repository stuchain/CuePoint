import {
  AmbientLight,
  BoxGeometry,
  Color,
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
  RGBAFormat,
  Scene,
  UnsignedByteType,
} from "three";
import type { PaletteUniforms } from "./palette";
import { PHASES } from "./phases";
import { layoutLabel, type LabelMask } from "./pixel-font";
import type { SceneInstance } from "./types";

/**
 * The home page's opening scene (SITE-06, DEC-189): the crate becomes the wheel.
 *
 * A voxel crate holds 24 records with blank sleeves, leaning every which way. As the visitor scrolls the
 * records lift out and spread into two rows, take their key, tempo and genre as pixel tags, then fly into
 * a Camelot wheel lying on the floor, lighting up as each one lands. The wheel stands up to face the
 * visitor, where the page puts the app's own window.
 *
 * The whole story is a pure function of the scroll progress (0 to 1). Everything between `recordPose`
 * and the camera is plain numbers, so opening.test.ts checks the story without WebGL; `create()` only
 * turns those numbers into instanced boxes. The scene sits at rest on the crate (progress 0), which is
 * also what the page shows at the top of the scroll.
 */

export const REST_PROGRESS = 0;

export const RECORD_COUNT = 24;
/** Camelot keys, 1A to 12B. Record i carries KEYS[i]. */
export const KEYS: readonly string[] = Array.from({ length: RECORD_COUNT }, (_, i) => `${Math.floor(i / 2) + 1}${i % 2 === 0 ? "A" : "B"}`);

export { PHASES };

/** The crate, in world units. `height` is the top of its walls. */
export const CRATE = { halfWidth: 4.2, halfDepth: 1.9, height: 2.2, floor: 0.3, wall: 0.3 } as const;
/** The wheel: B (major) outside, A (minor) inside. Radii are to the middle of a ring of cells. */
export const WHEEL = { innerRadius: 3.2, outerRadius: 5, cell: 0.7, radial: 1.5, standHeight: 6.6 } as const;

const SLEEVE = { thick: 0.28, size: 3 } as const;
/** While the tags show, the sleeves hang smaller, in a grid, so no tag is hidden. */
const HUNG = { width: 3.2, height: 2.2, cols: 6, pitchX: 3.5, pitchY: 2.6, bottom: 3.4 } as const;
const PITCH = 0.3; // between records in the crate

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
  z: number;
  /** Clockwise from the top, in radians. */
  angle: number;
  ring: "A" | "B";
  /** 0 to 11 (Camelot number minus one). */
  index: number;
  radius: number;
  /** The cell's width along the ring. */
  width: number;
}

/** Where record i sits in the wheel (in the wheel's own flat frame: the top of the wheel is toward -z). */
export function wheelSlot(i: number): WheelSlot {
  const number = Math.floor(i / 2) + 1;
  const ring = i % 2 === 0 ? "A" : "B";
  const radius = ring === "B" ? WHEEL.outerRadius : WHEEL.innerRadius;
  const angle = ((number - 12) * Math.PI) / 6;
  return {
    x: radius * Math.sin(angle),
    z: -radius * Math.cos(angle),
    angle,
    ring,
    index: number - 1,
    radius,
    width: ((2 * Math.PI * radius) / 12) * 0.86,
  };
}

/** The order the wheel fills in: around the clock, both rings together. */
const arrivalOrder = (i: number): number => (wheelSlot(i).index * 2 + (wheelSlot(i).ring === "A" ? 1 : 0)) / (RECORD_COUNT - 1);
const liftOrder = (i: number): number => i / (RECORD_COUNT - 1);

interface Spot {
  x: number;
  y: number;
  z: number;
  yaw: number;
  tilt: number;
}

function restSpot(i: number): Spot {
  return {
    x: (i - (RECORD_COUNT - 1) / 2) * PITCH,
    // some sleeves sit higher than others, as in a crate nobody has tidied
    y: CRATE.floor + SLEEVE.size / 2 + rand(i, 1) * 0.35,
    z: (rand(i, 2) - 0.5) * 0.24,
    yaw: (rand(i, 3) - 0.5) * 0.06,
    tilt: (rand(i, 4) - 0.5) * 0.36,
  };
}

/** Where the records hang while their tags show: a grid of six by four, in a shuffled order. */
function floatSpot(i: number): Spot {
  const place = (i * 7 + 3) % RECORD_COUNT; // 7 and 24 share no factor: every place is used once
  const col = place % HUNG.cols;
  const row = Math.floor(place / HUNG.cols);
  return {
    x: (col - (HUNG.cols - 1) / 2) * HUNG.pitchX,
    y: HUNG.bottom + row * HUNG.pitchY + (rand(i, 5) - 0.5) * 0.25,
    z: 0.3 * Math.sin(col * 1.7 + row),
    yaw: Math.PI / 2,
    tilt: (rand(i, 9) - 0.5) * 0.08,
  };
}

export interface RecordPose {
  x: number;
  y: number;
  z: number;
  /** Turn around the vertical axis. */
  yaw: number;
  /** Lean, around the front-to-back axis. */
  tilt: number;
  /** The box's size: a sleeve at first, the wheel's cell at the end. */
  sx: number;
  sy: number;
  sz: number;
}

/** Record i at scroll progress p, in the wheel's frame (the same as the world until the wheel stands up). */
export function recordPose(i: number, progress: number): RecordPose {
  const p = clamp01(progress);
  const from = restSpot(i);
  const mid = floatSpot(i);
  const slot = wheelSlot(i);

  const l = smooth(staggered(p, PHASES.lift, liftOrder(i)));
  const flyT = staggered(p, PHASES.fly, arrivalOrder(i));
  const f = smooth(flyT);

  const lifted = {
    x: lerp(from.x, mid.x, l),
    y: lerp(from.y, mid.y, l) + Math.sin(Math.PI * l) * 1.4,
    z: lerp(from.z, mid.z, l),
    yaw: lerp(from.yaw, mid.yaw, l),
    tilt: lerp(from.tilt, mid.tilt, l),
  };
  const targetYaw = mid.yaw + wrapPi(-slot.angle - mid.yaw);
  const shape = smooth(clamp01((flyT - 0.45) / 0.55));
  const hungY = lerp(SLEEVE.size, HUNG.height, l);
  const hungZ = lerp(SLEEVE.size, HUNG.width, l);
  return {
    x: lerp(lifted.x, slot.x, f),
    y: lerp(lifted.y, WHEEL.cell / 2, f) + Math.sin(Math.PI * f) * 2.2,
    z: lerp(lifted.z, slot.z, f),
    yaw: lerp(lifted.yaw, targetYaw, f),
    tilt: lerp(lifted.tilt, 0, f),
    sx: lerp(SLEEVE.thick, slot.width, shape),
    sy: lerp(hungY, WHEEL.cell, shape),
    sz: lerp(hungZ, WHEEL.radial, shape),
  };
}

/** The label hold: the camera is still, every sleeve has stopped and every key is on show at full size. */
export const LABEL_HOLD = [0.34, PHASES.tag[1]] as const;

/**
 * How much of record i's tag shows, 0 to 1: it pops in as the record settles into the hang (between the start of
 * the tagging and the start of the hold, so that the whole hold shows every key at one fixed size) and goes as the
 * record flies off.
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
  return smooth(clamp01((p - (arrival - 0.02)) / 0.05));
}

/** The wheel's tip from lying flat (0) to standing facing the visitor (a quarter turn). */
export function wheelTilt(progress: number): number {
  return smooth(span(clamp01(progress), PHASES.flat)) * (Math.PI / 2);
}

/** How far the wheel is raised so that, standing, it clears the floor. */
export function wheelLift(progress: number): number {
  return smooth(span(clamp01(progress), PHASES.flat)) * WHEEL.standHeight;
}

/** How far below the floor the crate has sunk. */
export function crateDrop(progress: number): number {
  return smooth(span(clamp01(progress), [0.52, 0.72])) * 4.6;
}

interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

const SHOTS: Record<"crate" | "tags" | "wheel" | "stand", CameraPose> = {
  crate: { position: [6.2, 6, 12], target: [0, 1.6, 0] },
  tags: { position: [0, 7.4, 22], target: [0, 7, 0] },
  wheel: { position: [0, 17.5, 12.5], target: [0, 0, 0.4] },
  stand: { position: [0, 6.6, 22.5], target: [0, 6.6, 0] },
};

const mix = (a: CameraPose, b: CameraPose, t: number): CameraPose => ({
  position: a.position.map((v, k) => lerp(v, b.position[k]!, t)) as CameraPose["position"],
  target: a.target.map((v, k) => lerp(v, b.target[k]!, t)) as CameraPose["target"],
});

/** The camera at progress p: it starts close on the crate, pulls back for the tags, looks down on the wheel, then squares up to it. */
export function cameraPose(progress: number): CameraPose {
  const p = clamp01(progress);
  if (p <= PHASES.lift[1]) return mix(SHOTS.crate, SHOTS.tags, smooth(span(p, [0.06, PHASES.lift[1]])));
  if (p <= PHASES.fly[1]) return mix(SHOTS.tags, SHOTS.wheel, smooth(span(p, [PHASES.tag[1], PHASES.fly[1]])));
  return mix(SHOTS.wheel, SHOTS.stand, smooth(span(p, PHASES.flat)));
}

// ---- the Three.js side ----

// palette slots (see PALETTE_TOKENS in ../palette)
const SLOT = { panel: 1, panelAlt: 2, highlight: 4, muted: 6, text: 7, primary: 8, primaryHover: 9, secondary: 11, success: 12, warning: 13, danger: 14, info: 15 } as const;
const SLEEVE_SLOTS = [SLOT.danger, SLOT.warning, SLOT.info, SLOT.success, SLOT.secondary, SLOT.muted] as const;
const WHEEL_SLOTS = [SLOT.primary, SLOT.success, SLOT.warning, SLOT.danger, SLOT.primaryHover, SLOT.info] as const;

/**
 * One tag texel, in world units. A tag shows the key only ("8A"), because a texel that covers less than one
 * scene pixel cannot be read: at the tags' camera (cameraPose: 22 units away, 32 degrees of view) a scene
 * pixel is about 0.26 units on a phone's stage (343 px wide) and 0.13 on a desktop's (about 700), so a texel
 * of 0.26 covers one scene pixel on a phone and two on a desktop, both close to whole numbers, so a letter's
 * stems stay one even width (opening.test.ts projects it). Tempo and genre are in the step's text.
 *
 * Two scene pixels per texel on a phone would need 24 keys of up to 11 texels in a stage 86 pixels wide and
 * 48 tall: the keys alone would cover over nine tenths of it. The tags therefore keep a whole pixel there.
 */
export const TAG = { texel: 0.26 } as const;
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

function makeTag(i: number, geometry: PlaneGeometry): Tag {
  const mask = layoutLabel([KEYS[i]!]);
  const { width, height } = mask;
  const texture = new DataTexture(new Uint8Array(width * height * 4), width, height, RGBAFormat, UnsignedByteType);
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.generateMipmaps = false;
  const material = new MeshBasicMaterial({ map: texture });
  const mesh = new Mesh(geometry, material);
  mesh.scale.set(width * TAG.texel, height * TAG.texel, 1);
  mesh.visible = false;
  return { mask, width, height, texture, material, mesh };
}

function paintTag(tag: Tag, palette: PaletteUniforms): void {
  const plate = rgb255(palette.colors[SLOT.panel]!);
  const ink = rgb255(palette.colors[SLOT.text]!);
  const data = tag.texture.image.data as Uint8Array;
  for (let y = 0; y < tag.height; y++) {
    for (let x = 0; x < tag.width; x++) {
      // texture rows run bottom to top
      const o = ((tag.height - 1 - y) * tag.width + x) * 4;
      const c = tag.mask.mask[y * tag.width + x] ? ink : plate;
      data[o] = c[0];
      data[o + 1] = c[1];
      data[o + 2] = c[2];
      data[o + 3] = 255;
    }
  }
  tag.texture.needsUpdate = true;
}

export function create(): SceneInstance {
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 16 / 9, 0.5, 120);

  scene.add(new AmbientLight(0xffffff, 0.66 * Math.PI));
  const sun = new DirectionalLight(0xffffff, 0.6 * Math.PI);
  sun.position.set(9, 16, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -15;
  sun.shadow.camera.right = 15;
  sun.shadow.camera.top = 15;
  sun.shadow.camera.bottom = -15;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 50;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const box = new BoxGeometry(1, 1, 1);
  const floorMaterial = new MeshLambertMaterial();
  const floorGeometry = new PlaneGeometry(60, 60);
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

  // the records, in a group that the wheel's tip turns
  const wheel = new Group();
  const recordMaterial = new MeshLambertMaterial();
  const records = new InstancedMesh(box, recordMaterial, RECORD_COUNT);
  records.name = "records";
  records.castShadow = true;
  records.receiveShadow = true;
  records.frustumCulled = false;
  for (let i = 0; i < RECORD_COUNT; i++) records.setColorAt(i, new Color(0xffffff)); // allocate instanceColor up front
  wheel.add(records);
  scene.add(wheel);

  const tagGeometry = new PlaneGeometry(1, 1);
  const tags = Array.from({ length: RECORD_COUNT }, (_, i) => makeTag(i, tagGeometry));
  for (const tag of tags) scene.add(tag.mesh);

  let palette: PaletteUniforms | undefined;
  let progress = REST_PROGRESS;
  let level = 0;
  const dummy = new Object3D();
  const euler = new Euler(0, 0, 0, "YXZ");
  const tint = new Color();
  const plankA = new Color();
  const plankB = new Color();
  const sleeveColors = Array.from({ length: RECORD_COUNT }, () => new Color());
  const keyColors = Array.from({ length: RECORD_COUNT }, () => new Color());

  function applyPalette(): void {
    if (!palette) return;
    scene.background = toColor(palette.background);
    floorMaterial.color.copy(toColor(palette.colors[SLOT.panel]!));
    plankA.copy(toColor(palette.colors[SLOT.panelAlt]!));
    plankB.copy(toColor(palette.colors[SLOT.highlight]!));
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
    for (const tag of tags) paintTag(tag, palette);
  }

  function layout(): void {
    for (let i = 0; i < RECORD_COUNT; i++) {
      const r = recordPose(i, progress);
      // the music moves the wheel: each box swells a little, each at its own time
      const swell = 1 + level * 0.28 * (0.5 + 0.5 * Math.sin(i * 2.3));
      dummy.position.set(r.x, r.y + ((r.sy * (swell - 1)) / 2) * (r.sy < 1 ? 1 : 0), r.z);
      dummy.scale.set(r.sx, r.sy * (r.sy < 1 ? swell : 1), r.sz);
      euler.set(0, r.yaw, r.tilt, "YXZ");
      dummy.rotation.copy(euler);
      dummy.updateMatrix();
      records.setMatrixAt(i, dummy.matrix);
      const lit = litAmount(i, progress);
      records.setColorAt(i, tint.copy(sleeveColors[i]!).lerp(keyColors[i]!, lit));

      const tag = tags[i]!;
      const a = labelAmount(i, progress);
      tag.mesh.visible = a > 0.01;
      if (tag.mesh.visible) {
        // a sticker on the sleeve's face
        tag.mesh.position.set(r.x, r.y + 0.1, r.z + SLEEVE.thick / 2 + 0.06);
        // always whole texels at one size: a tag that grew in would sit between pixels and break its letters
        tag.mesh.scale.set(tag.width * TAG.texel, tag.height * TAG.texel, 1);
      }
    }
    records.instanceMatrix.needsUpdate = true;
    if (records.instanceColor) records.instanceColor.needsUpdate = true;

    wheel.rotation.x = wheelTilt(progress);
    wheel.position.y = wheelLift(progress);
    crate.position.y = -crateDrop(progress);

    const cam = cameraPose(progress);
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
    setShadowSize(size) {
      sun.castShadow = size > 0;
      if (size > 0) sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    },
    resize(aspect) {
      camera.aspect = aspect;
      // keep the crate, the tags and the wheel in frame on a tall phone screen
      camera.fov = aspect < 1.3 ? 32 / Math.max(0.5, aspect / 1.3) : 32;
      camera.updateProjectionMatrix();
    },
    dispose() {
      box.dispose();
      floorGeometry.dispose();
      tagGeometry.dispose();
      floorMaterial.dispose();
      crateMaterial.dispose();
      recordMaterial.dispose();
      planks.dispose();
      records.dispose();
      for (const tag of tags) {
        tag.texture.dispose();
        tag.material.dispose();
      }
      sun.shadow.map?.dispose();
    },
  };
}
