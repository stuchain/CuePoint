import { describe, expect, it } from "vitest";

import type { BeatGridMarker } from "../../api/cuepointBridge.types";
import {
  DETAIL_SPAN_MS,
  beats,
  detailView,
  detailWindow,
  layoutDetailTile,
  msAtColumn,
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

  it("offsets a later tile and leaves silence past the data", () => {
    const tile = layoutDetailTile({ ...base, index: 1, columns: 4 });
    // Tile 1 holds world columns 4-7: past the four samples.
    expect(tile.bands).toEqual([]);
  });

  it("puts a line on every beat and a stronger one on each bar", () => {
    const grid = [marker(0, 120)];
    // 250 ms a column: a beat every 2 columns, a bar every 8.
    const tile = layoutDetailTile({ ...base, columns: 16, grid });
    expect(tile.bars.map((r) => r.x)).toEqual([0, 16]);
    expect(tile.beats.map((r) => r.x)).toEqual([4, 8, 12, 20, 24, 28]);
    expect(tile.bars[0]).toEqual({ x: 0, y: 0, width: 2, height: 20, paint: "grid" });
    expect(tile.beats[0]).toEqual({ x: 4, y: 0, width: 2, height: 20, paint: "grid" });
    // The playhead's paint is the centre line's alone.
    expect([...tile.bars, ...tile.beats].some((r) => r.paint === "playhead")).toBe(false);
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
