/**
 * Layout maths for the Universal Track Table (LIBUI-04, DEC-041).
 *
 * Pure functions, no React and no DOM beyond one CSS-variable read, so the
 * arithmetic that decides how wide a column is can be tested without rendering
 * anything — the split `resultsTableLayout.ts` established and the reason its
 * clamping has never regressed.
 *
 * Two things are deliberately different from `resultsTableLayout.ts`, which
 * this is extracted from rather than replacing (DEC-041 — the results screen
 * converges in Phase 7):
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
import type { ReactNode } from "react";

/** Qt-style minimum column width in CSS pixels, before scale. */
export const COLUMN_MIN_PX = 80;

/** What a column gets when it declares no width of its own. */
export const COLUMN_DEFAULT_PX = 120;

/** Fallback row height, in CSS pixels, when no stylesheet has loaded. */
export const ROW_HEIGHT_FALLBACK = 36;

export type ColumnAlign = "left" | "right";

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

export function gridTemplate(widths: number[]): string {
  return widths.map((width) => `${Math.round(width)}px`).join(" ");
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

/** A column's width after a drag of `deltaX`, never below its minimum. */
export function widthAfterDrag<Row>(
  column: TrackColumnDef<Row>,
  startWidth: number,
  deltaX: number,
  scale: number,
): number {
  return Math.max(columnMinWidth(column, scale), Math.round(startWidth + deltaX));
}
