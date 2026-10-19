/**
 * Layout maths for the Universal Track Table (LIBUI-04, DEC-041).
 *
 * Pure functions, no React and no DOM beyond one CSS-variable read, so the
 * arithmetic that decides how wide a column is can be tested without rendering
 * anything — the split the Results table's layout module established, and the
 * reason its clamping never regressed.
 *
 * Two things are deliberately different from that module, which this was
 * extracted from rather than replacing (DEC-041); it retired with the Results
 * screen in CLEAN-14:
 *
 * **Widths are keyed by column id, not by position.** The results table stores
 * an array indexed by column, which is correct only while the column order is
 * fixed. DEC-042 lets a user reorder columns, and an array of widths would then
 * silently apply the artist column's width to whatever moved into slot two.
 *
 * **Every size is stated before scale.** A column declares 120 CSS pixels and
 * the scale multiplies it, so the same table is legible at 1×, 2× and 3×
 * without three sets of numbers.
 */
import { useMemo, type ReactNode } from "react";

import { useRowDensity } from "../../tokens/rowDensity";
import { useScaleFactor } from "../../tokens/ScaleContext";

/** Qt-style minimum column width in CSS pixels, before scale. */
export const COLUMN_MIN_PX = 80;

/** What a column gets when it declares no width of its own and has no entry below. */
export const COLUMN_DEFAULT_PX = 120;

/**
 * One default width per column id, before scale, shared by every table (C210). These are the
 * Library table's, which the other tables mirror; a column that declares its own
 * `defaultWidthPx` still wins, but should not need to.
 */
export const DEFAULT_WIDTH_PX_BY_ID: Readonly<Record<string, number>> = {
  title: 220,
  artist: 170,
  remixer: 140,
  key: 70,
  bpm: 72,
  duration_seconds: 76,
  genre: 130,
  label: 140,
  rating: 92,
  album: 170,
  year: 72,
  play_count: 72,
  date_added: 110,
  colour: 90,
  bitrate: 82,
  comment: 180,
  file_path: 240,
  match_state: 150,
  match_score: 72,
  file_status: 110,
  artwork: 64,
  waveform: 120,
  loudness: 72,
};

/**
 * How the room left over in a wide table is shared (C210): Title most, then Artist, then the other
 * words; numbers keep the width they have. A column's own `grow` wins.
 */
export const GROW_WEIGHTS: Readonly<Record<string, number>> = {
  title: 3,
  artist: 2,
  album: 1,
  label: 1,
  genre: 1,
};

/** Fallback row height, in CSS pixels, when no stylesheet has loaded. */
export const ROW_HEIGHT_FALLBACK = 26;

type ColumnAlign = "left" | "right";

/**
 * One column of a track table.
 *
 * Generic in the row type: the library table renders `LibraryTrackRow`, and
 * Phase 7's match results render their own shape through the same component.
 * That is what "universal" has to mean to be worth the name.
 */
export interface TrackColumnDef<Row> {
  /** Stable across renames and reorders; what a persisted layout stores. */
  id: string;
  /** What the header shows. */
  header: string;
  /**
   * The header is drawn as nothing but still named `header` for a screen
   * reader: a column of icon buttons (the Discover preview cell).
   */
  headerHidden?: boolean;
  /**
   * What the column means, when its header alone does not say: shown on hover
   * and on keyboard focus (DEC-201's "Keys come from Beatport matches").
   */
  hint?: string;
  /**
   * The engine's sort name for this column. Absent means the column cannot be
   * sorted by — which is how "playlist position, outside a playlist" is
   * expressed, rather than by a rule the table has to know.
   */
  sortKey?: string;
  minWidthPx?: number;
  defaultWidthPx?: number;
  align?: ColumnAlign;
  /** Pinned to the left edge while the table scrolls sideways. */
  sticky?: boolean;
  /** How much of a wide table's spare room this column takes, against the others (0 takes none). */
  grow?: number;
  /**
   * Not shown until a user asks for it (DEC-042). A table that opened on every
   * column it has would be a wall; the picker is where the rest live, and once
   * chosen the choice is remembered.
   */
  hiddenByDefault?: boolean;
  /**
   * The value the column sorts by, for a column the engine cannot sort (Key and BPM in a list the
   * page holds). A column with an `accessor` and no `sortKey` can be sorted in the table, over the
   * rows it has; empty values go last (C193).
   */
  accessor?: (row: Row) => string | number | null | undefined;
  /** What the cell shows. Given the row; never given the index. */
  render: (row: Row) => ReactNode;
  /**
   * What the cell says as text, for a copy, when `render` draws more than
   * text — a value with a marker beside it, a picture. Absent means the
   * rendered text is the text.
   */
  text?: (row: Row) => string;
  /**
   * For a column whose text is not in the row (WAVE-08's loudness, read from
   * the waveform store): read it for the rows a copy holds, and answer each
   * row's text. A copy awaits it before it writes; `text` is not used then.
   */
  gatherText?: (rows: readonly Row[]) => Promise<(row: Row) => string>;
}

/** Column widths in CSS pixels, keyed by column id. */
export type ColumnWidths = Record<string, number>;

export function columnMinWidth(
  column: Pick<TrackColumnDef<unknown>, "minWidthPx">,
  scale: number,
): number {
  return Math.round((column.minWidthPx ?? COLUMN_MIN_PX) * scale);
}

export function columnDefaultWidth(
  column: Pick<TrackColumnDef<unknown>, "minWidthPx" | "defaultWidthPx"> & { id?: string },
  scale: number,
): number {
  const shared = column.id === undefined ? undefined : DEFAULT_WIDTH_PX_BY_ID[column.id];
  const declared = (column.defaultWidthPx ?? shared ?? COLUMN_DEFAULT_PX) * scale;
  return Math.max(columnMinWidth(column, scale), Math.round(declared));
}

export function defaultWidths<Row>(
  columns: readonly TrackColumnDef<Row>[],
  scale: number,
): ColumnWidths {
  const widths: ColumnWidths = {};
  for (const column of columns) {
    widths[column.id] = columnDefaultWidth(column, scale);
  }
  return widths;
}

/**
 * Resolve stored widths against the columns actually being rendered.
 *
 * A column with no stored width gets its default, a stored width narrower than
 * the minimum is raised, and a stored width for a column that no longer exists
 * is dropped. Without that last part, renaming a column leaves a user with a
 * layout that can never be corrected — which is the failure LIBUI-06's
 * persistence would otherwise ship.
 */
export function resolveWidths<Row>(
  columns: readonly TrackColumnDef<Row>[],
  stored: ColumnWidths | undefined,
  scale: number,
): ColumnWidths {
  const widths: ColumnWidths = {};
  for (const column of columns) {
    const candidate = stored?.[column.id];
    widths[column.id] =
      typeof candidate === "number" && Number.isFinite(candidate)
        ? Math.max(columnMinWidth(column, scale), Math.round(candidate))
        : columnDefaultWidth(column, scale);
  }
  return widths;
}

/** Widths in column order, for the grid template and the sticky offsets. */
export function orderedWidths<Row>(
  columns: readonly TrackColumnDef<Row>[],
  widths: ColumnWidths,
  scale: number,
): number[] {
  return columns.map(
    (column) => widths[column.id] ?? columnDefaultWidth(column, scale),
  );
}

/**
 * The grid's columns. The last one is `minmax(width, 1fr)`: its width is the least it takes, and it
 * takes what the table has left over, so a table wider than its columns draws no sideways scroll
 * bar and no empty strip after the last column. A table narrower than its columns is as before.
 */
export function gridTemplate(widths: number[]): string {
  const last = widths.length - 1;
  return widths
    .map((width, index) => (index === last ? `minmax(${Math.round(width)}px, 1fr)` : `${Math.round(width)}px`))
    .join(" ");
}

/**
 * The widths with a wide table's spare room shared out by grow weight (C210): `room` is the width
 * the columns may fill. Returns the widths unchanged when there is no room, no spare, or no column
 * that grows. Whole pixels; the heaviest column takes the remainder, so the total is exactly `room`.
 */
export function growWidths<Row>(
  columns: readonly TrackColumnDef<Row>[],
  widths: number[],
  room: number,
): number[] {
  const spare = Math.floor(room) - widths.reduce((sum, width) => sum + width, 0);
  if (!(room > 0) || spare <= 0) return widths;
  const weights = columns.map((column) => column.grow ?? GROW_WEIGHTS[column.id] ?? 0);
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return widths;
  const shares = weights.map((weight) => Math.floor((spare * weight) / sum));
  const left = spare - shares.reduce((a, b) => a + b, 0);
  const heaviest = weights.indexOf(Math.max(...weights));
  return widths.map((width, index) => width + shares[index]! + (index === heaviest ? left : 0));
}

export function totalWidth(widths: number[]): number {
  return widths.reduce((sum, width) => sum + width, 0);
}

/** Room, in unscaled pixels, the other columns must keep beside the pinned ones. */
export const STICKY_ROOM_PX = 120;

/**
 * Whether the pinned columns may stay pinned: only while they leave room beside them in the
 * viewport. A pane narrower than its pinned columns plus a little room would otherwise
 * show nothing but them, every other column out of reach. `viewport` of 0 (not measured)
 * keeps them pinned.
 */
export function stickyFits<Row>(
  columns: readonly TrackColumnDef<Row>[],
  widths: number[],
  viewport: number,
  scale: number,
): boolean {
  if (viewport <= 0) return true;
  let pinned = 0;
  for (let i = 0; i < columns.length; i += 1) {
    if (columns[i]?.sticky) pinned += widths[i] ?? 0;
  }
  return pinned + STICKY_ROOM_PX * scale <= viewport;
}

/**
 * How far from the left edge a sticky column sits: the width of the sticky
 * columns before it, and nothing else. A non-sticky column between two sticky
 * ones does not push the second one along, because it scrolls away underneath.
 */
export function stickyLeft<Row>(
  columns: readonly TrackColumnDef<Row>[],
  widths: number[],
  index: number,
): number {
  let offset = 0;
  for (let i = 0; i < index; i += 1) {
    if (columns[i]?.sticky) offset += widths[i] ?? 0;
  }
  return offset;
}

/**
 * The row height the stylesheet is using, in CSS pixels.
 *
 * Read rather than assumed because `--row-height` derives from `--scale`, and
 * a virtualizer told the wrong height positions every row wrongly. Falls back
 * when there is no document (a pure test) or no stylesheet (Storybook before
 * tokens load).
 */
export function readRowHeight(): number {
  if (typeof document === "undefined") return ROW_HEIGHT_FALLBACK;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--row-height")
    .trim();
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : ROW_HEIGHT_FALLBACK;
}

/**
 * The row height the stylesheet is using, measured again when the size or the
 * row density changes: `--row-height` derives from both (`tokens/layout.css`),
 * and a virtualizer told the old height puts every row in the wrong place.
 */
export function useRowHeight(): number {
  const scale = useScaleFactor();
  const [density] = useRowDensity();
  // The values are not read, only waited on: what is measured is the stylesheet.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => readRowHeight(), [scale, density]);
}

/**
 * Where a drop at `offsetY` below the top of the rows lands: an insertion point from 0 to `total`,
 * and the row it was over.
 *
 * The upper half of a row means before it and the lower half after it. Past the last row is the
 * end, over the last row; above the first (the header) is the start; an empty table has no row
 * to be over. Pure, so the table can work it out from the pointer on every dragover and on the
 * drop itself, and never has to remember where the last dragover was.
 */
export function insertionAt(
  offsetY: number,
  rowHeight: number,
  total: number,
): { insertAt: number; over: number } {
  if (total <= 0) return { insertAt: 0, over: -1 };
  if (offsetY < 0) return { insertAt: 0, over: 0 };
  if (offsetY >= total * rowHeight) return { insertAt: total, over: total - 1 };
  const row = Math.floor(offsetY / rowHeight);
  const after = offsetY - row * rowHeight > rowHeight / 2;
  return { insertAt: row + (after ? 1 : 0), over: row };
}

/** A column's width after a drag of `deltaX`, never below its minimum. */
export function widthAfterDrag<Row>(
  column: TrackColumnDef<Row>,
  startWidth: number,
  deltaX: number,
  scale: number,
): number {
  return Math.max(columnMinWidth(column, scale), Math.round(startWidth + deltaX));
}
