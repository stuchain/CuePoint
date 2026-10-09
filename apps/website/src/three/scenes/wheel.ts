import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Euler,
  InstancedMesh,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
} from "three";
import type { PaletteUniforms } from "../palette";
import type { SceneInstance } from "./types";

/**
 * The Keys section's prop (SITE-06): the Camelot wheel as a voxel landscape. Each of the 24 keys is a
 * cell of the wheel (B outside, A inside, 12 at the top), raised as a column whose height stands for how
 * many tracks a playlist has in that key, the way the Keys page counts them. On its own a light runs round
 * the wheel, lifting each key in turn, as if a DJ were clicking through them; the scroll tips the wheel
 * up toward the visitor.
 *
 * The heights are a made-up playlist (deterministic, so the still never changes): a drawing of the idea,
 * not the app's picture, which is in the screenshot slot beside it.
 */

export const REST_PROGRESS = 0.5;
export const KEY_COUNT = 24;
/** Seconds for the light to go once round the wheel. */
export const LAP_SECONDS = 7;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** A made-up playlist's count in key i (0..23: 1A, 1B, 2A, ...), from 1 to 9. */
export function keyCount(i: number): number {
  const x = Math.sin(i * 4.1 + 1.3) * 0.5 + Math.sin(i * 1.7) * 0.35 + 0.5;
  return Math.max(1, Math.min(9, Math.round(1 + x * 7)));
}

/** Key i's place: B (major) outside, A (minor) inside, clockwise from 12 at the top. */
export function cell(i: number): { angle: number; radius: number; ring: "A" | "B" } {
  const number = Math.floor(i / 2) + 1;
  const ring = i % 2 === 0 ? "A" : "B";
  return { angle: ((number - 12) * Math.PI) / 6, radius: ring === "B" ? 5 : 3.2, ring };
}

/** How far the running light lifts key i at `seconds`, 0 to 1. */
export function lightAmount(i: number, seconds: number): number {
  const number = Math.floor(i / 2); // both rings of a number light together
  const at = ((seconds / LAP_SECONDS) * 12) % 12;
  const d = Math.min(Math.abs(at - number), 12 - Math.abs(at - number));
  return Math.max(0, 1 - d / 1.2);
}

/** The wheel's tip toward the visitor, by scroll: from lying almost flat to leaning up. */
export const wheelTip = (progress: number): number => lerp(-1.0, -0.55, smooth(clamp01(progress)));

const SLOT = { panel: 1, panelAlt: 2, borderMuted: 3, highlight: 4, text: 7, primary: 8, primaryHover: 9, success: 12, warning: 13, danger: 14, info: 15 } as const;
const KEY_SLOTS = [SLOT.primary, SLOT.success, SLOT.warning, SLOT.danger, SLOT.primaryHover, SLOT.info] as const;
const toColor = (c: readonly [number, number, number]): Color => new Color(c[0], c[1], c[2]);
const UNIT = 0.3; // height per track

export function create(): SceneInstance {
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 16 / 9, 0.5, 90);
  camera.position.set(0, 5.8, 21.5);
  camera.lookAt(0, -0.4, 0);
  scene.add(new AmbientLight(0xffffff, 0.62 * Math.PI));
  const sun = new DirectionalLight(0xffffff, 0.7 * Math.PI);
  sun.position.set(-6, 10, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  for (const k of ["left", "bottom"] as const) sun.shadow.camera[k] = -12;
  for (const k of ["right", "top"] as const) sun.shadow.camera[k] = 12;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const box = new BoxGeometry(1, 1, 1);
  // the wheel lies in a plane we tip toward the camera; its "up" is +z of that plane
  const discGeometry = new CylinderGeometry(6.3, 6.3, 0.5, 24);
  const discMaterial = new MeshLambertMaterial();
  const disc = new Mesh(discGeometry, discMaterial);
  disc.receiveShadow = true;
  scene.add(disc);
  const material = new MeshLambertMaterial();
  const keys = new InstancedMesh(box, material, KEY_COUNT);
  keys.castShadow = true;
  keys.receiveShadow = true;
  keys.frustumCulled = false;
  for (let i = 0; i < KEY_COUNT; i++) keys.setColorAt(i, new Color(0xffffff));
  scene.add(keys);

  let progress = REST_PROGRESS;
  let time = 0;
  let level = 0;
  let palette: PaletteUniforms | undefined;
  const colors = Array.from({ length: KEY_COUNT }, () => new Color());
  const white = new Color(1, 1, 1);
  const tint = new Color();
  const dummy = new Object3D();
  const tip = new Euler();
  const parent = new Object3D();

  function applyPalette(): void {
    if (!palette) return;
    scene.background = toColor(palette.background);
    discMaterial.color.copy(toColor(palette.colors[SLOT.panelAlt]!));
    for (let i = 0; i < KEY_COUNT; i++) colors[i]!.copy(toColor(palette.colors[KEY_SLOTS[(Math.floor(i / 2) + (i % 2) * 3) % KEY_SLOTS.length]!]!));
  }

  function layout(): void {
    tip.set(wheelTip(progress), 0, 0);
    parent.rotation.copy(tip);
    parent.rotation.y = 0;
    parent.updateMatrix();
    // the disc: a cylinder's axis is y; the wheel's plane is turned so that its axis leans toward the camera
    disc.rotation.set(tip.x + Math.PI / 2, 0, 0);
    disc.position.set(0, 0, 0);
    const spin = time * 0.05;
    disc.rotation.y = spin;
    for (let i = 0; i < KEY_COUNT; i++) {
      const c = cell(i);
      const light = lightAmount(i, time);
      const h = (keyCount(i) * UNIT + light * 0.9) * (1 + level * 0.4);
      const a = c.angle + spin;
      // in the wheel's own frame: x across, y up the face, z out of the face
      dummy.position.set(c.radius * Math.sin(a), c.radius * Math.cos(a), 0.25 + h / 2);
      dummy.rotation.set(0, 0, -a);
      dummy.scale.set(((2 * Math.PI * c.radius) / 12) * 0.82, 1.45, h);
      dummy.updateMatrix();
      // into the world: tipped back so the face looks up and toward the camera
      dummy.matrix.premultiply(parent.matrix);
      keys.setMatrixAt(i, dummy.matrix);
      keys.setColorAt(i, tint.copy(colors[i]!).lerp(white, light * 0.45));
    }
    keys.instanceMatrix.needsUpdate = true;
    if (keys.instanceColor) keys.instanceColor.needsUpdate = true;
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
      discGeometry.dispose();
      discMaterial.dispose();
      material.dispose();
      keys.dispose();
      sun.shadow.map?.dispose();
    },
  };
}
