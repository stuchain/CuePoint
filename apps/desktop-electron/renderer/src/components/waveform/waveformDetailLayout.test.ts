import { describe, expect, it } from "vitest";

import type { BeatGridMarker } from "../../api/cuepointBridge.types";
import {
  BEAT_MIN_COLUMNS,
  WHEEL_IDLE_MS,
  WHEEL_SETTLE_MS,
  createWheelStepper,
  DETAIL_SPANS_MS,
  DETAIL_SPAN_MS,
  beats,
  detailView,
  detailWindow,
  layoutDetailTile,
  msAtColumn,
  nextSpan,
  snapOffset,
} from "./waveformDetailLayout";

/**
 * The zoomed strip's decisions as numbers (T4): the window, every beat and
 * downbeat of a grid, the columns a tile draws, and the time a click means.
 */

const marker = (start_ms: number, bpm: number, beat: number | null = 1, meter = "4/4"): BeatGridMarker => ({
  start_ms,
  bpm,
  beat,
  meter,
});

describe("detailWindow", () => {
  it("centres the span on the playhead", () => {
    const window = detailWindow(60_000, DETAIL_SPAN_MS, 1_200);
    expect(window.fromMs).toBe(52_000);
    expect(window.msPerColumn).toBeCloseTo(13.3333, 3);
  });

  it("starts before zero at the start of a track", () => {
    expect(detailWindow(2_000, 16_000, 800).fromMs).toBe(-6_000);
  });
});

describe("snapOffset", () => {
  it("rounds to whole columns", () => {
    expect(snapOffset(100, 13.3333)).toBe(8);
    expect(snapOffset(0, 13.3333)).toBe(0);
    expect(snapOffset(6, 13.3333)).toBe(0);
    expect(snapOffset(7, 13.3333)).toBe(1);
  });
});

describe("beats", () => {
  it("marks every beat and each bar's first", () => {
    const found = beats([marker(1_000, 120)], 1_000, 3_000);
    expect(found).toEqual([
      { ms: 1_000, downbeat: true },
      { ms: 1_500, downbeat: false },
      { ms: 2_000, downbeat: false },
      { ms: 2_500, downbeat: false },
      { ms: 3_000, downbeat: true },
    ]);
  });

  it("counts from the beat of the bar the marker is", () => {
    const found = beats([marker(0, 120, 3)], 0, 2_000);
    expect(found.filter((b) => b.downbeat).map((b) => b.ms)).toEqual([1_000]);
    expect(found).toHaveLength(5);
  });

  it("follows a tempo change, each marker owning its own run", () => {
    const found = beats([marker(0, 120), marker(4_000, 60)], 3_500, 6_000);
    expect(found).toEqual([
      { ms: 3_500, downbeat: false },
      { ms: 4_000, downbeat: true },
      { ms: 5_000, downbeat: false },
      { ms: 6_000, downbeat: false },
    ]);
  });

  it("ends a run half a beat before the next marker, so a drifting grid draws no doubled line", () => {
    // 500 ms a beat: the run's 4_000 beat and the next marker's 4_040 would be 40 ms apart.
    const drift = beats([marker(0, 120), marker(4_040, 120)], 3_000, 5_000);
    expect(drift.map((b) => b.ms)).toEqual([3_000, 3_500, 4_040, 4_540]);
    // A beat a full half beat or more before the next marker stays.
    const clear = beats([marker(0, 120), marker(4_300, 120)], 3_000, 4_500);
    expect(clear.map((b) => b.ms)).toEqual([3_000, 3_500, 4_000, 4_300]);
  });

  it("does not guess before the first marker, or past the track's end", () => {
    expect(beats([marker(10_000, 120)], 0, 9_000)).toEqual([]);
    expect(beats([marker(0, 120)], 0, 5_000, 1_200).map((b) => b.ms)).toEqual([0, 500, 1_000]);
  });

  it("is none for no grid or a grid of no tempo", () => {
    expect(beats([], 0, 10_000)).toEqual([]);
    expect(beats([marker(0, 0)], 0, 10_000)).toEqual([]);
  });

  it("reads a three-beat meter", () => {
    const found = beats([marker(0, 120, 1, "3/4")], 0, 3_000);
    expect(found.filter((b) => b.downbeat).map((b) => b.ms)).toEqual([0, 1_500, 3_000]);
  });

  it("stays within the window for a grid of a marker on every beat", () => {
    const grid = Array.from({ length: 4_000 }, (_, i) => marker(i * 500, 120, (i % 4) + 1));
    const found = beats(grid, 100_000, 116_000);
    expect(found.length).toBeGreaterThan(30);
    expect(found.length).toBeLessThanOrEqual(33);
    expect(found.every((b) => b.ms >= 100_000 && b.ms <= 116_000)).toBe(true);
    expect(found.filter((b) => b.downbeat).map((b) => b.ms % 2_000)).toEqual(
      found.filter((b) => b.downbeat).map(() => 0),
    );
  });
});

describe("detailView", () => {
  it("names the tiles under the strip, and where each starts", () => {
    // 1,000 columns, 10 ms each; the playhead at 20 s is column 2,000.
    const view = detailView(20_000, 1_000, 512, 10);
    expect(view.worldLeft).toBe(1_500);
    expect(view.tiles).toEqual([
      { index: 2, x: -(1_500 - 1_024) },
      { index: 3, x: 1_536 - 1_500 },
      { index: 4, x: 2_048 - 1_500 },
    ]);
  });

  it("leaves out tiles before the start of the track", () => {
    const view = detailView(0, 200, 512, 10);
    expect(view.worldLeft).toBe(-100);
    expect(view.tiles.map((t) => t.index)).toEqual([0]);
    expect(view.tiles[0]!.x).toBe(100);
  });
});

describe("msAtColumn", () => {
  it("is the centre at the middle column and a column's time either side", () => {
    expect(msAtColumn(500, 500, 30_000, 10)).toBe(30_000);
    expect(msAtColumn(600, 500, 30_000, 10)).toBe(31_000);
    expect(msAtColumn(0, 500, 30_000, 10)).toBe(25_000);
  });
});

describe("layoutDetailTile", () => {
  // Four columns a second at 250 ms: each column's full, low, mid, high.
  const data = new Uint8Array([
    200, 255, 0, 0, //
    200, 0, 128, 0, //
    200, 0, 0, 64, //
    0, 0, 0, 0,
  ]);
  const base = { source: { data, rateHz: 4 }, index: 0, columns: 8, unit: 2, rows: 10, msPerColumn: 250, mode: "bands" as const };

  it("draws each band from the centre line, a column per unit", () => {
    const tile = layoutDetailTile(base);
    const low = tile.bands.filter((r) => r.paint === "low");
    expect(low).toEqual([{ x: 0, y: 0, width: 2, height: 20, paint: "low" }]);
    const mid = tile.bands.filter((r) => r.paint === "mid");
    expect(mid).toEqual([{ x: 2, y: 5 * 2 - 3 * 2, width: 2, height: 12, paint: "mid" }]);
    expect(tile.bands.filter((r) => r.paint === "high")).toHaveLength(1);
    expect(tile.bands.filter((r) => r.x >= 6)).toEqual([]);
  });

  it("draws the full band alone in one colour", () => {
    const tile = layoutDetailTile({ ...base, mode: "single" });
    expect(tile.bands.map((r) => r.paint)).toEqual(["mono", "mono", "mono"]);
  });

  it("takes the highest of a span when a column spans several samples", () => {
    const tile = layoutDetailTile({ ...base, msPerColumn: 500, columns: 2 });
    // Column 0 spans samples 0-1: low 255 from the first.
    expect(tile.bands.find((r) => r.x === 0 && r.paint === "low")?.height).toBe(20);
    // Column 1 spans samples 2-3: only a high of 64.
    expect(tile.bands.some((r) => r.x === 2 && r.paint === "low")).toBe(false);
  });

  it("repeats a sample over the columns it spans when drawn finer than it was made", () => {
    const tile = layoutDetailTile({ ...base, msPerColumn: 125, columns: 8 });
    const low = tile.bands.filter((r) => r.paint === "low").map((r) => r.x);
    expect(low).toEqual([0, 2]);
  });

  it("slopes between samples instead of stepping when the stand-in is smoothed", () => {
    const ramp = new Uint8Array([0, 0, 0, 0, 0, 100, 0, 0, 0, 200, 0, 0]);
    const wide = { ...base, source: { data: ramp, rateHz: 4, smooth: true }, msPerColumn: 25, columns: 30, unit: 1, rows: 400 };
    const steps = (smooth: boolean) =>
      new Set(
        layoutDetailTile({ ...wide, source: { ...wide.source, smooth } })
          .bands.filter((r) => r.paint === "low")
          .map((r) => r.height),
      ).size;
    // Unsmoothed, the three samples are three heights; smoothed, a ramp of many.
    expect(steps(false)).toBeLessThanOrEqual(2);
    expect(steps(true)).toBeGreaterThan(8);
    const heights = layoutDetailTile(wide)
      .bands.filter((r) => r.paint === "low")
      .map((r) => r.height);
    // No jump between neighbouring columns beyond the ramp's own slope.
    for (let i = 1; i < heights.length; i += 1) expect(Math.abs(heights[i]! - heights[i - 1]!)).toBeLessThan(40);
  });

  it("leaves a smoothed source alone when it is drawn coarser than it was made", () => {
    const plain = layoutDetailTile({ ...base, msPerColumn: 500, columns: 2 });
    const smooth = layoutDetailTile({ ...base, source: { ...base.source, smooth: true }, msPerColumn: 500, columns: 2 });
    expect(smooth).toEqual(plain);
  });

  it("offsets a later tile and leaves silence past the data", () => {
    const tile = layoutDetailTile({ ...base, index: 1, columns: 4 });
    // Tile 1 holds world columns 4-7: past the four samples.
    expect(tile.bands).toEqual([]);
  });

  it("puts a line on every beat and a stronger one on each bar", () => {
    const grid = [marker(0, 60)];
    // 250 ms a column: a beat every 4 columns, a bar every 16.
    const tile = layoutDetailTile({ ...base, columns: 32, grid });
    expect(tile.bars.map((r) => r.x)).toEqual([0, 32]);
    expect(tile.beats.map((r) => r.x)).toEqual([8, 16, 24, 40, 48, 56]);
    expect(tile.bars[0]).toEqual({ x: 0, y: 0, width: 2, height: 20, paint: "grid" });
    expect(tile.beats[0]).toEqual({ x: 8, y: 0, width: 2, height: 20, paint: "grid" });
    // The playhead's paint is the centre line's alone.
    expect([...tile.bars, ...tile.beats].some((r) => r.paint === "playhead")).toBe(false);
  });

  it("draws bar lines only when beats are fewer than 4 columns apart, by the marker's tempo", () => {
    expect(BEAT_MIN_COLUMNS).toBe(4);
    const grid = [marker(0, 60)];
    // 1000 ms a beat: 4 columns at 250 ms keeps the beats, a little finer drops them.
    expect(layoutDetailTile({ ...base, columns: 32, grid, msPerColumn: 250 }).beats.length).toBeGreaterThan(0);
    const dense = layoutDetailTile({ ...base, columns: 32, grid, msPerColumn: 256 });
    expect(dense.beats).toEqual([]);
    expect(dense.bars.length).toBeGreaterThan(0);
  });

  it("thins each run by its own tempo, and the same whichever tile the lines fall in", () => {
    // 60 bpm to 8 s, then 240 bpm (250 ms a beat: under 4 columns at 100 ms a column).
    const grid = [marker(0, 60), marker(8_000, 240)];
    const at = (index: number) =>
      layoutDetailTile({ ...base, index, columns: 100, msPerColumn: 100, grid });
    const first = at(0);
    expect(first.beats.map((r) => r.x / 2)).toContain(10);
    const second = at(1);
    expect(second.beats).toEqual([]);
    expect(second.bars.length).toBeGreaterThan(0);
    // A tile boundary in the middle of the slow run does not thin it.
    const split = layoutDetailTile({ ...base, index: 3, columns: 20, msPerColumn: 100, grid: [marker(0, 60)] });
    expect(split.beats.length).toBeGreaterThan(0);
  });

  it("draws no lines without a grid", () => {
    const tile = layoutDetailTile(base);
    expect(tile.beats).toEqual([]);
    expect(tile.bars).toEqual([]);
  });

  it("is empty with nothing to draw", () => {
    expect(layoutDetailTile({ ...base, source: null }).bands).toEqual([]);
    expect(layoutDetailTile({ ...base, rows: 0 }).bands).toEqual([]);
  });
});

describe("nextSpan", () => {
  it("steps between the stops, 4 s to 64 s, the default being one of them", () => {
    expect(DETAIL_SPANS_MS).toEqual([4, 6, 8, 12, 16, 24, 32, 48, 64].map((s) => s * 1000));
    expect(DETAIL_SPANS_MS).toContain(DETAIL_SPAN_MS);
    expect(nextSpan(16_000, 1)).toBe(24_000);
    expect(nextSpan(16_000, -1)).toBe(12_000);
    expect(nextSpan(16_000, 2)).toBe(32_000);
  });

  it("clamps at both ends", () => {
    expect(nextSpan(4_000, -1)).toBe(4_000);
    expect(nextSpan(64_000, 1)).toBe(64_000);
    expect(nextSpan(16_000, 99)).toBe(64_000);
    expect(nextSpan(16_000, -99)).toBe(4_000);
  });

  it("counts from the nearest stop when the span is not one", () => {
    expect(nextSpan(15_000, 1)).toBe(24_000);
    expect(nextSpan(16_000, 0)).toBe(16_000);
  });
});

describe("createWheelStepper", () => {
  it("is one stop a notch, up zooming in, whatever the notch's size", () => {
    for (const notch of [100, 53, 33, 4]) {
      const step = createWheelStepper();
      expect(step(notch, 0, 1_000)).toBe(1);
      expect(step(-notch, 0, 2_000)).toBe(-1);
      // Each a new gesture after the pause, so the same again.
      expect(step(-notch, 0, 3_000)).toBe(-1);
    }
  });

  it("builds the rest of a gesture up to 100 px a stop, after the settle", () => {
    const step = createWheelStepper();
    expect(step(33, 0, 0)).toBe(1);
    // Inside the settle: dropped, not built up.
    expect(step(33, 0, WHEEL_SETTLE_MS - 20)).toBe(0);
    let t = WHEEL_SETTLE_MS + 10;
    const stops: number[] = [];
    for (let i = 0; i < 7; i += 1) stops.push(step(33, 0, (t += 20)));
    // 33, 66, 99, 132 is a stop; the three after it fall in the settle and are dropped.
    expect(stops).toEqual([0, 0, 0, 1, 0, 0, 0]);
  });

  it("stops a trackpad's momentum from running through the stops", () => {
    const step = createWheelStepper();
    let total = 0;
    // A 4 px stream every 16 ms for a second, tailing off: well under 100 px a stop.
    for (let t = 0; t < 1_000; t += 16) total += step(4, 0, t);
    expect(total).toBeGreaterThanOrEqual(1);
    expect(total).toBeLessThanOrEqual(6);
  });

  it("starts afresh after an idle pause, dropping the carry", () => {
    const step = createWheelStepper();
    step(10, 0, 0);
    step(40, 0, 200);
    expect(step(40, 0, 200 + WHEEL_SETTLE_MS + 1)).toBe(0);
    expect(step(5, 0, 200 + WHEEL_SETTLE_MS + 1 + WHEEL_IDLE_MS + 1)).toBe(1);
  });

  it("counts a change of direction as a new gesture", () => {
    const step = createWheelStepper();
    expect(step(10, 0, 0)).toBe(1);
    expect(step(-10, 0, 10)).toBe(-1);
  });

  it("counts a line or page delta as one notch an event", () => {
    const step = createWheelStepper();
    expect(step(3, 1, 0)).toBe(1);
    expect(step(3, 1, 10)).toBe(1);
    expect(step(-1, 2, 20)).toBe(-1);
  });

  it("ignores no movement", () => {
    expect(createWheelStepper()(0, 0, 0)).toBe(0);
  });
});
