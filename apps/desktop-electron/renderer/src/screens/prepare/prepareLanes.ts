/**
 * The Set's shape as two lanes of whole pixels (PREP-11, DEC-111).
 *
 * **Tempo**: one column per entry, in order, each entry a flat mark at the
 * height of its BPM, joined to the next by a vertical step. A half- or
 * double-time change is drawn as the step it is; the transition column already
 * says why it mixes.
 *
 * **Key**: each entry's place on the Camelot wheel, one row per code from 1A
 * at the bottom to 12B at the top, so a relative key is one row away and a
 * step on the wheel two. Neighbours are joined by a line whose style says how
 * their keys relate, in the words the warnings use: solid for the same key or
 * one step, dashed for the relative key, dotted for a clash.
 *
 * An unknown value is a gap, never a zero (DEC-111): no mark, and no line into
 * or out of it. A chapter boundary is a line across both lanes.
 *
 * Every value drawn is the engine's (`SetAnalysis.shape`): the BPM each check
 * compared, each key's place on the wheel and each transition's relation. Nothing
 * here parses a key or judges one, so a lane cannot disagree with a warning.
 * Everything here is pure geometry, in whole pixels, for `SetLanes` to draw as
 * rectangles the way `PixelIcon` draws.
 */
import type { SetKeyRelation, SetShape } from "../../api/cuepointBridge.types";
import { formatBpm } from "../discover/similarReasons";
import { keyRelationWords } from "./prepareSource";

/** A rectangle in whole pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How a line between two keys is drawn: the relation, or a clash. */
export type KeyLinkStyle = SetKeyRelation | "clash";

interface KeyLink {
  /** The entry the line leads into. */
  toEntryId: number;
  style: KeyLinkStyle;
  rects: Rect[];
}

interface LaneColumn {
  entryId: number;
  index: number;
  x: number;
  width: number;
  /** "3 · Half Time · 63 BPM · 9A": what a column's title says. */
  label: string;
}

interface LaneLayout {
  /** Each entry's column width, and the whole drawing's width. */
  columnWidth: number;
  width: number;
  tempoHeight: number;
  keyHeight: number;
  /** The key lane's top, below the tempo lane and the gap between them. */
  keyTop: number;
  height: number;
  tempo: {
    marks: Rect[];
    steps: Rect[];
    /** The lowest and highest BPM drawn, or null when no entry has one. */
    range: { min: number; max: number } | null;
  };
  key: {
    marks: (Rect & { entryId: number; code: string })[];
    links: KeyLink[];
  };
  /** Where one chapter ends and the next begins. */
  boundaries: (Rect & { chapterId: number })[];
  columns: LaneColumn[];
}

/** The wheel's rows: 1A at the bottom to 12B at the top. */
export const KEY_ROWS = 24;
/**
 * The tempo lane's rows: enough to tell a step from a jump, and two lines of
 * the gutter's words tall. Every row the lanes take is a row of the Set's
 * table they hide at the default size (DEC-112).
 */
export const TEMPO_ROWS = 20;
/** The narrowest column, in unscaled pixels: a mark and a gap either side. */
export const MIN_COLUMN = 3;
/** The widest, so a Set of four is not four slabs across the page. */
export const MAX_COLUMN = 48;
/** The space between the two lanes, in unscaled pixels. */
export const LANE_GAP = 2;

/** Where a Camelot code sits: rows from the bottom, B above A. */
export function keyRow(number: number, letter: "A" | "B"): number {
  return (number - 1) * 2 + (letter === "B" ? 1 : 0);
}

/** A column's width for `count` entries across `available` pixels at `scale`. */
export function columnWidth(count: number, available: number, scale: number): number {
  const unit = Math.max(1, Math.round(scale));
  if (count <= 0) return MAX_COLUMN * unit;
  const fit = Math.floor(available / count);
  return Math.min(MAX_COLUMN * unit, Math.max(MIN_COLUMN * unit, fit));
}

/** A vertical run from `top` to `bottom` at `x`, `thick` wide, in the style asked. */
function verticalRun(
  x: number,
  top: number,
  bottom: number,
  thick: number,
  style: KeyLinkStyle,
): Rect[] {
  const height = bottom - top;
  if (height <= 0) return [];
  if (style === "same" || style === "adjacent") return [{ x, y: top, width: thick, height }];
  // Dashed: two on, one off. Dotted: one on, one off.
  const [on, off] = style === "relative" ? [2 * thick, thick] : [thick, thick];
  const rects: Rect[] = [];
  for (let y = top; y < bottom; y += on + off) {
    rects.push({ x, y, width: thick, height: Math.min(on, bottom - y) });
  }
  return rects;
}

/**
 * The line from one column's mark at `from` into the next's at `to`, across
 * the boundary at `x`: out of the left mark, along the boundary, into the
 * right mark. `inset` is the air a mark leaves at each side of its column.
 */
export function join(
  x: number,
  from: number,
  to: number,
  inset: number,
  unit: number,
  style: KeyLinkStyle,
): Rect[] {
  if (from === to) {
    return inset > 0 ? [{ x: x - inset, y: to, width: 2 * inset, height: unit }] : [];
  }
  const rects: Rect[] = [];
  if (inset > 0) rects.push({ x: x - inset, y: from, width: inset, height: unit });
  rects.push(...verticalRun(x, Math.min(from, to), Math.max(from, to) + unit, unit, style));
  if (inset > 0) rects.push({ x, y: to, width: inset, height: unit });
  return rects;
}

/**
 * The lanes for a Set's shape.
 *
 * @param shape The engine's shape: every entry in order, and each transition.
 * @param titles Each entry's title, for its column's label.
 * @param available The width the lanes have, in pixels.
 * @param scale The design system's integer scale.
 */
export function laneLayout(
  shape: SetShape,
  titles: ReadonlyMap<number, string>,
  available: number,
  scale: number,
): LaneLayout {
  const unit = Math.max(1, Math.round(scale));
  const points = shape.entries;
  const cw = columnWidth(points.length, available, unit);
  const width = cw * points.length;
  const tempoHeight = TEMPO_ROWS * unit;
  const keyHeight = KEY_ROWS * unit;
  const keyTop = tempoHeight + LANE_GAP * unit;
  // A mark leaves one pixel of air at each side of its column, when there is room.
  const inset = cw >= 3 * unit ? unit : 0;
  const markWidth = cw - 2 * inset;

  // --- tempo
  const known = points.map((p) => p.bpm).filter((bpm): bpm is number => bpm != null);
  const range = known.length > 0 ? { min: Math.min(...known), max: Math.max(...known) } : null;
  const tempoY = (bpm: number): number => {
    if (!range || range.max === range.min) return Math.floor((TEMPO_ROWS - 1) / 2) * unit;
    const fraction = (range.max - bpm) / (range.max - range.min);
    return Math.round(fraction * (TEMPO_ROWS - 1)) * unit;
  };
  const tempoMarks: Rect[] = [];
  const tempoSteps: Rect[] = [];
  points.forEach((point, index) => {
    if (point.bpm == null) return;
    const y = tempoY(point.bpm);
    tempoMarks.push({ x: index * cw + inset, y, width: markWidth, height: unit });
    const previous = index > 0 ? points[index - 1].bpm : null;
    if (previous == null) return;
    tempoSteps.push(...join(index * cw, tempoY(previous), y, inset, unit, "same"));
  });

  // --- key
  const keyY = (number: number, letter: "A" | "B") =>
    keyTop + (KEY_ROWS - 1 - keyRow(number, letter)) * unit;
  const keyMarks: LaneLayout["key"]["marks"] = [];
  points.forEach((point, index) => {
    if (!point.camelot) return;
    keyMarks.push({
      entryId: point.entry_id,
      code: `${point.camelot.number}${point.camelot.letter}`,
      x: index * cw + inset,
      y: keyY(point.camelot.number, point.camelot.letter),
      width: markWidth,
      height: unit,
    });
  });
  const relationInto = new Map(shape.transitions.map((t) => [t.to_entry_id, t.key_relation]));
  const links: KeyLink[] = [];
  points.forEach((point, index) => {
    const previous = index > 0 ? points[index - 1] : null;
    if (!previous?.camelot || !point.camelot) return;
    const style: KeyLinkStyle = relationInto.get(point.entry_id) ?? "clash";
    const from = keyY(previous.camelot.number, previous.camelot.letter);
    const to = keyY(point.camelot.number, point.camelot.letter);
    const rects = join(index * cw, from, to, inset, unit, style);
    links.push({ toEntryId: point.entry_id, style, rects });
  });

  // --- chapters and columns
  const height = keyTop + keyHeight;
  const boundaries: LaneLayout["boundaries"] = [];
  points.forEach((point, index) => {
    if (index > 0 && points[index - 1].chapter_id !== point.chapter_id) {
      boundaries.push({ x: index * cw, y: 0, width: unit, height, chapterId: point.chapter_id });
    }
  });
  const columns: LaneColumn[] = points.map((point, index) => ({
    entryId: point.entry_id,
    index,
    x: index * cw,
    width: cw,
    label: columnLabel(index, titles.get(point.entry_id) ?? "", point.bpm, point.key, point.camelot),
  }));

  return {
    columnWidth: cw,
    width,
    tempoHeight,
    keyHeight,
    keyTop,
    height,
    tempo: { marks: tempoMarks, steps: tempoSteps, range },
    key: { marks: keyMarks, links },
    boundaries,
    columns,
  };
}

/** A column's title: its place, its track and the two values drawn. */
export function columnLabel(
  index: number,
  title: string,
  bpm: number | null,
  key: string | null,
  camelot: { number: number; letter: "A" | "B" } | null,
): string {
  const tempo = bpm == null ? "no BPM" : `${formatBpm(bpm)} BPM`;
  let wheel = "no key";
  if (camelot) {
    const code = `${camelot.number}${camelot.letter}`;
    wheel = key && key !== code ? `${code} (${key})` : code;
  }
  return `${index + 1} · ${title} · ${tempo} · ${wheel}`;
}

/** What a line into an entry means, for its title. */
export function linkWords(style: KeyLinkStyle): string {
  return keyRelationWords(style === "clash" ? null : style);
}

/** The tempo lane's range in words: "120–146 BPM", or "No BPMs". */
export function rangeText(range: { min: number; max: number } | null): string {
  if (!range) return "No BPMs";
  if (range.min === range.max) return `${formatBpm(range.min)} BPM`;
  return `${formatBpm(range.min)}–${formatBpm(range.max)}`;
}
