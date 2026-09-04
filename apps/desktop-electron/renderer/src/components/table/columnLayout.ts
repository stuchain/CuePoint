/**
 * Which columns a table shows, in what order, and how wide (LIBUI-06, DEC-042).
 *
 * **Order is part of the state, so the state is a list.** DEC-042 lets a user
 * move a column, which a map of visibility flags cannot express — and an array
 * of widths indexed by position, which `resultsTableLayout.ts` uses, would
 * apply the artist column's width to whatever moved into slot two.
 *
 * **A stored layout is reconciled, never trusted.** A column added in a later
 * release is appended rather than lost; a column that no longer exists is
 * dropped rather than rendered as a blank; a width below the current scale's
 * minimum is raised. Without that, a rename or a removed column leaves a user
 * with a table they cannot fix, and no way to know why.
 *
 * **Pinned columns stay pinned.** A sticky column is one that does not scroll
 * away; a layout where a scrolling column sits before a pinned one is not a
 * layout anyone asked for, so the moves that would produce it are refused.
 */
import {
  columnDefaultWidth,
  columnMinWidth,
  type ColumnWidths,
  type TrackColumnDef,
} from "./trackTableLayout";

/**
 * Where the Library table's layout is stored.
 *
 * Deliberately without the `-ui-lab-` segment the older keys carry: that
 * naming predates the shipping product (`PIXEL_DESIGN_SYSTEM.md` §2) and
 * renaming the existing ones touches persisted user state, which is its own
 * change. New keys do not add to the debt.
 */
export const LIBRARY_TABLE_LAYOUT_KEY = "cuepoint-library-table-layout";

export interface ColumnLayoutEntry {
  id: string;
  width: number;
  hidden: boolean;
}

export type ColumnLayout = ColumnLayoutEntry[];

export function defaultLayout<Row>(
  columns: readonly TrackColumnDef<Row>[],
  scale: number,
): ColumnLayout {
  return columns.map((column) => ({
    id: column.id,
    width: columnDefaultWidth(column, scale),
    hidden: false,
  }));
}

function isEntry(value: unknown): value is Partial<ColumnLayoutEntry> {
  return typeof value === "object" && value !== null;
}

/**
 * A stored layout, made safe against the columns that exist now.
 *
 * Stored entries keep their order; anything the registry has and the store
 * does not is appended in registry order, which is where a column added in a
 * later release turns up. Sticky columns are then floated to the front,
 * because a pinned column that sorted behind a scrolling one would be pinned
 * over the top of it.
 */
export function reconcileLayout<Row>(
  stored: unknown,
  columns: readonly TrackColumnDef<Row>[],
  scale: number,
): ColumnLayout {
  const byId = new Map(columns.map((column) => [column.id, column]));
  const seen = new Set<string>();
  const layout: ColumnLayout = [];

  if (Array.isArray(stored)) {
    for (const raw of stored) {
      if (!isEntry(raw) || typeof raw.id !== "string") continue;
      const column = byId.get(raw.id);
      // A column that no longer exists. Dropped, not rendered as a gap.
      if (!column || seen.has(raw.id)) continue;
      seen.add(raw.id);
      const width =
        typeof raw.width === "number" && Number.isFinite(raw.width)
          ? Math.max(columnMinWidth(column, scale), Math.round(raw.width))
          : columnDefaultWidth(column, scale);
      layout.push({ id: raw.id, width, hidden: raw.hidden === true });
    }
  }

  for (const column of columns) {
    if (seen.has(column.id)) continue;
    layout.push({
      id: column.id,
      width: columnDefaultWidth(column, scale),
      hidden: false,
    });
  }

  const pinned = (entry: ColumnLayoutEntry) => byId.get(entry.id)?.sticky === true;
  const sticky = layout.filter(pinned);
  const rest = layout.filter((entry) => !pinned(entry));
  const reconciled = [...sticky, ...rest];

  // Nothing visible is a table with no columns and no way back. The first
  // column is shown instead, which is a state the picker can act on.
  if (reconciled.length > 0 && reconciled.every((entry) => entry.hidden)) {
    reconciled[0] = { ...reconciled[0]!, hidden: false };
  }
  return reconciled;
}

/** The columns to render, in layout order, hidden ones removed. */
export function visibleColumns<Row>(
  columns: readonly TrackColumnDef<Row>[],
  layout: ColumnLayout,
): TrackColumnDef<Row>[] {
  const byId = new Map(columns.map((column) => [column.id, column]));
  return layout
    .filter((entry) => !entry.hidden)
    .map((entry) => byId.get(entry.id))
    .filter((column): column is TrackColumnDef<Row> => column !== undefined);
}

/** Widths keyed by column id, as `TrackTable` takes them. */
export function widthsOf(layout: ColumnLayout): ColumnWidths {
  const widths: ColumnWidths = {};
  for (const entry of layout) widths[entry.id] = entry.width;
  return widths;
}

/** The layout with new widths applied; unknown ids are ignored. */
export function withWidths(layout: ColumnLayout, widths: ColumnWidths): ColumnLayout {
  return layout.map((entry) =>
    typeof widths[entry.id] === "number"
      ? { ...entry, width: widths[entry.id]! }
      : entry,
  );
}

export function isLastVisible(layout: ColumnLayout, id: string): boolean {
  const visible = layout.filter((entry) => !entry.hidden);
  return visible.length === 1 && visible[0]?.id === id;
}

/**
 * Show or hide one column.
 *
 * Hiding the last visible one is refused rather than applied: a table with no
 * columns shows nothing at all, including the control that would bring one
 * back.
 */
export function toggleHidden(layout: ColumnLayout, id: string): ColumnLayout {
  if (isLastVisible(layout, id)) return layout;
  return layout.map((entry) =>
    entry.id === id ? { ...entry, hidden: !entry.hidden } : entry,
  );
}

/**
 * Where a column may be moved to, given what is pinned.
 *
 * A pinned column stays among the pinned ones; a scrolling column stays after
 * them. Anything else would put a column that scrolls away underneath one that
 * does not.
 */
export function allowedRange<Row>(
  columns: readonly TrackColumnDef<Row>[],
  layout: ColumnLayout,
  id: string,
): [number, number] | null {
  const byId = new Map(columns.map((column) => [column.id, column]));
  const index = layout.findIndex((entry) => entry.id === id);
  if (index < 0) return null;
  const pinnedCount = layout.filter((entry) => byId.get(entry.id)?.sticky).length;
  return byId.get(id)?.sticky
    ? [0, Math.max(0, pinnedCount - 1)]
    : [pinnedCount, layout.length - 1];
}

/** The layout with one column moved to an index, clamped to what is allowed. */
export function moveColumn<Row>(
  columns: readonly TrackColumnDef<Row>[],
  layout: ColumnLayout,
  id: string,
  toIndex: number,
): ColumnLayout {
  const from = layout.findIndex((entry) => entry.id === id);
  const range = allowedRange(columns, layout, id);
  if (from < 0 || !range) return layout;

  const target = Math.min(Math.max(toIndex, range[0]), range[1]);
  if (target === from) return layout;

  const next = [...layout];
  const [entry] = next.splice(from, 1);
  next.splice(target, 0, entry!);
  return next;
}

/** The layout with one column moved one place left or right. */
export function nudgeColumn<Row>(
  columns: readonly TrackColumnDef<Row>[],
  layout: ColumnLayout,
  id: string,
  delta: -1 | 1,
): ColumnLayout {
  const from = layout.findIndex((entry) => entry.id === id);
  if (from < 0) return layout;
  return moveColumn(columns, layout, id, from + delta);
}

export function canMove<Row>(
  columns: readonly TrackColumnDef<Row>[],
  layout: ColumnLayout,
  id: string,
  delta: -1 | 1,
): boolean {
  const from = layout.findIndex((entry) => entry.id === id);
  const range = allowedRange(columns, layout, id);
  if (from < 0 || !range) return false;
  const target = from + delta;
  return target >= range[0] && target <= range[1];
}

/**
 * Read a stored layout, reconciled against the columns that exist now.
 *
 * Never throws: a corrupt value, a storage that refuses to be read (a private
 * window, a browser with site data blocked) and a first run all produce the
 * default layout, because a table that will not render is a worse answer than
 * a table with the columns it started with.
 */
export function loadColumnLayout<Row>(
  storageKey: string,
  columns: readonly TrackColumnDef<Row>[],
  scale: number,
): ColumnLayout {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultLayout(columns, scale);
    return reconcileLayout(JSON.parse(raw), columns, scale);
  } catch {
    return defaultLayout(columns, scale);
  }
}

/** Write a layout, ignoring a storage that will not have it. */
export function saveColumnLayout(storageKey: string, layout: ColumnLayout): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(layout));
  } catch {
    // A private window, or site data blocked. The table still works; it just
    // opens with its defaults next time.
  }
}
