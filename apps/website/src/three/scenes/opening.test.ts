import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEMES } from "../../lib/themes";
import { paletteUniforms } from "../palette";
import { STEP_SPANS, frameAt, stepMid } from "../phases";
import {
  CELL_TAG,
  CRATE,
  KEYS,
  LABEL_HOLD,
  PHASES,
  RECORD_COUNT,
  REST_PROGRESS,
  STILL_FRAMES,
  TAG,
  TALL_STILLS,
  WHEEL,
  arrivalOrder,
  cameraPose,
  chaseAmount,
  create,
  crateDrop,
  fovFor,
  heroAmount,
  heroLean,
  labelAmount,
  litAmount,
  recordPose,
  tagTexels,
  wheelSlot,
} from "./opening";

/**
 * The home page's opening scene (SITE-06, DEC-189), one full-screen pinned story: a voxel crate of
 * unlabeled records in front of an empty Camelot wheel; the camera dives in, the records lift out, take
 * their key as pixel tags, fly into the wheel, which lights up key by key, and the camera squares up to
 * it. The story is a pure function of the scroll progress, so it is tested without WebGL.
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
const [CX, CY, CZ] = WHEEL.center;
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe("the opening scene's story", () => {
  it("rests on the crate and the empty wheel, so the still and the hero are the messy library", () => {
    expect(REST_PROGRESS).toBe(0);
    for (const i of records) expect(litAmount(i, REST_PROGRESS)).toBe(0);
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

  it("ends with every record on its own place in the standing wheel, at its key's angle", () => {
    const seen = new Set<string>();
    for (const i of records) {
      const slot = wheelSlot(i);
      const p = recordPose(i, 1);
      expect(Math.hypot(p.x - slot.x, p.y - slot.y, p.z - slot.z)).toBeLessThan(1e-6);
      expect(Math.cos(p.roll + slot.angle)).toBeCloseTo(1, 6);
      seen.add(`${slot.ring}:${slot.index}`);
    }
    expect(seen.size).toBe(24);
  });

  it("puts 12 keys on each ring, B outside and A inside, 30 degrees apart, 12 at the top, clockwise", () => {
    const outer = records.filter((i) => wheelSlot(i).ring === "B");
    const inner = records.filter((i) => wheelSlot(i).ring === "A");
    expect(outer).toHaveLength(12);
    expect(inner).toHaveLength(12);
    for (const i of outer) expect(Math.hypot(wheelSlot(i).x - CX, wheelSlot(i).y - CY)).toBeCloseTo(WHEEL.outerRadius, 5);
    for (const i of inner) expect(Math.hypot(wheelSlot(i).x - CX, wheelSlot(i).y - CY)).toBeCloseTo(WHEEL.innerRadius, 5);
    for (const i of records) expect(wheelSlot(i).z).toBe(CZ);
    const top = records.find((i) => KEYS[i] === "12B")!;
    expect(wheelSlot(top).x).toBeCloseTo(CX, 5);
    expect(wheelSlot(top).y).toBeGreaterThan(CY);
    const one = records.find((i) => KEYS[i] === "1B")!;
    expect(wheelSlot(one).x).toBeGreaterThan(CX); // clockwise from the top
    // the wheel stands behind the crate, clear of the floor
    expect(CZ).toBeLessThan(-CRATE.halfDepth);
    expect(CY - WHEEL.outerRadius - WHEEL.radial / 2).toBeGreaterThan(0);
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

  it("holds the hero, then lifts the records out before it tags them, and tags them before they fly", () => {
    expect(PHASES.hero[1]).toBeLessThanOrEqual(PHASES.lift[0]);
    expect(PHASES.lift[0]).toBeLessThan(PHASES.tag[0]);
    expect(PHASES.tag[0]).toBeLessThan(PHASES.fly[0]);
    expect(PHASES.fly[1]).toBeLessThanOrEqual(PHASES.finale[0]);
    expect(PHASES.finale[1]).toBe(1);
    // through the hero nothing has moved yet
    for (const i of records) expect(recordPose(i, PHASES.hero[1])).toEqual(recordPose(i, 0));
    // at the end of the lift every record is above the rim
    for (const i of records) expect(recordPose(i, PHASES.lift[1]).y).toBeGreaterThan(CRATE.height);
  });

  it("shows the hanging tags only while the records carry them", () => {
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

  it("lights the wheel as the records arrive, never turns a light off, and every key is lit by the finale", () => {
    for (const i of records) {
      expect(litAmount(i, 0)).toBe(0);
      expect(litAmount(i, PHASES.finale[0])).toBe(1);
      let last = 0;
      for (const p of steps) {
        const a = litAmount(i, p);
        expect(a).toBeGreaterThanOrEqual(last);
        last = a;
      }
    }
  });

  it("lights the wheel key by key, round the clock from 1", () => {
    const firstLit = (i: number) => steps.find((p) => litAmount(i, p) > 0.5)!;
    const byOrder = [...records].sort((a, b) => arrivalOrder(a) - arrivalOrder(b));
    expect(KEYS[byOrder[0]!]).toBe("1A");
    expect(KEYS[byOrder.at(-1)!]).toBe("12B");
    for (let k = 1; k < byOrder.length; k++) expect(firstLit(byOrder[k]!)).toBeGreaterThanOrEqual(firstLit(byOrder[k - 1]!));
    expect(firstLit(byOrder.at(-1)!)).toBeGreaterThan(firstLit(byOrder[0]!) + 0.1);
  });

  it("runs a light round the lit wheel once in the finale, and nowhere else", () => {
    for (const i of records) {
      for (const p of steps.filter((p) => p < PHASES.finale[0])) expect(chaseAmount(i, p)).toBe(0);
      expect(chaseAmount(i, 1)).toBe(0);
      const finale = Array.from({ length: 401 }, (_, n) => PHASES.finale[0] + (n / 400) * (1 - PHASES.finale[0]));
      expect(Math.max(...finale.map((p) => chaseAmount(i, p))), KEYS[i]).toBeGreaterThan(0.9);
    }
  });

  it("sinks the crate away once the records have gone", () => {
    expect(crateDrop(0)).toBe(0);
    expect(crateDrop(PHASES.tag[1])).toBe(0);
    expect(crateDrop(1)).toBeGreaterThan(CRATE.height);
  });
});

describe("the camera", () => {
  it("never jumps: no step of 1% of the scroll moves it more than a few units", () => {
    let last = cameraPose(0);
    for (const p of steps.slice(1)) {
      const now = cameraPose(p);
      expect(dist(now.position, last.position), `at ${p}`).toBeLessThan(3.2);
      expect(dist(now.target, last.target), `at ${p}`).toBeLessThan(3.2);
      last = now;
    }
  });

  it("holds still through the hero's start and through the label hold", () => {
    expect(cameraPose(LABEL_HOLD[0])).toEqual(cameraPose(LABEL_HOLD[1]));
    expect(cameraPose(0.42)).toEqual(cameraPose(LABEL_HOLD[0]));
  });

  it("dives into the crate: in the lift it comes within a few units of the records, low over the rim", () => {
    const closest = Math.min(...steps.filter((p) => p >= PHASES.lift[0] && p <= PHASES.lift[1]).map((p) => dist(cameraPose(p).position, [0, CRATE.height, 0])));
    // under 8: close enough that the records fill the frame, far enough that the lens never clips one
    expect(closest).toBeLessThan(8);
    // from the hero's distance
    expect(dist(cameraPose(0).position, [0, CRATE.height, 0])).toBeGreaterThan(18);
  });

  it("swings round the wheel while the records fly into it", () => {
    const xs = steps.filter((p) => p >= PHASES.fly[0] && p <= PHASES.fly[1]).map((p) => cameraPose(p).position[0]);
    expect(Math.min(...xs)).toBeLessThan(-8);
    expect(Math.max(...xs)).toBeGreaterThan(4);
  });

  it("ends square to the lit wheel, at its height, looking at its middle", () => {
    const end = cameraPose(1);
    expect(end.position[0]).toBe(CX);
    expect(end.position[1]).toBe(CY);
    expect(end.target).toEqual([CX, CY, CZ]);
  });

  it("leans the hero aside for the headline, and only in the hero", () => {
    expect(heroAmount(0)).toBe(1);
    expect(heroAmount(0.2)).toBe(0);
    expect(heroAmount(1)).toBe(0);
    expect(heroLean(16 / 9).x).toBeGreaterThan(0); // the headline is on the left of a wide screen
    expect(heroLean(390 / 844).y).toBeLessThan(0); // and on top of an upright phone
  });

  it("widens the view for an upright phone, so the grid and the wheel fit across", () => {
    expect(fovFor(16 / 9)).toBe(32);
    expect(fovFor(390 / 844)).toBeGreaterThan(55);
    const across = (aspect: number, distance: number) => 2 * Math.tan((fovFor(aspect) / 2) * (Math.PI / 180)) * distance * aspect;
    // the lit wheel, studs and all, fits across a phone at the last shot
    expect(across(390 / 844, cameraPose(1).position[2] - CZ)).toBeGreaterThan(2 * (WHEEL.outerRadius + WHEEL.radial / 2 + 0.7));
  });
});

describe("the tags can be read on a full screen", () => {
  // one scene pixel is 4 CSS px; the stage is the whole screen
  const SCENE_PIXEL_CSS = 4;
  const pixelsPerTexel = (width: number, height: number, distance: number, texel: number): number => {
    const aspect = width / height;
    const worldWidth = 2 * Math.tan((fovFor(aspect) / 2) * (Math.PI / 180)) * distance * aspect;
    return texel / (worldWidth / (width / SCENE_PIXEL_CSS));
  };
  const SCREENS = [
    { name: "a 1440 x 836 desktop", w: 1440, h: 836, min: 3, cellMin: 2 },
    { name: "a 390 x 844 phone", w: 390, h: 844, min: 2, cellMin: 1 },
  ];
  const tagDistance = cameraPose(0.45).position[2] - 0.5; // the sleeves hang within 0.3 of z = 0
  const cellDistance = cameraPose(1).position[2] - (CZ + WHEEL.depth / 2);
  for (const s of SCREENS) {
    it(`gives a hanging tag at least ${s.min} scene pixels a texel on ${s.name}`, () => {
      expect(pixelsPerTexel(s.w, s.h, tagDistance, TAG.texel)).toBeGreaterThanOrEqual(s.min);
    });
    it(`gives a lit cell's key at least ${s.cellMin} scene pixel(s) a texel on ${s.name}`, () => {
      expect(pixelsPerTexel(s.w, s.h, cellDistance, CELL_TAG.texel)).toBeGreaterThanOrEqual(s.cellMin);
    });
  }

  it("shows only the key, and the longest tag still fits its sleeve, its column and its cell", () => {
    const widest = Math.max(...records.map((i) => tagTexels(i).width)) * TAG.texel;
    expect(widest).toBeLessThanOrEqual(3.2 - 0.2); // the hung sleeve's width, and a margin each side
    expect(widest).toBeLessThan(3.5); // the column pitch
    for (const i of records) expect(tagTexels(i).width * CELL_TAG.texel, KEYS[i]).toBeLessThanOrEqual(wheelSlot(i).width);
    expect(tagTexels(KEYS.indexOf("8A")).height).toBe(5);
  });

  it("has every key on show, whole, through the whole label hold", () => {
    for (const i of records) {
      for (const p of [LABEL_HOLD[0], 0.42, 0.47, LABEL_HOLD[1]]) expect(labelAmount(i, p), `record ${i} at ${p}`).toBe(1);
    }
  });

  it("keeps every sleeve still through the label hold, so a key never sits between two pixels", () => {
    for (const i of records) {
      const a = recordPose(i, LABEL_HOLD[0]);
      const b = recordPose(i, LABEL_HOLD[1]);
      expect(b, `record ${i}`).toEqual(a);
    }
  });
});

describe("the steps of the text and the frames", () => {
  it("centers each step in the part of the story it tells", () => {
    expect(stepMid("messy")).toBeGreaterThan(PHASES.hero[1]); // after the hero has scrolled away
    expect(stepMid("messy")).toBeLessThan(PHASES.lift[1]);
    expect(stepMid("matched")).toBeGreaterThanOrEqual(LABEL_HOLD[0]);
    expect(stepMid("matched")).toBeLessThanOrEqual(LABEL_HOLD[1]);
    expect(stepMid("ready")).toBeGreaterThan(PHASES.fly[0]);
    expect(STEP_SPANS.ready[1]).toBe(1);
  });

  it("draws a still of each step's frame, wide and tall, and shows the one being read", () => {
    expect(TALL_STILLS).toBe(true);
    expect(STILL_FRAMES["matched"]).toBeGreaterThanOrEqual(LABEL_HOLD[0]);
    expect(STILL_FRAMES["matched"]).toBeLessThanOrEqual(LABEL_HOLD[1]);
    expect(STILL_FRAMES["ready"]).toBe(1);
    expect(frameAt(0)).toBe("rest");
    expect(frameAt(stepMid("matched"))).toBe("matched");
    expect(frameAt(stepMid("ready"))).toBe("ready");
    expect(frameAt(1)).toBe("ready");
  });
});

describe("the opening scene as a Three.js scene", () => {
  it("builds, takes every theme's palette, every progress, every shape and the passing time, and frees what it made", () => {
    const instance = create();
    expect(instance.scene.children.length).toBeGreaterThan(0);
    for (const theme of THEMES) {
      instance.setPalette(paletteUniforms(themeTokens(theme.id)));
      for (const aspect of [16 / 9, 0.46]) {
        instance.resize(aspect);
        for (const p of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
          instance.setProgress(p);
          instance.camera.updateMatrixWorld();
          expect(Number.isFinite(instance.camera.position.x)).toBe(true);
          expect(Number.isFinite(instance.camera.position.y)).toBe(true);
          expect(instance.tick?.(12.5)).toBe(true);
        }
      }
    }
    instance.setShadowSize?.(0);
    instance.dispose();
  });

  it("moves on its own over time in the hero, and a still is the scene at time 0", () => {
    const instance = create();
    instance.resize(16 / 9);
    instance.setProgress(0);
    const at0 = instance.camera.position.toArray();
    instance.tick?.(3);
    expect(instance.camera.position.toArray()).not.toEqual(at0);
    instance.tick?.(0);
    expect(instance.camera.position.toArray()).toEqual(at0);
    instance.dispose();
  });

  it("leans the hero with a lens shift, and squares it again once the story starts", () => {
    const instance = create();
    instance.resize(16 / 9);
    instance.setProgress(0);
    expect(instance.camera.projectionMatrix.elements[8]).toBeCloseTo(-heroLean(16 / 9).x, 6);
    instance.setProgress(0.5);
    expect(instance.camera.projectionMatrix.elements[8]).toBeCloseTo(0, 6);
    instance.dispose();
  });

  it("has one record in the scene per key, and a socket for each, so the story and the picture agree", () => {
    const instance = create();
    for (const name of ["records", "sockets"]) {
      const named = instance.scene.getObjectByName(name);
      expect(named, name).toBeDefined();
      expect((named as unknown as { count: number }).count).toBe(RECORD_COUNT);
    }
    instance.dispose();
  });
});
