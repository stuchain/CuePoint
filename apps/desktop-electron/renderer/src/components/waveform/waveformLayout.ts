/**
 * A waveform as rectangles of whole device pixels (WAVE-05, fact 8).
 *
 * Every decision about a drawing is made here, in the manner of
 * `prepareLanes.ts`, so jsdom, which has no canvas, can test all of it:
 * `WaveformCanvas` only fills what this answers, in the order it answers it.
 *
 * **The grid.** The drawing is laid on the app's pixel grid: one *unit* is one
 * scale pixel, `--scale` CSS pixels, so `scale × devicePixelRatio` device
 * pixels. Each column is one unit wide and every height a whole number of
 * units, so a waveform is as crisp as the rest of the pixel style at every
 * scale and on every display.
 *
 * **The bands.** Each column holds four bytes: the full band, then low, mid and
 * high, each `round(255 × √v)` (WAVE-02). Drawn from the centre line, up and
 * down alike. "Three bands" draws low, then mid over it, then high over that,
 * each its own height, as Rekordbox's three-band view does; "One colour" draws
 * the full band alone. A drawing with more columns than the picture repeats
 * them, and one with fewer takes each span's highest value, so a peak is never
 * lost to a narrow box. Anything above silence is at least one unit tall.
 *
 * **On the bands,** in this order: the beat grid behind them; loops tinted
 * over them; the played part, and what lies outside a planned in and out time,
 * dimmed; then each cue's line, a hot cue's letter in a flag of its colour, and
 * the playhead over everything.
 *
 * **The grid's density.** A line every bar while bars stay at least six units
 * apart, else every 4, 8, 16 or 32 bars, counted from the grid's first
 * downbeat; no lines at all when even 32 bars are closer than that. A variable
 * grid is judged by its shortest bar.
 */
import type { BeatGridMarker, TrackCue } from "../../api/cuepointBridge.types";

/** "Three bands" or "One colour" (DEC-117). */
export type WaveformColourMode = "bands" | "single";

/**
 * What a rectangle is filled with: a theme token's name, or a cue's own
 * `#rrggbb`. The canvas maps each name to `--waveform-<name>`, and `playhead`
 * to `--fg-primary`.
 */
export type WaveformPaint =
  | "low"
  | "mid"
  | "high"
  | "mono"
  | "played"
  | "grid"
  | "memory-cue"
  | "playhead"
  | `#${string}`;

/** A rectangle in whole device pixels. */
export interface PaintRect {
  x: number;
  y: number;
  width: number;
  height: number;
  paint: WaveformPaint;
}

/** One cue as drawn: its line, and for a hot cue its lettered flag. */
export interface CueMarker {
  /** Its column, from 0. */
  column: number;
  /** The hot cue's letter, A–H, or null for a memory cue. */
  letter: string | null;
  /** Its line, then its flag and the flag's letter when there is room. */
  rects: PaintRect[];
}

export interface WaveformLayoutInput {
  /** `columns × 4` bytes: full, low, mid, high (WAVE-02). */
  data: Uint8Array;
  /** The length the picture spans. */
  durationMs: number;
  /** The box, in CSS pixels. */
  cssWidth: number;
  cssHeight: number;
  /** The app's integer scale (`--scale`). */
  scale: number;
  devicePixelRatio: number;
  mode: WaveformColourMode;
  /** The track's cues and grid, if they are to be drawn. */
  cues?: readonly TrackCue[];
  grid?: readonly BeatGridMarker[];
  /** Where playback is; the part before it is drawn dimmer. */
  playheadMs?: number | null;
  /** A planned in and out time; what lies outside them is dimmed. */
  inMs?: number | null;
  outMs?: number | null;
  /** Draw hot cues' lettered flags where there is room; true unless said. */
  cueLabels?: boolean;
}

export interface WaveformLayout {
  /** The canvas, in device pixels. */
  width: number;
  height: number;
  /** Device pixels per scale pixel. */
  unit: number;
  /** Columns drawn, each one unit wide. */
  columns: number;
  /** The units above and below the centre line a full value reaches. */
  half: number;
  grid: PaintRect[];
  /** Bars per grid line (1, 4, 8, 16 or 32), or null when none are drawn. */
  gridEvery: number | null;
  /** In paint order: every low, then every mid, then every high (or mono). */
  bands: PaintRect[];
  loops: PaintRect[];
  played: PaintRect[];
  outside: PaintRect[];
  cues: CueMarker[];
  playhead: PaintRect | null;
  /** The playhead's column, or null without a playhead. */
  playheadColumn: number | null;
}

/** Bytes per column: full, low, mid, high. */
export const BANDS = 4;

/** Grid lines are never closer than this, in scale pixels. */
export const GRID_MIN_SPACING = 6;

/** The bars a grid line may stand for, in the order they are tried. */
export const GRID_STEPS = [1, 4, 8, 16, 32] as const;

/** Rekordbox's own colour for a hot cue it gave none. */
export const HOT_CUE_DEFAULT = "#28e214";

/** A letter is 3 × 5 scale pixels; its flag adds one on every side. */
export const GLYPH_WIDTH = 3;
export const GLYPH_HEIGHT = 5;
export const FLAG_WIDTH = GLYPH_WIDTH + 2;
export const FLAG_HEIGHT = GLYPH_HEIGHT + 2;

/** Flags are drawn only where the drawing is at least this many units tall. */
export const FLAG_MIN_ROWS = FLAG_HEIGHT * 2;

/** The hot cues' letters, A–H, as rows of lit scale pixels. */
const GLYPHS: Record<string, readonly string[]> = {
  A: [".#.", "#.#", "###", "#.#", "#.#"],
  B: ["##.", "#.#", "##.", "#.#", "##."],
  C: [".##", "#..", "#..", "#..", ".##"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  E: ["###", "#..", "##.", "#..", "###"],
  F: ["###", "#..", "##.", "#..", "#.."],
  G: [".##", "#..", "#.#", "#.#", ".##"],
  H: ["#.#", "#.#", "###", "#.#", "#.#"],
};

const LETTERS = "ABCDEFGH";

/** Device pixels per scale pixel: never below one. */
export function waveformUnit(scale: number, devicePixelRatio: number): number {
  return Math.max(1, Math.round(scale * (devicePixelRatio > 0 ? devicePixelRatio : 1)));
}

/** The columns a box of `cssWidth` CSS pixels draws. */
export function waveformColumns(cssWidth: number, scale: number, devicePixelRatio: number): number {
  const width = Math.max(0, Math.round(cssWidth * (devicePixelRatio > 0 ? devicePixelRatio : 1)));
  return Math.floor(width / waveformUnit(scale, devicePixelRatio));
}

/** The narrowest and widest picture the engine answers (WAVE-02). */
export const MIN_REQUEST_WIDTH = 16;
export const MAX_REQUEST_WIDTH = 1200;

/** Request widths are whole multiples of this many columns (WAVE-06). */
export const REQUEST_WIDTH_STEP = 16;

/**
 * The picture to ask for to fill a box: its columns rounded up to a multiple of
 * 16, within the engine's range. Rounded so that dragging a column, the
 * Inspector or the window wider asks again every 16 columns rather than at
 * every pixel; the layout draws the few extra columns by their peaks.
 */
export function requestWidth(cssWidth: number, scale: number, devicePixelRatio: number): number {
  const columns = waveformColumns(cssWidth, scale, devicePixelRatio);
  const rounded = Math.ceil(columns / REQUEST_WIDTH_STEP) * REQUEST_WIDTH_STEP;
  return Math.min(MAX_REQUEST_WIDTH, Math.max(MIN_REQUEST_WIDTH, rounded));
}

/** The units a byte reaches from the centre line: 0 only for silence. */
export function bandHeight(value: number, half: number): number {
  if (value <= 0 || half <= 0) return 0;
  return Math.max(1, Math.round((Math.min(255, value) / 255) * half));
}

/** The beats in a bar, from a meter as Rekordbox writes it ("4/4"); 4 when unreadable. */
export function beatsPerBar(meter: string | null | undefined): number {
  const top = Number.parseInt((meter ?? "").split("/")[0] ?? "", 10);
  return Number.isInteger(top) && top >= 1 && top <= 32 ? top : 4;
}

/**
 * Every downbeat of a grid, in milliseconds, in order, before `durationMs`.
 *
 * Each marker starts a run of beats at its tempo, `beat` being where in the
 * bar it falls, until the next marker. A downbeat within a millisecond of the
 * next marker is the next marker's, so a re-anchored grid does not count it
 * twice.
 */
export function downbeats(grid: readonly BeatGridMarker[], durationMs: number): number[] {
  const markers = [...grid]
    .filter((m) => Number.isFinite(m.start_ms) && m.bpm > 0)
    .sort((a, b) => a.start_ms - b.start_ms);
  const found: number[] = [];
  markers.forEach((marker, index) => {
    const end = Math.min(durationMs, markers[index + 1]?.start_ms ?? durationMs);
    const beatMs = 60_000 / marker.bpm;
    const perBar = beatsPerBar(marker.meter);
    const beat = marker.beat != null && marker.beat >= 1 && marker.beat <= perBar ? marker.beat : 1;
    let at = marker.start_ms + ((perBar - beat + 1) % perBar) * beatMs;
    while (at < end - 1) {
      if (at >= 0) found.push(at);
      at += perBar * beatMs;
    }
  });
  return found;
}

/** The shortest bar of a grid, in milliseconds, or null without one. */
function shortestBar(grid: readonly BeatGridMarker[]): number | null {
  let shortest: number | null = null;
  for (const marker of grid) {
    if (!(marker.bpm > 0)) continue;
    const bar = (60_000 / marker.bpm) * beatsPerBar(marker.meter);
    if (shortest === null || bar < shortest) shortest = bar;
  }
  return shortest;
}

/**
 * Bars per grid line: the fewest of 1, 4, 8, 16 and 32 that keeps lines at
 * least `GRID_MIN_SPACING` columns apart, or null when none does.
 */
export function gridStep(barMs: number, durationMs: number, columns: number): number | null {
  if (!(barMs > 0) || !(durationMs > 0) || columns <= 0) return null;
  const spacing = (barMs / durationMs) * columns;
  for (const step of GRID_STEPS) {
    if (step * spacing >= GRID_MIN_SPACING) return step;
  }
  return null;
}

/** The column a time falls in, within the drawing. */
export function columnAt(ms: number, durationMs: number, columns: number): number {
  if (columns <= 0) return 0;
  if (!(durationMs > 0)) return 0;
  const column = Math.floor((ms / durationMs) * columns);
  return Math.min(columns - 1, Math.max(0, column));
}

/**
 * The time a pointer `offsetX` CSS pixels into a drawing `width` wide means,
 * in seconds of `durationSeconds`: the inverse of `columnAt`, for a click that
 * seeks (WAVE-06). 0 for a drawing with no width or no duration.
 */
export function secondsAtOffset(offsetX: number, width: number, durationSeconds: number): number {
  if (!(width > 0) || !(durationSeconds > 0)) return 0;
  const fraction = Math.min(1, Math.max(0, offsetX / width));
  return fraction * durationSeconds;
}

/** Black or white, whichever reads on `hex`. */
function letterPaint(hex: string): WaveformPaint {
  const n = hex.replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(n)) return "#000000";
  const [r, g, b] = [0, 2, 4].map((i) => Number.parseInt(n.slice(i, i + 2), 16) / 255);
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
  return luminance > 0.45 ? "#000000" : "#ffffff";
}

/** A cue's own colour, when it is one a canvas can fill with. */
function cuePaint(color: string | null | undefined, fallback: WaveformPaint): WaveformPaint {
  return color && /^#[0-9a-fA-F]{6}$/.test(color) ? (color.toLowerCase() as WaveformPaint) : fallback;
}

/** A letter's lit pixels as rectangles, one per run in each row. */
function glyphRects(letter: string, x: number, y: number, unit: number, paint: WaveformPaint): PaintRect[] {
  const rows = GLYPHS[letter];
  if (!rows) return [];
  const rects: PaintRect[] = [];
  rows.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (row[c] !== "#") {
        c += 1;
        continue;
      }
      let end = c;
      while (end < row.length && row[end] === "#") end += 1;
      rects.push({ x: x + c * unit, y: y + r * unit, width: (end - c) * unit, height: unit, paint });
      c = end;
    }
  });
  return rects;
}

const EMPTY: Omit<WaveformLayout, "width" | "height" | "unit"> = {
  columns: 0,
  half: 0,
  grid: [],
  gridEvery: null,
  bands: [],
  loops: [],
  played: [],
  outside: [],
  cues: [],
  playhead: null,
  playheadColumn: null,
};

/** Lay a waveform out in whole device pixels; see the module's notes. */
export function layoutWaveform(input: WaveformLayoutInput): WaveformLayout {
  const ratio = input.devicePixelRatio > 0 ? input.devicePixelRatio : 1;
  const width = Math.max(0, Math.round(input.cssWidth * ratio));
  const height = Math.max(0, Math.round(input.cssHeight * ratio));
  const unit = waveformUnit(input.scale, ratio);
  const columns = Math.floor(width / unit);
  const rows = Math.floor(height / unit);
  const sourceColumns = Math.floor(input.data.length / BANDS);
  if (columns <= 0 || rows <= 0 || sourceColumns <= 0) {
    return { ...EMPTY, width, height, unit };
  }

  const top = Math.floor((height - rows * unit) / 2);
  const half = Math.floor(rows / 2);
  const centre = top + half * unit;
  const fullHeight = rows * unit;
  const duration = input.durationMs > 0 ? input.durationMs : 0;
  const column = (ms: number) => columnAt(ms, duration, columns);
  const line = (c: number, paint: WaveformPaint): PaintRect => ({
    x: c * unit,
    y: top,
    width: unit,
    height: fullHeight,
    paint,
  });

  // Each column's value per band: the highest over its span of the picture.
  const heights: number[][] = [[], [], [], []];
  for (let c = 0; c < columns; c += 1) {
    const start = Math.floor((c * sourceColumns) / columns);
    const end = Math.max(start + 1, Math.floor(((c + 1) * sourceColumns) / columns));
    for (let band = 0; band < BANDS; band += 1) {
      let peak = 0;
      for (let i = start; i < end; i += 1) {
        const value = input.data[i * BANDS + band] ?? 0;
        if (value > peak) peak = value;
      }
      heights[band]![c] = bandHeight(peak, half);
    }
  }

  const span = (c: number, units: number, paint: WaveformPaint): PaintRect => ({
    x: c * unit,
    y: centre - units * unit,
    width: unit,
    height: 2 * units * unit,
    paint,
  });
  const bands: PaintRect[] = [];
  const drawn = input.mode === "single" ? [[0, "mono"] as const] : ([[1, "low"], [2, "mid"], [3, "high"]] as const);
  for (const [band, paint] of drawn) {
    for (let c = 0; c < columns; c += 1) {
      const units = heights[band]![c]!;
      if (units > 0) bands.push(span(c, units, paint));
    }
  }
  const tallest = (c: number) =>
    input.mode === "single"
      ? heights[0]![c]!
      : Math.max(heights[1]![c]!, heights[2]![c]!, heights[3]![c]!);

  // The grid, behind the bands.
  const grid: PaintRect[] = [];
  let gridEvery: number | null = null;
  const markers = input.grid ?? [];
  const bar = shortestBar(markers);
  if (bar !== null && duration > 0) {
    gridEvery = gridStep(bar, duration, columns);
    if (gridEvery !== null) {
      const every = gridEvery;
      const seen = new Set<number>();
      downbeats(markers, duration).forEach((at, index) => {
        if (index % every !== 0) return;
        const c = column(at);
        if (seen.has(c)) return;
        seen.add(c);
        grid.push(line(c, "grid"));
      });
    }
  }

  // Loops, tinted over the bands.
  const loops: PaintRect[] = [];
  const cues = duration > 0 ? (input.cues ?? []) : [];
  for (const cue of cues) {
    if (cue.kind !== "loop" || cue.end_ms == null || cue.end_ms <= cue.start_ms) continue;
    const from = column(cue.start_ms);
    const to = Math.max(from, column(cue.end_ms));
    loops.push({
      x: from * unit,
      y: top,
      width: (to - from + 1) * unit,
      height: fullHeight,
      paint: cuePaint(cue.color, "memory-cue"),
    });
  }

  // The played part, and what lies outside the planned times, dimmed.
  const played: PaintRect[] = [];
  let playheadColumn: number | null = null;
  let playhead: PaintRect | null = null;
  if (input.playheadMs != null && Number.isFinite(input.playheadMs) && duration > 0) {
    const through = Math.min(columns, Math.max(0, Math.floor((input.playheadMs / duration) * columns)));
    for (let c = 0; c < through; c += 1) {
      const units = tallest(c);
      if (units > 0) played.push(span(c, units, "played"));
    }
    playheadColumn = Math.min(columns - 1, through);
    playhead = line(playheadColumn, "playhead");
  }
  const outside: PaintRect[] = [];
  if (duration > 0 && input.inMs != null && input.inMs > 0) {
    const to = Math.min(columns, Math.floor((input.inMs / duration) * columns));
    if (to > 0) outside.push({ x: 0, y: top, width: to * unit, height: fullHeight, paint: "played" });
  }
  if (duration > 0 && input.outMs != null && input.outMs < duration) {
    const from = Math.max(0, Math.ceil((input.outMs / duration) * columns));
    if (from < columns) {
      outside.push({ x: from * unit, y: top, width: (columns - from) * unit, height: fullHeight, paint: "played" });
    }
  }

  // Each cue's line, and a hot cue's lettered flag where there is room.
  const labels = input.cueLabels !== false && rows >= FLAG_MIN_ROWS && columns >= FLAG_WIDTH;
  const markersOut: CueMarker[] = [];
  const ordered = [...cues].sort(
    (a, b) => Number(a.hot_cue !== null) - Number(b.hot_cue !== null) || a.start_ms - b.start_ms,
  );
  for (const cue of ordered) {
    const c = column(cue.start_ms);
    const letter = cue.hot_cue !== null ? (LETTERS[cue.hot_cue] ?? null) : null;
    const paint: WaveformPaint = letter ? cuePaint(cue.color, HOT_CUE_DEFAULT as WaveformPaint) : "memory-cue";
    const rects: PaintRect[] = [line(c, paint)];
    if (letter && labels) {
      const flagColumn = Math.min(c, columns - FLAG_WIDTH);
      const x = flagColumn * unit;
      rects.push({ x, y: top, width: FLAG_WIDTH * unit, height: FLAG_HEIGHT * unit, paint });
      rects.push(...glyphRects(letter, x + unit, top + unit, unit, letterPaint(paint)));
    }
    markersOut.push({ column: c, letter, rects });
  }

  return {
    width,
    height,
    unit,
    columns,
    half,
    grid,
    gridEvery,
    bands,
    loops,
    played,
    outside,
    cues: markersOut,
    playhead,
    playheadColumn,
  };
}

/** Every rectangle of a layout, in the order a canvas paints them. */
export function paintOrder(layout: WaveformLayout): { rects: PaintRect[]; translucent: boolean }[] {
  return [
    { rects: layout.grid, translucent: false },
    { rects: layout.bands, translucent: false },
    { rects: layout.loops, translucent: true },
    { rects: layout.played, translucent: false },
    { rects: layout.outside, translucent: false },
    { rects: layout.cues.flatMap((cue) => cue.rects), translucent: false },
    { rects: layout.playhead ? [layout.playhead] : [], translucent: false },
  ];
}
