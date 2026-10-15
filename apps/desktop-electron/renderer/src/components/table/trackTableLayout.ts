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

/** What a column gets when it declares no width of its own. */
export const COLUMN_DEFAULT_PX = 120;

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
  /**
   * Not shown until a user asks for it (DEC-042). A table that opened on every
   * column it has would be a wall; the picker is where the rest live, and once
   * chosen the choice is remembered.
   */
  hiddenByDefault?: boolean;
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
  column: Pick<TrackColumnDef<unknown>, "minWidthPx" | "defaultWidthPx">,
  scale: number,
): number {
  const declared = (column.defaultWidthPx ?? COLUMN_DEFAULT_PX) * scale;
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

export function totalWidth(widths: number[]): number {
  return widths.reduce((sum, width) => sum + width, 0);
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
