import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
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
 * The Clean section's prop (SITE-06): a voxel turntable with a record spinning on it. It has no story of
 * its own; it is there to be looked at. While its section crosses the screen the camera rises and comes
 * round, and the arm swings onto the record; on its own the record spins and the light on its grooves
 * stays still, so the turn reads.
 *
 * Pure numbers first (tested in props.test.ts), then the Three.js scene.
 */

export const REST_PROGRESS = 0.5;

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));
const smooth = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 33 1/3 turns a minute, slowed for the eye: a turn every 3.6 seconds. */
export const TURN_SECONDS = 3.6;

/** The record's angle, in radians, after `seconds`. */
export const recordAngle = (seconds: number): number => -((seconds / TURN_SECONDS) * Math.PI * 2);

/** The arm's swing onto the record, 0 (at rest, off the record) to 1 (in the groove), by scroll. */
export const armSwing = (progress: number): number => smooth(clamp01((clamp01(progress) - 0.2) / 0.3));

export function cameraAt(progress: number): { position: [number, number, number]; target: [number, number, number] } {
  const p = clamp01(progress);
  const angle = lerp(-0.75, 0.35, smooth(p));
  const radius = 15;
  return {
    position: [Math.sin(angle) * radius, lerp(7, 11.5, p), Math.cos(angle) * radius],
    target: [0.6, 0.4, 0],
  };
}

const SLOT = { app: 0, panel: 1, panelAlt: 2, borderMuted: 3, highlight: 4, light: 5, muted: 6, text: 7, primary: 8, primaryHover: 9, pressed: 10, warning: 13, info: 15 } as const;
const toColor = (c: readonly [number, number, number]): Color => new Color(c[0], c[1], c[2]);

export function create(): SceneInstance {
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 16 / 9, 0.5, 80);
  scene.add(new AmbientLight(0xffffff, 0.6 * Math.PI));
  const sun = new DirectionalLight(0xffffff, 0.7 * Math.PI);
  sun.position.set(-6, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  for (const k of ["left", "bottom"] as const) sun.shadow.camera[k] = -10;
  for (const k of ["right", "top"] as const) sun.shadow.camera[k] = 10;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const box = new BoxGeometry(1, 1, 1);
  const materials = {
    deck: new MeshLambertMaterial(),
    deckEdge: new MeshLambertMaterial(),
    platter: new MeshLambertMaterial(),
    vinyl: new MeshLambertMaterial(),
    groove: new MeshLambertMaterial(),
    labelA: new MeshLambertMaterial(),
    labelB: new MeshLambertMaterial(),
    arm: new MeshLambertMaterial(),
    knob: new MeshLambertMaterial(),
  };

  // the deck: a thick slab with a lighter top
  const deck = new Mesh(box, materials.deck);
  deck.scale.set(13, 1.1, 10);
  deck.position.set(0.6, -0.55, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  scene.add(deck);
  const edge = new Mesh(box, materials.deckEdge);
  edge.scale.set(13.2, 0.4, 10.2);
  edge.position.set(0.6, -1.25, 0);
  scene.add(edge);

  // the platter and the record, faceted like the app's pixel circles
  const platterGeometry = new CylinderGeometry(4.3, 4.3, 0.5, 24);
  const platter = new Mesh(platterGeometry, materials.platter);
  platter.position.set(-0.8, 0.25, 0);
  platter.castShadow = true;
  platter.receiveShadow = true;
  scene.add(platter);

  const spinning = new Group();
  spinning.position.set(-0.8, 0.5, 0);
  scene.add(spinning);
  const discs: { geometry: CylinderGeometry; mesh: Mesh }[] = [];
  const ring = (radius: number, height: number, material: MeshLambertMaterial, y: number) => {
    const geometry = new CylinderGeometry(radius, radius, height, 24);
    const mesh = new Mesh(geometry, material);
    mesh.position.y = y;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    spinning.add(mesh);
    discs.push({ geometry, mesh });
  };
  ring(4, 0.2, materials.vinyl, 0.1);
  ring(3.3, 0.24, materials.groove, 0.1);
  ring(2.75, 0.26, materials.vinyl, 0.1);
  ring(2.15, 0.28, materials.groove, 0.1);
  ring(1.6, 0.3, materials.vinyl, 0.1);
  // the label in two halves, so the turn shows
  const halfGeometry = new CylinderGeometry(1.15, 1.15, 0.34, 12, 1, false, 0, Math.PI);
  const halfA = new Mesh(halfGeometry, materials.labelA);
  const halfB = new Mesh(halfGeometry, materials.labelB);
  halfB.rotation.y = Math.PI;
  for (const h of [halfA, halfB]) {
    h.position.y = 0.12;
    spinning.add(h);
  }
  const spindle = new Mesh(box, materials.knob);
  spindle.scale.set(0.3, 0.7, 0.3);
  spindle.position.y = 0.4;
  spinning.add(spindle);

  // the arm: a pivot block, then a chain of voxels to the head
  const arm = new Group();
  arm.position.set(4.8, 0.3, -3.2);
  scene.add(arm);
  const pivot = new Mesh(box, materials.knob);
  pivot.scale.set(1.2, 1.2, 1.2);
  pivot.position.y = 0.3;
  pivot.castShadow = true;
  arm.add(pivot);
  const ARM_BLOCKS = 9;
  const blocks = new InstancedMesh(box, materials.arm, ARM_BLOCKS);
  blocks.castShadow = true;
  blocks.frustumCulled = false;
  const dummy = new Object3D();
  for (let k = 0; k < ARM_BLOCKS; k++) {
    dummy.position.set(-0.1 - k * 0.55, 0.85, 0.4 + k * 0.42);
    const s = k === ARM_BLOCKS - 1 ? 0.75 : 0.36;
    dummy.scale.set(s, k === ARM_BLOCKS - 1 ? 0.45 : 0.3, s);
    dummy.updateMatrix();
    blocks.setMatrixAt(k, dummy.matrix);
  }
  arm.add(blocks);

  // two knobs on the deck, for scale
  const knobs = new InstancedMesh(box, materials.knob, 2);
  knobs.castShadow = true;
  for (let k = 0; k < 2; k++) {
    dummy.position.set(5.4, 0.2, 2.2 + k * 1.6);
    dummy.scale.set(0.8, 0.4, 0.8);
    dummy.updateMatrix();
    knobs.setMatrixAt(k, dummy.matrix);
  }
  scene.add(knobs);

  let progress = REST_PROGRESS;
  let time = 0;
  let level = 0;
  let palette: PaletteUniforms | undefined;

  function applyPalette(): void {
    if (!palette) return;
    const c = (slot: number) => toColor(palette!.colors[slot]!);
    scene.background = toColor(palette.background);
    materials.deck.color.copy(c(SLOT.panelAlt));
    materials.deckEdge.color.copy(c(SLOT.panel));
    materials.platter.color.copy(c(SLOT.borderMuted));
    materials.vinyl.color.copy(toColor(palette.background));
    materials.groove.color.copy(c(SLOT.panel));
    materials.labelA.color.copy(c(SLOT.primary));
    materials.labelB.color.copy(c(SLOT.warning));
    materials.arm.color.copy(c(SLOT.light));
    materials.knob.color.copy(c(SLOT.highlight));
  }

  function layout(): void {
    spinning.rotation.y = recordAngle(time);
    spinning.scale.y = 1 + level * 0.6;
    // swung out (off the record) to in the groove
    arm.rotation.y = lerp(0.55, 0, armSwing(progress));
    const cam = cameraAt(progress);
    camera.position.set(cam.position[0] + Math.sin(time * 0.25) * 0.4, cam.position[1], cam.position[2]);
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
      platterGeometry.dispose();
      halfGeometry.dispose();
      for (const d of discs) d.geometry.dispose();
      for (const m of Object.values(materials)) m.dispose();
      blocks.dispose();
      knobs.dispose();
      sun.shadow.map?.dispose();
    },
  };
}
