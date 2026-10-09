import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { THEMES } from "../../lib/themes";
import { paletteUniforms } from "../palette";
import { STILL_VARIANTS, sceneNames } from "../../../scripts/stills-lib.mjs";
import { SCENE_LOADERS } from "./index";
import * as record from "./record";
import * as terrain from "./terrain";
import * as wheel from "./wheel";

/**
 * The home page's three props (SITE-06): a turntable for Clean, a waveform landscape for Waveforms and a
 * Camelot wheel of key counts for Keys. Each moves on its own (tick) and follows its section's scroll; the
 * numbers behind them are pure and checked here, and each builds and frees its scene in every theme.
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

describe("the Clean section's turntable", () => {
  it("turns the record once every TURN_SECONDS, clockwise seen from above", () => {
    expect(record.recordAngle(0)).toBeCloseTo(0, 9);
    expect(record.recordAngle(record.TURN_SECONDS)).toBeCloseTo(-2 * Math.PI, 9);
    expect(record.recordAngle(1)).toBeLessThan(0);
  });

  it("swings the arm onto the record as its section scrolls in, and never back", () => {
    expect(record.armSwing(0)).toBe(0);
    expect(record.armSwing(1)).toBe(1);
    let last = 0;
    for (let n = 0; n <= 100; n++) {
      const a = record.armSwing(n / 100);
      expect(a).toBeGreaterThanOrEqual(last);
      last = a;
    }
  });
});

describe("the Waveforms section's landscape", () => {
  it("is a loop of a made-up track, loudness 0 to 1, with quiet and loud parts", () => {
    const xs = Array.from({ length: terrain.TRACK_LENGTH }, (_, x) => x);
    for (const x of xs) {
      expect(terrain.loudness(x)).toBeGreaterThanOrEqual(0);
      expect(terrain.loudness(x)).toBeLessThanOrEqual(1);
      expect(terrain.loudness(x + terrain.TRACK_LENGTH)).toBeCloseTo(terrain.loudness(x), 9);
    }
    const levels = xs.map(terrain.loudness);
    expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(0.6);
  });

  it("is blocky, mirrored across the middle row and tallest there", () => {
    const mid = (terrain.ROWS - 1) / 2;
    for (let x = 0; x < terrain.COLS; x++) {
      for (let r = 0; r < terrain.ROWS; r++) {
        const h = terrain.columnHeight(x, r);
        expect(h / terrain.STEP).toBeCloseTo(Math.round(h / terrain.STEP), 9);
        expect(h).toBe(terrain.columnHeight(x, terrain.ROWS - 1 - r));
        expect(h).toBeLessThanOrEqual(terrain.columnHeight(x, mid));
      }
    }
  });

  it("draws three bands: lows in the middle, highs at the edges", () => {
    expect(terrain.band((terrain.ROWS - 1) / 2)).toBe(0);
    expect(terrain.band(0)).toBe(2);
    expect(new Set(Array.from({ length: terrain.ROWS }, (_, r) => terrain.band(r)))).toEqual(new Set([0, 1, 2]));
  });
});

describe("the Keys section's wheel", () => {
  it("has the 24 keys, B outside and A inside, 12 at the top", () => {
    const top = wheel.cell(23); // 12B
    expect(top.ring).toBe("B");
    expect(top.angle).toBeCloseTo(0, 9);
    expect(wheel.cell(0).radius).toBeLessThan(wheel.cell(1).radius);
  });

  it("raises each key by its made-up count, 1 to 9 tracks", () => {
    for (let i = 0; i < wheel.KEY_COUNT; i++) {
      expect(Number.isInteger(wheel.keyCount(i))).toBe(true);
      expect(wheel.keyCount(i)).toBeGreaterThanOrEqual(1);
      expect(wheel.keyCount(i)).toBeLessThanOrEqual(9);
    }
  });

  it("runs a light round the wheel, lighting each key in turn once a lap", () => {
    const times = Array.from({ length: 700 }, (_, n) => (n / 700) * wheel.LAP_SECONDS);
    for (let i = 0; i < wheel.KEY_COUNT; i++) {
      const lit = times.map((t) => wheel.lightAmount(i, t));
      expect(Math.max(...lit)).toBeGreaterThan(0.9);
      expect(Math.min(...lit)).toBe(0);
    }
  });

  it("tips toward the visitor as its section scrolls in", () => {
    expect(wheel.wheelTip(1)).toBeGreaterThan(wheel.wheelTip(0));
  });
});

describe("each prop as a Three.js scene", () => {
  for (const [name, mod] of Object.entries({ record, terrain, wheel })) {
    it(`${name}: builds, takes every theme, every progress and the passing time, and frees what it made`, () => {
      const instance = mod.create();
      for (const theme of THEMES) {
        instance.setPalette(paletteUniforms(themeTokens(theme.id)));
        for (const aspect of [16 / 9, 0.6]) {
          instance.resize(aspect);
          for (const p of [0, 0.5, 1]) {
            instance.setProgress(p);
            expect(instance.tick?.(4.2)).toBe(true);
            expect(Number.isFinite(instance.camera.position.x)).toBe(true);
          }
        }
      }
      instance.setLevel?.(0.5);
      instance.setShadowSize?.(0);
      instance.dispose();
      expect(mod.REST_PROGRESS).toBeGreaterThanOrEqual(0);
      expect(mod.REST_PROGRESS).toBeLessThanOrEqual(1);
    });
  }
});

describe("the stills each scene has", () => {
  it("lists in stills-lib exactly the frames and the tall shape each scene declares", async () => {
    expect(sceneNames()).toEqual(Object.keys(SCENE_LOADERS).sort());
    for (const name of Object.keys(SCENE_LOADERS) as (keyof typeof SCENE_LOADERS)[]) {
      const mod = await SCENE_LOADERS[name]();
      const listed = (STILL_VARIANTS as Record<string, { frames: string[]; tall: boolean }>)[name] ?? { frames: [], tall: false };
      expect(Object.keys("STILL_FRAMES" in mod ? (mod.STILL_FRAMES ?? {}) : {}), name).toEqual(listed.frames);
      expect(("TALL_STILLS" in mod && mod.TALL_STILLS) === true, name).toBe(listed.tall);
    }
  });
});
