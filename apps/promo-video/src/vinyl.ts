import { Color, CylinderGeometry, Euler, InstancedMesh, MeshLambertMaterial, Object3D, type Scene } from "three";
import { PALETTE_TOKENS, type PaletteUniforms } from "./scene/palette";
import { RECORD_COUNT, recordPose } from "./scene/opening";

/**
 * The records in the site's crate are blank sleeves. The promo adds the vinyl: a black disc with a coloured
 * label peeking out of the top of each sleeve, so from the side the crate reads as records. The disc slips
 * back into its sleeve as the record lifts to take its tag, and is gone before the sleeves become the wheel.
 * The site's scene is not touched: this sits on top of it and follows the same record poses.
 */

const DISC = { radius: 1.32, thick: 0.06, peek: 0.45 } as const;
/** The record nearest the camera is half out of its sleeve, label on show. */
const HERO = { index: RECORD_COUNT - 1, peek: 1.35 } as const;
const RING = { radius: 0.92, thick: 0.07 } as const;
const LABEL = { radius: 0.42, thick: 0.09 } as const;
const LABEL_TOKENS = ["accent-primary", "accent-success", "accent-warning", "accent-danger", "accent-info", "accent-secondary"] as const;

const slot = (token: (typeof PALETTE_TOKENS)[number]): number => PALETTE_TOKENS.indexOf(token);
const toColor = (c: readonly [number, number, number]): Color => new Color(c[0], c[1], c[2]);

export interface Vinyl {
  /** Puts every disc where its record is at `progress`. */
  update(progress: number): void;
  setPalette(palette: PaletteUniforms): void;
  dispose(): void;
}

export function addVinyl(scene: Scene): Vinyl {
  // a cylinder stands on y; the sleeve is thin along x, so the disc turns a quarter onto its side
  const geometry = (radius: number, thick: number): CylinderGeometry => new CylinderGeometry(radius, radius, thick, 24).rotateZ(Math.PI / 2);
  const discGeometry = geometry(DISC.radius, DISC.thick);
  const ringGeometry = geometry(RING.radius, RING.thick);
  const labelGeometry = geometry(LABEL.radius, LABEL.thick);
  const discMaterial = new MeshLambertMaterial();
  const ringMaterial = new MeshLambertMaterial();
  const labelMaterial = new MeshLambertMaterial();
  const discs = new InstancedMesh(discGeometry, discMaterial, RECORD_COUNT);
  const rings = new InstancedMesh(ringGeometry, ringMaterial, RECORD_COUNT);
  const labels = new InstancedMesh(labelGeometry, labelMaterial, RECORD_COUNT);
  discs.castShadow = true;
  scene.add(discs, rings, labels);

  const dummy = new Object3D();
  const euler = new Euler();
  const tint = new Color();
  const labelColors = Array.from({ length: RECORD_COUNT }, () => new Color(0xffffff));

  return {
    update(progress) {
      for (let i = 0; i < RECORD_COUNT; i++) {
        const r = recordPose(i, progress);
        // how far the record has left its rest: the sleeve's height tells (it hangs smaller once lifted)
        const inCrate = Math.min(1, Math.max(0, (r.sy - 2.2) / (3 - 2.2)));
        const k = r.sx > 0.5 ? 0 : inCrate; // once the box widens into a wheel cell the disc is gone
        euler.set(0, r.yaw, r.tilt, "YXZ");
        dummy.rotation.copy(euler);
        // the disc sits in the sleeve's own up direction, peeking out of the top
        dummy.position.set(0, (i === HERO.index ? HERO.peek : DISC.peek) * k, 0).applyEuler(euler).add({ x: r.x, y: r.y, z: r.z } as never);
        dummy.scale.setScalar(Math.max(1e-4, k));
        dummy.updateMatrix();
        discs.setMatrixAt(i, dummy.matrix);
        rings.setMatrixAt(i, dummy.matrix);
        labels.setMatrixAt(i, dummy.matrix);
        labels.setColorAt(i, tint.copy(labelColors[i]!));
      }
      discs.instanceMatrix.needsUpdate = true;
      rings.instanceMatrix.needsUpdate = true;
      labels.instanceMatrix.needsUpdate = true;
      if (labels.instanceColor) labels.instanceColor.needsUpdate = true;
    },
    setPalette(palette) {
      // vinyl is black, but the room is near black too: a dark grey disc with a darker groove ring reads
      discMaterial.color.copy(toColor(palette.colors[slot("bg-panel-alt")]!));
      ringMaterial.color.copy(toColor(palette.colors[slot("bg-panel")]!));
      for (let i = 0; i < RECORD_COUNT; i++) {
        labelColors[i]!.copy(toColor(palette.colors[slot(LABEL_TOKENS[(i * 5) % LABEL_TOKENS.length]!)]!));
      }
    },
    dispose() {
      discGeometry.dispose();
      ringGeometry.dispose();
      labelGeometry.dispose();
      discMaterial.dispose();
      ringMaterial.dispose();
      labelMaterial.dispose();
    },
  };
}
