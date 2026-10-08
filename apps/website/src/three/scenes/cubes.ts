import {
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
} from "three";
import type { PaletteUniforms } from "../palette";
import { createVoxelField } from "../voxel";
import type { SceneInstance } from "./types";

/**
 * The test scene (SITE-05): a field of voxel columns that rises from the floor as the page scrolls.
 * Rows farther from the middle start rising later, and heights move in half-cube steps so the
 * silhouette stays blocky.
 */

const SIDE = 11;
const COUNT = SIDE * SIDE;
const GAP = 1.45;

export const REST_PROGRESS = 0.55;

const toColor = (c: readonly [number, number, number]) => new Color(c[0], c[1], c[2]);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function create(): SceneInstance {
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 16 / 9, 0.5, 80);

  scene.add(new AmbientLight(0xffffff, 0.62 * Math.PI));
  const sun = new DirectionalLight(0xffffff, 0.62 * Math.PI);
  sun.position.set(7, 14, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.001;
  sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const floorMaterial = new MeshLambertMaterial();
  const floorGeometry = new PlaneGeometry(SIDE * GAP + 6, SIDE * GAP + 6);
  const floor = new Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const field = createVoxelField(COUNT);
  scene.add(field.mesh);

  // per column: its place, how far from the middle (0..1) and how tall it can grow
  const columns = Array.from({ length: COUNT }, (_, i) => {
    const ix = i % SIDE;
    const iz = Math.floor(i / SIDE);
    const x = (ix - (SIDE - 1) / 2) * GAP;
    const z = (iz - (SIDE - 1) / 2) * GAP;
    const dist = Math.hypot(ix - (SIDE - 1) / 2, iz - (SIDE - 1) / 2) / (Math.SQRT2 * ((SIDE - 1) / 2));
    const wave = 0.5 + 0.5 * Math.sin(ix * 0.9) * Math.cos(iz * 0.7);
    return { x, z, dist, max: 1.5 + wave * 6 * (1 - dist * 0.5) };
  });

  let palette: PaletteUniforms | undefined;
  let progress = REST_PROGRESS;
  const bands = [new Color(), new Color(), new Color(), new Color()];

  function applyColors(): void {
    if (!palette) return;
    // palette slots: 8 accent-primary, 9 hover, 10 pressed, 15 accent-info (see PALETTE_TOKENS)
    bands[0]!.copy(toColor(palette.colors[10]!));
    bands[1]!.copy(toColor(palette.colors[8]!));
    bands[2]!.copy(toColor(palette.colors[9]!));
    bands[3]!.copy(toColor(palette.colors[15]!));
    scene.background = toColor(palette.background);
    floorMaterial.color.copy(toColor(palette.colors[1]!));
  }

  function layout(): void {
    const rise = progress * 2.1;
    columns.forEach((c, i) => {
      const t = clamp01(rise - c.dist * 0.7);
      const eased = t * t * (3 - 2 * t);
      const h = Math.max(0.5, Math.round((0.5 + eased * c.max) * 2) / 2);
      field.set(i, c.x, 0, c.z, h);
      const band = h < 2 ? 0 : h < 4 ? 1 : h < 6 ? 2 : 3;
      field.setColor(i, bands[band]!);
    });
    field.commit();
    // the camera drifts around the field a little as it rises
    const angle = Math.PI / 4 + (progress - 0.5) * 0.7;
    const radius = 34;
    camera.position.set(Math.sin(angle) * radius, 17 - progress * 3, Math.cos(angle) * radius);
    camera.lookAt(0, 0.5 + progress * 1.5, 0);
  }

  return {
    scene,
    camera,
    setPalette(p) {
      palette = p;
      applyColors();
      layout();
    },
    setProgress(p) {
      progress = clamp01(p);
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
      // keep the whole field in frame on a tall phone screen
      camera.fov = aspect < 1 ? 32 / Math.max(0.55, aspect) : 32;
      camera.updateProjectionMatrix();
    },
    dispose() {
      field.dispose();
      floorGeometry.dispose();
      floorMaterial.dispose();
      sun.shadow.map?.dispose();
    },
  };
}
