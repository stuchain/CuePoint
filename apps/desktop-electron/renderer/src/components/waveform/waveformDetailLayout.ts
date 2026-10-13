/**
 * The zoomed strip's decisions as numbers (T4), in the manner of
 * `waveformLayout.ts`: pure, so jsdom, which has no canvas, tests all of it.
 *
 * **The window.** About 8 s either side of a playhead that stays in the middle
 * of the strip, `DETAIL_SPAN_MS` in all. A strip `columns` units wide draws
 * `msPerColumn = span / columns` of music in each, one unit being one scale
 * pixel as it is everywhere else (`waveformUnit`).
 *
 * **World columns.** Column `w` is the time `w × msPerColumn`, whatever the
 * playhead does, so a column drawn once stays right while the strip scrolls.
 * Columns are drawn in tiles of `TILE_UNITS`; scrolling is one `drawImage` of
 * each tile under the strip at a whole-unit offset (`snapOffset`), which keeps
 * the pixel style.
 *
 * **The columns.** A picture of `rateHz` columns a second (the detail's 75, or
 * the overview stretched while the detail is made) drawn at more or fewer
 * columns a second than it has: finer repeats a sample, coarser takes each
 * span's highest value, so a peak is never lost.
 *
 * **The lines.** A line on every beat, a stronger one on each bar, from a
 * Rekordbox grid only: no marker, no line. `beats` is linear in the window, not
 * the track, since a grid can hold a marker on every beat.
 */
import type { BeatGridMarker } from "../../api/cuepointBridge.types";
import { BANDS, bandHeight, beatsPerBar, type PaintRect, type WaveformColourMode } from "./waveformLayout";

/** The music one strip shows by default: 8 s either side of the playhead. */
export const DETAIL_SPAN_MS = 16_000;

/** The spans the mouse wheel steps between, 4 s to 64 s (one notch is one stop). */
export const DETAIL_SPANS_MS: readonly number[] = [4, 6, 8, 12, 16, 24, 32, 48, 64].map((s) => s * 1000);

/**
 * The span `steps` stops from `spanMs`, clamped to the first and last stop. A
 * positive count zooms out (a longer span), a negative one in. A span that is
 * not a stop counts from the nearest one.
 */
export function nextSpan(spanMs: number, steps: number): number {
  const last = DETAIL_SPANS_MS.length - 1;
  let at = 0;
  DETAIL_SPANS_MS.forEach((stop, i) => {
    if (Math.abs(stop - spanMs) < Math.abs(DETAIL_SPANS_MS[at]! - spanMs)) at = i;
  });
  return DETAIL_SPANS_MS[Math.max(0, Math.min(last, at + Math.trunc(steps)))]!;
}

/** Trackpad pixels that make one stop once a gesture is under way. */
export const WHEEL_PIXELS_PER_STOP = 100;

/** A pause this long between wheel events ends a gesture. */
export const WHEEL_IDLE_MS = 180;

/** After a stop, events this soon after it are momentum and are dropped. */
export const WHEEL_SETTLE_MS = 120;

/**
 * Turns wheel events into stops of the span list. Wheel up (negative `deltaY`)
 * gives negative stops, zooming in. A mouse notch is 33 px on Windows, about 53
 * on Linux and a small accelerated delta on a Mac, so the first pixel event of
 * a gesture is one whole stop whatever its size; later ones in the same gesture
 * build up to `WHEEL_PIXELS_PER_STOP`, and the events just after a stop are
 * dropped so a trackpad's momentum does not run to 4 s or 64 s. A line or page
 * delta (`deltaMode` 1 or 2) is one stop an event. `now` is in ms.
 */
export function createWheelStepper(): (deltaY: number, deltaMode: number, now: number) => number {
  let carry = 0;
  let last = -Infinity;
  let lockedUntil = -Infinity;
  let direction = 0;
  return (deltaY, deltaMode, now) => {
    if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
    const sign = Math.sign(deltaY);
    const fresh = now - last > WHEEL_IDLE_MS || sign !== direction;
    last = now;
    direction = sign;
    if (deltaMode !== 0) return sign;
    if (fresh) {
      carry = 0;
      lockedUntil = now + WHEEL_SETTLE_MS;
      return sign;
    }
    if (now < lockedUntil) return 0;
    carry += deltaY;
    const steps = Math.trunc(carry / WHEEL_PIXELS_PER_STOP);
    if (steps === 0) return 0;
    carry -= steps * WHEEL_PIXELS_PER_STOP;
    lockedUntil = now + WHEEL_SETTLE_MS;
    return steps;
  };
}

/** Beats closer than this many columns are left out, the bar lines kept. */
export const BEAT_MIN_COLUMNS = 4;

/** Columns in one offscreen tile. */
export const TILE_UNITS = 512;

/** The window of music around a playhead, for a strip of `columns` units. */
export function detailWindow(
  centreMs: number,
  spanMs: number,
  columns: number,
): { fromMs: number; msPerColumn: number } {
  return { fromMs: centreMs - spanMs / 2, msPerColumn: columns > 0 ? spanMs / columns : spanMs };
}

/** A time as a whole number of columns: what the strip scrolls by. */
export function snapOffset(ms: number, msPerColumn: number): number {
  return msPerColumn > 0 ? Math.round(ms / msPerColumn) : 0;
}

/** One beat of a grid. */
export interface BeatLine {
  ms: number;
  /** The first beat of a bar. */
  downbeat: boolean;
}

/**
 * Every beat of `grid` from `fromMs` to `toMs`, in order, each marked if it
 * starts a bar. Each marker starts a run of beats at its tempo, `beat` being
 * where in the bar it falls, until half a beat before the next marker, or `durationMs`.
 */
export function beats(
  grid: readonly BeatGridMarker[],
  fromMs: number,
  toMs: number,
  durationMs = Number.POSITIVE_INFINITY,
): BeatLine[] {
  const markers = grid.filter((m) => Number.isFinite(m.start_ms) && m.bpm > 0);
  markers.sort((a, b) => a.start_ms - b.start_ms);
  const found: BeatLine[] = [];
  markers.forEach((marker, index) => {
    const beatMs = 60_000 / marker.bpm;
    // A run ends half a beat before the next marker, so a grid whose markers
    // drift a little off the previous run's beats does not draw two lines.
    const next = markers[index + 1]?.start_ms ?? Number.POSITIVE_INFINITY;
    const end = Math.min(durationMs - 1, next - beatMs / 2);
    const low = Math.max(fromMs, marker.start_ms, 0);
    const high = Math.min(toMs, end);
    if (high < low) return;
    const perBar = beatsPerBar(marker.meter);
    const first = marker.beat != null && marker.beat >= 1 && marker.beat <= perBar ? marker.beat : 1;
    let k = Math.max(0, Math.ceil((low - marker.start_ms) / beatMs - 1e-9));
    for (let at = marker.start_ms + k * beatMs; at <= high; at = marker.start_ms + ++k * beatMs) {
      found.push({ ms: at, downbeat: (first - 1 + k) % perBar === 0 });
    }
  });
  return found;
}

/** The tiles under a strip, and where each begins (in units from its left edge). */
export function detailView(
  centreMs: number,
  columns: number,
  tileColumns: number,
  msPerColumn: number,
): { worldLeft: number; tiles: { index: number; x: number }[] } {
  const worldLeft = snapOffset(centreMs, msPerColumn) - Math.floor(columns / 2);
  const tiles: { index: number; x: number }[] = [];
  if (columns <= 0 || tileColumns <= 0) return { worldLeft, tiles };
  const first = Math.max(0, Math.floor(worldLeft / tileColumns));
  const last = Math.floor((worldLeft + columns - 1) / tileColumns);
  for (let index = first; index <= last; index += 1) tiles.push({ index, x: index * tileColumns - worldLeft });
  return { worldLeft, tiles };
}

/** The time of a column of the strip, given the middle one is the centre. */
export function msAtColumn(column: number, midColumn: number, centreMs: number, msPerColumn: number): number {
  return centreMs + (column - midColumn) * msPerColumn;
}

/** A picture to draw from: columns of full, low, mid and high, `rateHz` a second. */
export interface DetailSource {
  data: Uint8Array;
  rateHz: number;
}

export interface DetailTileInput {
  source: DetailSource | null;
  /** The tile's number: it holds world columns from `index × columns`. */
  index: number;
  columns: number;
  /** Device pixels per column. */
  unit: number;
  /** The units tall the tile is. */
  rows: number;
  msPerColumn: number;
  mode: WaveformColourMode;
  grid?: readonly BeatGridMarker[];
  /** The track's length; the grid ends there. */
  durationMs?: number;
}

export interface DetailTile {
  /** In paint order: every low, then mid, then high (or mono). */
  bands: PaintRect[];
  /** A line on each beat, painted with the grid's token. */
  beats: PaintRect[];
  /** A stronger line on each bar's first beat: the grid's token, drawn at a higher alpha (never the playhead's paint). */
  bars: PaintRect[];
}

/** The rectangles of one tile, in its own device pixels. */
export function layoutDetailTile(input: DetailTileInput): DetailTile {
  const { source, index, columns, unit, rows, msPerColumn } = input;
  const tile: DetailTile = { bands: [], beats: [], bars: [] };
  if (columns <= 0 || rows <= 0 || unit <= 0 || !(msPerColumn > 0)) return tile;
  const half = Math.floor(rows / 2);
  const base = index * columns;

  const sourceColumns = source ? Math.floor(source.data.length / BANDS) : 0;
  if (source && sourceColumns > 0 && source.rateHz > 0) {
    const ratio = (source.rateHz * msPerColumn) / 1000;
    const drawn =
      input.mode === "single" ? [[0, "mono"] as const] : ([[1, "low"], [2, "mid"], [3, "high"]] as const);
    for (const [band, paint] of drawn) {
      for (let c = 0; c < columns; c += 1) {
        const world = base + c;
        if (world < 0) continue;
        const start = Math.floor(world * ratio);
        if (start >= sourceColumns) break;
        const end = Math.min(sourceColumns, Math.max(start + 1, Math.floor((world + 1) * ratio)));
        let peak = 0;
        for (let i = start; i < end; i += 1) {
          const value = source.data[i * BANDS + band] ?? 0;
          if (value > peak) peak = value;
        }
        const units = bandHeight(peak, half);
        if (units > 0) {
          tile.bands.push({ x: c * unit, y: (half - units) * unit, width: unit, height: 2 * units * unit, paint });
        }
      }
    }
  }

  if (input.grid && input.grid.length > 0) {
    const fromMs = base * msPerColumn;
    const toMs = (base + columns) * msPerColumn;
    const barColumns = new Set<number>();
    const beatColumns = new Set<number>();
    // Each line is thinned by the tempo of the marker whose run it belongs to,
    // not by its neighbours in this tile, so tile edges cannot change the result.
    const runs = input.grid
      .filter((m) => Number.isFinite(m.start_ms) && m.bpm > 0)
      .sort((x, y) => x.start_ms - y.start_ms);
    const tooTight = (ms: number): boolean => {
      let bpm = runs[0]?.bpm ?? 0;
      for (const run of runs) if (run.start_ms <= ms + 1e-6) bpm = run.bpm;
      return bpm > 0 && 60_000 / bpm < BEAT_MIN_COLUMNS * msPerColumn;
    };
    for (const line of beats(input.grid, fromMs, toMs, input.durationMs)) {
      // Too tight (64 s on a narrow strip): bar lines only, so the grid is never a solid fill.
      if (!line.downbeat && tooTight(line.ms)) continue;
      const c = Math.floor(line.ms / msPerColumn) - base;
      if (c < 0 || c >= columns) continue;
      (line.downbeat ? barColumns : beatColumns).add(c);
    }
    const lineAt = (c: number, paint: "grid"): PaintRect => ({
      x: c * unit,
      y: 0,
      width: unit,
      height: rows * unit,
      paint,
    });
    tile.bars = [...barColumns].sort((a, b) => a - b).map((c) => lineAt(c, "grid"));
    tile.beats = [...beatColumns]
      .filter((c) => !barColumns.has(c))
      .sort((a, b) => a - b)
      .map((c) => lineAt(c, "grid"));
  }
  return tile;
}
