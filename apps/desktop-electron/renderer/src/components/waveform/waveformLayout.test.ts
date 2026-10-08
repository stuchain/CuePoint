import { describe, expect, it } from "vitest";

import type { BeatGridMarker, TrackCue } from "../../api/cuepointBridge.types";
import fixture from "./waveforms.fixture.json";
import {
  BANDS,
  FLAG_HEIGHT,
  FLAG_MIN_ROWS,
  FLAG_WIDTH,
  GRID_MIN_SPACING,
  HOT_CUE_DEFAULT,
  bandHeight,
  beatsPerBar,
  columnAt,
  downbeats,
  gridStep,
  layoutWaveform,
  paintOrder,
  requestWidth,
  secondsAtOffset,
  waveformColumns,
  waveformUnit,
  type PaintRect,
  type WaveformLayoutInput,
} from "./waveformLayout";

/**
 * The waveform's layout (WAVE-05): every decision a drawing makes, tested
 * where jsdom can see it. The canvas only fills what this answers.
 */

/** A picture of `columns` columns, every band at `value`. */
function flat(columns: number, value = 128): Uint8Array {
  return new Uint8Array(columns * BANDS).fill(value);
}

/** A picture whose columns are given as [full, low, mid, high]. */
function picture(columns: readonly (readonly number[])[]): Uint8Array {
  return Uint8Array.from(columns.flat());
}

function input(overrides: Partial<WaveformLayoutInput> = {}): WaveformLayoutInput {
  return {
    data: flat(100),
    durationMs: 20_000,
    cssWidth: 100,
    cssHeight: 40,
    scale: 1,
    devicePixelRatio: 1,
    mode: "bands",
    ...overrides,
  };
}

function cue(overrides: Partial<TrackCue> = {}): TrackCue {
  return {
    kind: "cue",
    hot_cue: 0,
    start_ms: 5_000,
    end_ms: null,
    name: null,
    color: "#28e214",
    ...overrides,
  };
}

function marker(overrides: Partial<BeatGridMarker> = {}): BeatGridMarker {
  return { start_ms: 0, bpm: 120, meter: "4/4", beat: 1, ...overrides };
}

const paints = (rects: PaintRect[]) => rects.map((r) => r.paint);

describe("the grid of scale pixels", () => {
  it.each([
    [1, 1, 1],
    [2, 1, 2],
    [3, 1, 3],
    [1, 2, 2],
    [2, 2, 4],
    [3, 2, 6],
    [1, 1.5, 2],
    [1, 0, 1],
    [1.5, 1, 2],
    [1.5, 2, 3],
  ])("a unit at scale %s and ratio %f is %i device pixels", (scale, ratio, unit) => {
    expect(waveformUnit(scale, ratio)).toBe(unit);
  });

  it.each([
    [1, 1, 300],
    [2, 1, 150],
    [3, 1, 100],
    [1, 2, 300],
    [2, 2, 150],
    [3, 2, 100],
    [1.5, 1, 150],
    [1.5, 2, 200],
  ])("300 CSS pixels at scale %f and ratio %i draw %i columns", (scale, ratio, columns) => {
    expect(waveformColumns(300, scale, ratio)).toBe(columns);
    const layout = layoutWaveform(input({ cssWidth: 300, scale, devicePixelRatio: ratio }));
    expect(layout.columns).toBe(columns);
    expect(layout.width).toBe(300 * ratio);
    expect(layout.unit).toBe(waveformUnit(scale, ratio));
  });

  it.each([
    [1, 1],
    [2, 1],
    [3, 1],
    [1, 2],
    [2, 2],
    [3, 2],
  ])("at scale %i and ratio %i each column is one unit, side by side", (scale, ratio) => {
    const layout = layoutWaveform(input({ cssWidth: 120, scale, devicePixelRatio: ratio }));
    const lows = layout.bands.filter((r) => r.paint === "low");
    expect(lows).toHaveLength(layout.columns);
    lows.forEach((rect, c) => {
      expect(rect.x).toBe(c * layout.unit);
      expect(rect.width).toBe(layout.unit);
    });
  });

  it.each([1, 1.5, 2, 3])("heights snap to whole scale pixels at scale %f", (scale) => {
    const data = picture(Array.from({ length: 50 }, (_, i) => [i * 5, i * 5, i * 3, i]));
    for (const ratio of [1, 2, 1.25]) {
      const layout = layoutWaveform(input({ data, scale, devicePixelRatio: ratio, cssHeight: 47 }));
      const top = (layout.height - Math.floor(layout.height / layout.unit) * layout.unit) >> 1;
      for (const rect of layout.bands) {
        expect(rect.height % (2 * layout.unit)).toBe(0);
        expect((rect.y - top) % layout.unit).toBe(0);
        expect(rect.x % layout.unit).toBe(0);
      }
    }
  });

  it("asks for the columns a box draws, within the engine's 16 to 1,200", () => {
    expect(requestWidth(320, 2, 1)).toBe(160);
    expect(requestWidth(10, 3, 1)).toBe(16);
    expect(requestWidth(5_000, 1, 2)).toBe(1_200);
  });

  it("rounds a width up to a multiple of 16 columns, so a resize asks again only every 16", () => {
    // 150 columns at scale 2: 160.
    expect(requestWidth(300, 2, 1)).toBe(160);
    // Every width from 290 to 321 CSS pixels (145 to 160 columns) asks for one picture.
    const widths = new Set<number>();
    for (let css = 290; css <= 321; css += 1) widths.add(requestWidth(css, 2, 1));
    expect([...widths]).toEqual([160]);
    // 1.5 device pixels per CSS pixel at scale 2: a unit of 3, so 100 columns.
    expect(requestWidth(200, 2, 1.5)).toBe(112);
    for (const css of [48, 120, 333, 999, 2_400]) {
      for (const scale of [1, 1.5, 2, 3]) {
        for (const ratio of [1, 1.25, 2]) {
          const width = requestWidth(css, scale, ratio);
          expect(width % 16).toBe(0);
          expect(width).toBeGreaterThanOrEqual(
            Math.min(1_200, waveformColumns(css, scale, ratio)),
          );
          expect(width - waveformColumns(css, scale, ratio)).toBeLessThan(16);
        }
      }
    }
  });

  it("draws nothing in a box with no room, or from no picture", () => {
    expect(layoutWaveform(input({ cssWidth: 0 })).bands).toEqual([]);
    expect(layoutWaveform(input({ cssHeight: 0 })).bands).toEqual([]);
    expect(layoutWaveform(input({ data: new Uint8Array() })).bands).toEqual([]);
  });
});

describe("the bands", () => {
  it("draws each band from the centre line, up and down alike", () => {
    const layout = layoutWaveform(input({ data: picture([[255, 255, 0, 0]]), cssWidth: 1 }));
    const [low] = layout.bands;
    expect(low!.paint).toBe("low");
    expect(low!.height).toBe(2 * layout.half);
    expect(low!.y + low!.height / 2).toBe(layout.half);
  });

  it("gives silence no height and anything above it at least one unit", () => {
    expect(bandHeight(0, 20)).toBe(0);
    expect(bandHeight(1, 20)).toBe(1);
    expect(bandHeight(255, 20)).toBe(20);
    expect(bandHeight(128, 20)).toBe(10);
    expect(bandHeight(400, 20)).toBe(20);
  });

  it("layers low, then mid over it, then high over that, each its own height", () => {
    const data = picture([
      [250, 250, 150, 50],
      [200, 100, 200, 30],
    ]);
    const layout = layoutWaveform(input({ data, cssWidth: 2, cssHeight: 51 }));
    expect(paints(layout.bands)).toEqual(["low", "low", "mid", "mid", "high", "high"]);
    const height = (paint: string, x: number) =>
      layout.bands.find((r) => r.paint === paint && r.x === x)!.height / 2;
    expect(height("low", 0)).toBe(bandHeight(250, layout.half));
    expect(height("mid", 0)).toBe(bandHeight(150, layout.half));
    expect(height("high", 0)).toBe(bandHeight(50, layout.half));
    expect(height("mid", 1)).toBeGreaterThan(height("low", 1));
  });

  it("draws only the full band, in the one colour, when asked for one colour", () => {
    const data = picture([
      [250, 10, 10, 10],
      [0, 200, 200, 200],
    ]);
    const layout = layoutWaveform(input({ data, cssWidth: 2, mode: "single" }));
    expect(paints(layout.bands)).toEqual(["mono"]);
    expect(layout.bands[0]!.height / 2).toBe(bandHeight(250, layout.half));
  });

  it("keeps a single column's peak when the drawing is narrower than the picture", () => {
    const columns = Array.from({ length: 1_200 }, () => [10, 10, 10, 10]);
    columns[777] = [10, 255, 10, 10];
    const layout = layoutWaveform(input({ data: picture(columns), cssWidth: 100 }));
    const peak = layout.bands.filter((r) => r.paint === "low").sort((a, b) => b.height - a.height)[0]!;
    expect(peak.x).toBe(Math.floor((777 * 100) / 1_200));
    expect(peak.height / 2).toBe(layout.half);
  });

  it("repeats columns when the drawing is wider than the picture", () => {
    const data = picture(Array.from({ length: 16 }, (_, i) => [i * 16, i * 16, 0, 0]));
    const layout = layoutWaveform(input({ data, cssWidth: 64, cssHeight: 255 }));
    const lows = layout.bands.filter((r) => r.paint === "low");
    // Each of the 16 source columns is four drawing columns.
    for (let c = 4; c < 64; c += 1) {
      expect(lows.find((r) => r.x === c)!.height).toBe(
        lows.find((r) => r.x === Math.floor(c / 4) * 4)!.height,
      );
    }
  });

  it("draws the engine's own picture: each quarter loud in its own band", () => {
    const ready = fixture.batch.waveforms.find((t) => t.state === "ready")!;
    const data = Uint8Array.from(atob(ready.data!), (ch) => ch.charCodeAt(0));
    const layout = layoutWaveform(
      input({ data, durationMs: ready.duration_ms!, cssWidth: 120, cssHeight: 60 }),
    );
    const at = (paint: string, c: number) =>
      (layout.bands.find((r) => r.paint === paint && r.x === c)?.height ?? 0) / 2;
    for (const [band, from] of [
      ["low", 5],
      ["mid", 35],
      ["high", 65],
    ] as const) {
      for (let c = from; c < from + 20; c += 1) {
        const others = (["low", "mid", "high"] as const).filter((b) => b !== band);
        for (const other of others) expect(at(band, c)).toBeGreaterThan(at(other, c));
      }
    }
    for (let c = 95; c < 115; c += 1) {
      expect(Math.min(at("low", c), at("mid", c), at("high", c))).toBeGreaterThan(layout.half * 0.8);
    }
  });
});

describe("the played part and the planned times", () => {
  it("dims exactly the columns before the playhead, as tall as their tallest band", () => {
    const data = picture(Array.from({ length: 100 }, (_, i) => [i, i, i >> 1, i >> 2]));
    const layout = layoutWaveform(input({ data, playheadMs: 10_000, cssHeight: 255 }));
    expect(layout.playheadColumn).toBe(50);
    const played = layout.played;
    expect(played.every((r) => r.paint === "played")).toBe(true);
    expect(Math.max(...played.map((r) => r.x))).toBe(49);
    for (const rect of played) {
      const tallest = Math.max(
        ...layout.bands.filter((r) => r.x === rect.x).map((r) => r.height),
      );
      expect(rect.height).toBe(tallest);
    }
    expect(layout.playhead).toEqual({
      x: 50,
      y: 0,
      width: 1,
      height: 255,
      paint: "playhead",
    });
  });

  it("dims nothing at the start and everything at the end", () => {
    expect(layoutWaveform(input({ playheadMs: 0 })).played).toEqual([]);
    const end = layoutWaveform(input({ playheadMs: 20_000 }));
    expect(end.played).toHaveLength(100);
    expect(end.playheadColumn).toBe(99);
  });

  it("draws no playhead without a position", () => {
    const layout = layoutWaveform(input());
    expect(layout.playhead).toBeNull();
    expect(layout.playheadColumn).toBeNull();
  });

  it("dims what lies before the planned in and after the planned out", () => {
    const layout = layoutWaveform(input({ inMs: 2_000, outMs: 18_000, scale: 2, cssWidth: 200 }));
    expect(layout.outside).toEqual([
      { x: 0, y: 0, width: 20, height: 40, paint: "played" },
      { x: 180, y: 0, width: 20, height: 40, paint: "played" },
    ]);
  });

  it("dims nothing outside times that span the whole track", () => {
    expect(layoutWaveform(input({ inMs: 0, outMs: 20_000 })).outside).toEqual([]);
  });
});

describe("cues and loops", () => {
  it("places a cue at the column of its time", () => {
    expect(columnAt(5_000, 20_000, 100)).toBe(25);
    expect(columnAt(-10, 20_000, 100)).toBe(0);
    expect(columnAt(25_000, 20_000, 100)).toBe(99);
    const layout = layoutWaveform(input({ cues: [cue({ start_ms: 5_000 })], scale: 2, cssWidth: 200 }));
    const [line] = layout.cues[0]!.rects;
    expect(layout.cues[0]!.column).toBe(25);
    expect(line).toMatchObject({ x: 50, width: 2, y: 0, height: 40 });
  });

  it("draws a hot cue in its colour, with Rekordbox's green when it has none", () => {
    const layout = layoutWaveform(
      input({ cues: [cue({ color: "#FF8C00" }), cue({ hot_cue: 1, start_ms: 9_000, color: null })] }),
    );
    expect(layout.cues.map((c) => c.letter)).toEqual(["A", "B"]);
    expect(layout.cues[0]!.rects[0]!.paint).toBe("#ff8c00");
    expect(layout.cues[1]!.rects[0]!.paint).toBe(HOT_CUE_DEFAULT);
  });

  it("draws a memory cue as a neutral line, under every hot cue", () => {
    const layout = layoutWaveform(
      input({ cues: [cue({ start_ms: 1_000 }), cue({ hot_cue: null, start_ms: 2_000, color: "#ff0000" })] }),
    );
    expect(layout.cues.map((c) => c.letter)).toEqual([null, "A"]);
    expect(layout.cues[0]!.rects).toEqual([
      expect.objectContaining({ paint: "memory-cue", x: 10 }),
    ]);
  });

  it("flags a hot cue with its letter above, in a colour that reads on it", () => {
    const layout = layoutWaveform(input({ cues: [cue({ hot_cue: 2, color: "#000080" })], cssHeight: FLAG_MIN_ROWS }));
    const [line, flag, ...letter] = layout.cues[0]!.rects;
    expect(line!.paint).toBe("#000080");
    expect(flag).toEqual({ x: 25, y: 0, width: FLAG_WIDTH, height: FLAG_HEIGHT, paint: "#000080" });
    expect(letter.length).toBeGreaterThan(0);
    expect(letter.every((r) => r.paint === "#ffffff")).toBe(true);
    // "C": the top row's two lit pixels are one run, one unit in from the flag.
    expect(letter[0]).toEqual({ x: 27, y: 1, width: 2, height: 1, paint: "#ffffff" });
    const light = layoutWaveform(input({ cues: [cue({ color: "#f0f0f0" })] }));
    expect(light.cues[0]!.rects.slice(2).every((r) => r.paint === "#000000")).toBe(true);
  });

  it("keeps a flag inside the drawing at the right edge", () => {
    const layout = layoutWaveform(input({ cues: [cue({ start_ms: 19_990 })] }));
    const flag = layout.cues[0]!.rects[1]!;
    expect(flag.x + flag.width).toBe(100);
    expect(layout.cues[0]!.rects[0]!.x).toBe(99);
  });

  it("draws no flag where the drawing is too short, or when told not to", () => {
    const short = layoutWaveform(input({ cues: [cue()], cssHeight: FLAG_MIN_ROWS - 1 }));
    expect(short.cues[0]!.rects).toHaveLength(1);
    const told = layoutWaveform(input({ cues: [cue()], cueLabels: false }));
    expect(told.cues[0]!.rects).toHaveLength(1);
  });

  it("tints a loop's span in its colour, and draws its line too", () => {
    const layout = layoutWaveform(
      input({ cues: [cue({ kind: "loop", start_ms: 4_000, end_ms: 6_000, color: "#ff8c00" })] }),
    );
    expect(layout.loops).toEqual([{ x: 20, y: 0, width: 11, height: 40, paint: "#ff8c00" }]);
    expect(layout.cues[0]!.column).toBe(20);
  });

  it("tints a loop without a colour neutrally, and ignores one with no end", () => {
    const layout = layoutWaveform(
      input({
        cues: [
          cue({ kind: "loop", hot_cue: null, start_ms: 4_000, end_ms: 4_100, color: null }),
          cue({ kind: "loop", start_ms: 8_000, end_ms: null }),
        ],
      }),
    );
    expect(layout.loops).toEqual([{ x: 20, y: 0, width: 1, height: 40, paint: "memory-cue" }]);
  });

  it("draws no cue on a picture without a length", () => {
    expect(layoutWaveform(input({ durationMs: 0, cues: [cue()] })).cues).toEqual([]);
  });
});

describe("the beat grid", () => {
  it("reads the beats in a bar from the meter, four when unreadable", () => {
    expect(beatsPerBar("4/4")).toBe(4);
    expect(beatsPerBar("3/4")).toBe(3);
    expect(beatsPerBar("7/8")).toBe(7);
    expect(beatsPerBar(null)).toBe(4);
    expect(beatsPerBar("")).toBe(4);
    expect(beatsPerBar("x/4")).toBe(4);
    expect(beatsPerBar("0/4")).toBe(4);
  });

  it("finds every downbeat from the grid's first", () => {
    expect(downbeats([marker()], 10_000)).toEqual([0, 2_000, 4_000, 6_000, 8_000]);
  });

  it("starts at the next downbeat when the marker is on another beat", () => {
    expect(downbeats([marker({ beat: 3 })], 6_000)).toEqual([1_000, 3_000, 5_000]);
    expect(downbeats([marker({ beat: 2, meter: "3/4" })], 4_000)).toEqual([1_000, 2_500]);
  });

  it("follows a grid that changes tempo, counting no downbeat twice", () => {
    const grid = [marker({ start_ms: 0, bpm: 120 }), marker({ start_ms: 8_000, bpm: 60 })];
    expect(downbeats(grid, 20_000)).toEqual([0, 2_000, 4_000, 6_000, 8_000, 12_000, 16_000]);
  });

  it("orders markers by time, whatever order they came in", () => {
    const grid = [marker({ start_ms: 8_000, bpm: 60 }), marker({ start_ms: 0, bpm: 120 })];
    expect(downbeats(grid, 12_000)).toEqual([0, 2_000, 4_000, 6_000, 8_000]);
  });

  it.each([
    [6, 1],
    [5.99, 4],
    [1.5, 4],
    [1.49, 8],
    [0.75, 8],
    [0.74, 16],
    [0.375, 16],
    [0.374, 32],
    [0.1875, 32],
    [0.18, null],
  ])("with bars %f columns apart, a line every %s bars", (spacing, step) => {
    // A 20-second track over 100 columns: a column is 200 ms.
    expect(gridStep(spacing * 200, 20_000, 100)).toBe(step);
  });

  it("draws a line every bar while bars are at least six units apart", () => {
    const layout = layoutWaveform(input({ grid: [marker()] }));
    expect(GRID_MIN_SPACING).toBe(6);
    expect(layout.gridEvery).toBe(1);
    expect(layout.grid.map((r) => r.x)).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(layout.grid.every((r) => r.paint === "grid" && r.height === 40 && r.width === 1)).toBe(true);
  });

  it("thins the lines to every 4 bars from the first downbeat when bars crowd", () => {
    const layout = layoutWaveform(input({ grid: [marker()], cssWidth: 30 }));
    expect(layout.gridEvery).toBe(4);
    expect(layout.grid.map((r) => r.x)).toEqual([0, 12, 24]);
  });

  it("judges a variable grid by its shortest bar", () => {
    const grid = [marker({ bpm: 60 }), marker({ start_ms: 10_000, bpm: 240 })];
    // At 240 BPM a bar is 1 s, five columns: too close for every bar.
    expect(layoutWaveform(input({ grid })).gridEvery).toBe(4);
  });

  it("draws no lines when even 32 bars are too close", () => {
    const layout = layoutWaveform(input({ grid: [marker({ bpm: 200 })], durationMs: 3_600_000 }));
    expect(layout.gridEvery).toBeNull();
    expect(layout.grid).toEqual([]);
  });

  it("draws no lines for a track without a grid", () => {
    const layout = layoutWaveform(input({ grid: [] }));
    expect(layout.grid).toEqual([]);
    expect(layout.gridEvery).toBeNull();
    expect(downbeats([], 10_000)).toEqual([]);
  });
});

describe("the order a canvas paints", () => {
  it("is grid, bands, loops, played, outside, cues, then the playhead", () => {
    const layout = layoutWaveform(
      input({
        grid: [marker()],
        cues: [cue(), cue({ kind: "loop", hot_cue: null, start_ms: 1_000, end_ms: 3_000 })],
        playheadMs: 10_000,
        inMs: 1_000,
      }),
    );
    const order = paintOrder(layout);
    expect(order.map((step) => step.rects[0]?.paint)).toEqual([
      "grid",
      "low",
      "#28e214",
      "played",
      "played",
      "memory-cue",
      "playhead",
    ]);
    expect(order.map((step) => step.translucent)).toEqual([false, false, true, false, false, false, false]);
  });
});

describe("the time under a pointer (WAVE-06)", () => {
  it("is the fraction of the width, of the duration", () => {
    expect(secondsAtOffset(0, 600, 6)).toBe(0);
    expect(secondsAtOffset(200, 600, 6)).toBe(2);
    expect(secondsAtOffset(600, 600, 6)).toBe(6);
  });

  it("is held within the drawing", () => {
    expect(secondsAtOffset(-5, 600, 6)).toBe(0);
    expect(secondsAtOffset(700, 600, 6)).toBe(6);
  });

  it("is 0 for a drawing with no width or no duration", () => {
    expect(secondsAtOffset(10, 0, 6)).toBe(0);
    expect(secondsAtOffset(10, 600, 0)).toBe(0);
    expect(secondsAtOffset(10, 600, Number.NaN)).toBe(0);
  });

  it("lands in the column whose time it names, at every scale and ratio", () => {
    for (const scale of [1, 2, 3]) {
      for (const ratio of [1, 1.5, 2]) {
        const cssWidth = 500;
        const columns = waveformColumns(cssWidth, scale, ratio);
        const unit = scale * ratio;
        for (const column of [0, 1, Math.floor(columns / 3), columns - 1]) {
          // The middle of the column, in CSS pixels.
          const offset = ((column + 0.5) * Math.round(unit)) / ratio;
          const seconds = secondsAtOffset(offset, (columns * Math.round(unit)) / ratio, 300);
          expect(columnAt(seconds * 1000, 300_000, columns)).toBe(column);
        }
      }
    }
  });
});
