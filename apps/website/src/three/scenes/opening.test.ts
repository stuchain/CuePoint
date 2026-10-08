import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEMES } from "../../lib/themes";
import { paletteUniforms } from "../palette";
import {
  CRATE,
  KEYS,
  PHASES,
  RECORD_COUNT,
  TAG,
  REST_PROGRESS,
  WHEEL,
  create,
  labelAmount,
  litAmount,
  recordPose,
  tagTexels,
  cameraPose,
  wheelSlot,
  wheelTilt,
} from "./opening";

/**
 * The home page's opening scene (SITE-06, DEC-189): a voxel crate of unlabeled records; they lift out,
 * take their key, tempo and genre as pixel labels, fly into a Camelot wheel that lights up, and the
 * wheel turns flat. The story is a pure function of the scroll progress, so it is tested without WebGL.
 */

const css = readFileSync(new URL("../../styles/tokens.generated.css", import.meta.url), "utf8");

function themeTokens(id: string): Record<string, string> {
  const m = css.match(new RegExp(`\\[data-theme="${id}"\\]\\s*\\{([^}]*)\\}`));
  if (!m) throw new Error(`no block for ${id}`);
  const out: Record<string, string> = {};
  for (const line of m[1]!.split(";")) {
    const kv = line.match(/^\s*--([\w-]+):\s*(.+?)\s*$/);
    if (kv) out[kv[1]!] = kv[2]!;
  }
  return out;
}

const records = Array.from({ length: RECORD_COUNT }, (_, i) => i);
const steps = Array.from({ length: 101 }, (_, n) => n / 100);

describe("the opening scene's story", () => {
  it("rests on the crate, so the still, and the first frame at the top of the page, are the messy library", () => {
    expect(REST_PROGRESS).toBe(0);
  });

  it("has the 24 Camelot keys, each number from 1 to 12 in A and B, once", () => {
    expect(RECORD_COUNT).toBe(24);
    expect(KEYS).toHaveLength(24);
    expect(new Set(KEYS).size).toBe(24);
    for (let n = 1; n <= 12; n++) {
      expect(KEYS).toContain(`${n}A`);
      expect(KEYS).toContain(`${n}B`);
    }
  });

  it("starts with every record standing inside the crate", () => {
    for (const i of records) {
      const p = recordPose(i, 0);
      expect(Math.abs(p.x), `record ${i} x`).toBeLessThanOrEqual(CRATE.halfWidth);
      expect(Math.abs(p.z), `record ${i} z`).toBeLessThanOrEqual(CRATE.halfDepth);
      expect(p.y, `record ${i} y`).toBeLessThanOrEqual(CRATE.height);
      expect(p.y, `record ${i} y`).toBeGreaterThan(0);
    }
  });

  it("ends with every record on its own place in the wheel", () => {
    const seen = new Set<string>();
    for (const i of records) {
      const slot = wheelSlot(i);
      const p = recordPose(i, 1);
      expect(Math.hypot(p.x - slot.x, p.z - slot.z)).toBeLessThan(1e-6);
      seen.add(`${slot.ring}:${slot.index}`);
    }
    expect(seen.size).toBe(24);
  });

  it("puts 12 keys on each ring, B outside and A inside, 30 degrees apart, 12 at the top", () => {
    const outer = records.filter((i) => wheelSlot(i).ring === "B");
    const inner = records.filter((i) => wheelSlot(i).ring === "A");
    expect(outer).toHaveLength(12);
    expect(inner).toHaveLength(12);
    for (const i of outer) expect(Math.hypot(wheelSlot(i).x, wheelSlot(i).z)).toBeCloseTo(WHEEL.outerRadius, 5);
    for (const i of inner) expect(Math.hypot(wheelSlot(i).x, wheelSlot(i).z)).toBeCloseTo(WHEEL.innerRadius, 5);
    expect(WHEEL.outerRadius).toBeGreaterThan(WHEEL.innerRadius);
    const top = records.find((i) => KEYS[i] === "12B")!;
    expect(wheelSlot(top).x).toBeCloseTo(0, 5);
    expect(wheelSlot(top).z).toBeLessThan(0); // away from the camera, drawn at the top once the wheel stands up
    const one = records.find((i) => KEYS[i] === "1B")!;
    expect(wheelSlot(one).x).toBeGreaterThan(0); // clockwise from the top
  });

  it("never teleports a record: no step of 1% of the scroll moves one more than a few units", () => {
    for (const i of records) {
      let last = recordPose(i, 0);
      for (const p of steps.slice(1)) {
        const now = recordPose(i, p);
        const d = Math.hypot(now.x - last.x, now.y - last.y, now.z - last.z);
        expect(d, `record ${i} at ${p}`).toBeLessThan(3);
        last = now;
      }
    }
  });

  it("is a pure function of the progress, and clamps outside 0..1", () => {
    expect(recordPose(3, 0.5)).toEqual(recordPose(3, 0.5));
    expect(recordPose(3, -1)).toEqual(recordPose(3, 0));
    expect(recordPose(3, 2)).toEqual(recordPose(3, 1));
  });

  it("lifts the records out before it tags them, and tags them before they fly", () => {
    expect(PHASES.lift[0]).toBeLessThan(PHASES.tag[0]);
    expect(PHASES.tag[0]).toBeLessThan(PHASES.fly[0]);
    expect(PHASES.fly[1]).toBeLessThanOrEqual(PHASES.flat[0] + 0.05);
    expect(PHASES.flat[1]).toBe(1);
    // at the end of the lift every record is above the rim
    for (const i of records) expect(recordPose(i, PHASES.lift[1]).y).toBeGreaterThan(CRATE.height);
  });

  it("shows the labels only while the records carry them", () => {
    for (const i of records) {
      expect(labelAmount(i, 0)).toBe(0);
      expect(labelAmount(i, 1)).toBe(0);
      expect(Math.max(...steps.map((p) => labelAmount(i, p)))).toBe(1);
      for (const p of steps) {
        const a = labelAmount(i, p);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(1);
      }
    }
  });

  it("lights the wheel as the records arrive, and never turns a light off", () => {
    for (const i of records) {
      expect(litAmount(i, 0)).toBe(0);
      expect(litAmount(i, 1)).toBe(1);
      let last = 0;
      for (const p of steps) {
        const a = litAmount(i, p);
        expect(a).toBeGreaterThanOrEqual(last);
        last = a;
      }
    }
  });

  it("lays the wheel flat on the floor while it forms, then stands it up to face the visitor", () => {
    expect(wheelTilt(0)).toBe(0);
    expect(wheelTilt(PHASES.fly[1])).toBe(0);
    expect(wheelTilt(1)).toBeCloseTo(Math.PI / 2, 6);
    let last = 0;
    for (const p of steps) {
      expect(wheelTilt(p)).toBeGreaterThanOrEqual(last);
      last = wheelTilt(p);
    }
  });
});

describe("the records' tags can be read", () => {
  // the stage is 16:9 at the page's width: 343 CSS px on a 375 px phone, about 700 on a 1440 px screen; one scene pixel is 4 CSS px
  const SCENE_PIXEL_CSS = 4;
  const FOV = 32; // the camera's vertical field of view (create(); a 16:9 stage never widens it)
  for (const stage of [343, 700]) {
    it(`covers at least one scene pixel per texel on a ${stage} px stage`, () => {
      const cam = cameraPose(0.4); // the tags' shot: held from the end of the lift to the start of the fly
      const labelZ = 0.5; // the sleeves hang within 0.3 of z = 0, and the tag sits just in front
      const distance = cam.position[2] - labelZ;
      const worldWidth = 2 * Math.tan((FOV / 2) * (Math.PI / 180)) * distance * (16 / 9);
      const worldPerScenePixel = worldWidth / (stage / SCENE_PIXEL_CSS);
      expect(TAG.texel / worldPerScenePixel).toBeGreaterThanOrEqual(1);
    });
  }

  it("shows only the key, and the longest tag still fits its sleeve and its column", () => {
    const widest = Math.max(...records.map((i) => tagTexels(i).width)) * TAG.texel;
    expect(widest).toBeLessThanOrEqual(3.0 + 1e-9); // the hung sleeve's width
    expect(widest).toBeLessThan(3.3); // the column pitch
    expect(tagTexels(KEYS.indexOf("8A")).height).toBe(5);
  });

  it("holds the tags' camera still through the tagging, so the texel size stays true", () => {
    expect(cameraPose(0.34)).toEqual(cameraPose(0.5));
  });
});

describe("the opening scene as a Three.js scene", () => {
  it("builds, takes every theme's palette and every progress, and frees what it made", () => {
    const instance = create();
    expect(instance.scene.children.length).toBeGreaterThan(0);
    for (const theme of THEMES) {
      instance.setPalette(paletteUniforms(themeTokens(theme.id)));
      for (const p of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
        instance.setProgress(p);
        instance.resize(16 / 9);
        instance.camera.updateMatrixWorld();
        expect(Number.isFinite(instance.camera.position.x)).toBe(true);
        expect(Number.isFinite(instance.camera.position.y)).toBe(true);
      }
    }
    instance.resize(0.5);
    instance.setShadowSize?.(0);
    instance.dispose();
  });

  it("has one record in the scene per key, so the story and the picture agree", () => {
    const instance = create();
    const named = instance.scene.getObjectByName("records");
    expect(named).toBeDefined();
    expect((named as unknown as { count: number }).count).toBe(RECORD_COUNT);
    instance.dispose();
  });
});
