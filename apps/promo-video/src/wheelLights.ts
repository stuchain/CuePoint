import { BoxGeometry, Color, Group, InstancedMesh, MeshBasicMaterial, Object3D, type Scene } from "three";
import { KEYS, RECORD_COUNT, WHEEL, wheelLift, wheelSlot, wheelTilt } from "../../website/src/three/scenes/opening";
import { keyColor } from "./content";
import { BEAT, kickLevel, shot } from "./timing";

/**
 * Behind the end card the wheel's cells light up in key order, three a beat (1A, 1B, 2A on the first
 * beat, and so on round the clock), each with a flash that settles to a glow. Promo only: the cells are
 * bright boxes laid over the site's own wheel, in the wheel's standing frame.
 */

const CELLS_PER_BEAT = 3;

export interface WheelLights {
  update(t: number): void;
  dispose(): void;
}

export function addWheelLights(scene: Scene): WheelLights {
  const group = new Group();
  group.rotation.x = wheelTilt(1);
  group.position.y = wheelLift(1);
  const geometry = new BoxGeometry(1, 1, 1);
  const material = new MeshBasicMaterial();
  const cells = new InstancedMesh(geometry, material, RECORD_COUNT);
  group.add(cells);
  scene.add(group);

  const dummy = new Object3D();
  const tint = new Color();
  const colors = KEYS.map((k) => new Color(keyColor(k)));
  const { start } = shot("end");

  return {
    update(t) {
      for (let i = 0; i < RECORD_COUNT; i++) {
        const slot = wheelSlot(i);
        const hit = start + Math.floor(i / CELLS_PER_BEAT) * BEAT;
        const since = t - hit;
        const on = since >= 0;
        const pulse = on ? Math.exp(-since / 0.22) : 0;
        // a little bigger than the cell (which no longer swells behind the end card), and it pumps with the kick
        const grow = on ? (1.12 + 0.25 * pulse) * (1 + 0.1 * kickLevel(t)) : 1e-4;
        dummy.position.set(slot.x, WHEEL.cell / 2, slot.z);
        dummy.rotation.set(0, -slot.angle, 0);
        dummy.scale.set(slot.width * grow, WHEEL.cell * grow, WHEEL.radial * grow);
        dummy.updateMatrix();
        cells.setMatrixAt(i, dummy.matrix);
        cells.setColorAt(i, tint.copy(colors[i]!).multiplyScalar(0.8 + 0.2 * pulse));
      }
      cells.instanceMatrix.needsUpdate = true;
      if (cells.instanceColor) cells.instanceColor.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
