/**
 * Which columns a table shows, in what order, and how wide (LIBUI-06, DEC-042).
 *
 * **Order is part of the state, so the state is a list.** DEC-042 lets a user
 * move a column, which a map of visibility flags cannot express — and an array
 * of widths indexed by position, which the retired Results table used, would
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

interface ColumnLayoutEntry {
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
    hidden: column.hiddenByDefault === true,
  }));
}

/**
 * What is stored (SR1, C205): widths in 1x units, so a layout saved at one text
 * scale opens correctly at another. `unit` marks the new shape; an older
 * layout is a bare array of widths at the scale it was saved in, which is read
 * as the current scale's and rewritten as 1x on the next change.
 */
interface StoredLayout {
  unit: "1x";
  columns: ColumnLayoutEntry[];
  /** The last sort the table made itself (a column with an `accessor` and no engine key); absent when none (C193). */
  sort?: ColumnSort;
}

/** A sort a table remembers: a column id and a direction. */
export interface ColumnSort {
  key: string;
  direction: "asc" | "desc";
}

/** Whether a column sorts in the table over the rows it has, not on the engine (C193). */
export function sortsOnClient<Row>(column: TrackColumnDef<Row>): boolean {
  return !column.sortKey && column.accessor !== undefined;
}

/** Widths scaled by `factor`, rounded to whole pixels. */
export function rescaleLayout(layout: ColumnLayout, factor: number): ColumnLayout {
  if (factor === 1) return layout;
  return layout.map((entry) => ({ ...entry, width: Math.round(entry.width * factor) }));
}

/** The shape written to storage: widths divided back to 1x. */
export function toStored(layout: ColumnLayout, scale: number, sort?: ColumnSort | null): StoredLayout {
  return {
    unit: "1x",
    columns: layout.map((entry) => ({ ...entry, width: Math.round(entry.width / scale) })),
    ...(sort ? { sort: { key: sort.key, direction: sort.direction } } : {}),
  };
}

function entriesOf(stored: unknown, scale: number): unknown {
  if (typeof stored === "object" && stored !== null && !Array.isArray(stored)) {
    const shaped = stored as Partial<StoredLayout>;
    if (shaped.unit === "1x" && Array.isArray(shaped.columns)) {
      return shaped.columns.map((raw) =>
        isEntry(raw) && typeof raw.width === "number"
          ? { ...raw, width: raw.width * scale }
          : raw,
      );
    }
  }
  return stored;
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
 *
 * `previousDefaultOrder` is the registry's order before a reorder (DEC-NEW-K1).
 * A stored layout whose ids, once those no longer in `columns` are dropped,
 * are in exactly that order was never rearranged by the person, so it is
 * re-sorted into the registry's order, each entry keeping its width and
 * hidden flag. Any other order is left as stored. Loading writes nothing, so the
 * move is saved with the person's next change and is then the registry order.
 */
export function reconcileLayout<Row>(
  stored: unknown,
  columns: readonly TrackColumnDef<Row>[],
  scale: number,
  previousDefaultOrder?: readonly string[],
): ColumnLayout {
  const byId = new Map(columns.map((column) => [column.id, column]));
  const seen = new Set<string>();
  const layout: ColumnLayout = [];
  const entries = entriesOf(stored, scale);

  if (Array.isArray(entries)) {
    for (const raw of entries) {
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

  if (previousDefaultOrder && layout.length > 0) {
    // Only the ids the stored layout has: one saved before a later column
    // was added still reads as the old order. A stored id the previous order
    // does not know fails the length check below.
    const storedIds = new Set(layout.map((entry) => entry.id));
    const previous = previousDefaultOrder.filter((id) => storedIds.has(id));
    const sameOrder =
      layout.length === previous.length && layout.every((entry, i) => entry.id === previous[i]);
    if (sameOrder) {
      const position = new Map(columns.map((column, i) => [column.id, i]));
      layout.sort((a, b) => position.get(a.id)! - position.get(b.id)!);
    }
  }

  for (const column of columns) {
    if (seen.has(column.id)) continue;
    layout.push({
      id: column.id,
      width: columnDefaultWidth(column, scale),
      // A column added by a later release starts where its declaration says,
      // so shipping one hidden does not make every existing user see it.
      hidden: column.hiddenByDefault === true,
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
  previousDefaultOrder?: readonly string[],
): ColumnLayout {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultLayout(columns, scale);
    return reconcileLayout(JSON.parse(raw), columns, scale, previousDefaultOrder);
  } catch {
    return defaultLayout(columns, scale);
  }
}

/**
 * The client sort stored with a layout, if it still names a column that sorts in the table.
 * Never throws, and never returns a key the engine would be sent: an engine column, an unknown id
 * and a bad direction all read as no sort. A layout saved before the sort existed has none.
 */
export function loadColumnSort<Row>(
  storageKey: string,
  columns: readonly TrackColumnDef<Row>[],
): ColumnSort | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const stored: unknown = JSON.parse(raw);
    if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return null;
    const sort = (stored as { sort?: unknown }).sort;
    if (typeof sort !== "object" || sort === null) return null;
    const { key, direction } = sort as { key?: unknown; direction?: unknown };
    if (typeof key !== "string" || (direction !== "asc" && direction !== "desc")) return null;
    const column = columns.find((entry) => entry.id === key);
    return column && sortsOnClient(column) ? { key, direction } : null;
  } catch {
    return null;
  }
}

/** Write a layout (and the client sort with it), ignoring a storage that will not have it. */
export function saveColumnLayout(
  storageKey: string,
  layout: ColumnLayout,
  scale: number,
  sort?: ColumnSort | null,
): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(toStored(layout, scale, sort)));
  } catch {
    // A private window, or site data blocked. The table still works; it just
    // opens with its defaults next time.
  }
}

/**
 * Move a layout saved before the 1x unit existed (a bare array of widths) to the 1x shape (M86).
 *
 * A bare layout's widths were read as the current scale's and stayed bare until the person changed
 * something, so a later size read the same numbers again (Title 440 at 1x, 1.5x and 2x). Rewritten
 * once on open, at the scale it is read at, it follows the text size from then on. Nothing else is
 * rewritten: a layout already in 1x, or none at all, is left alone, and a refusing storage is
 * ignored.
 */
export function migrateBareLayout(storageKey: string, layout: ColumnLayout, scale: number): void {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw || !Array.isArray(JSON.parse(raw))) return;
    saveColumnLayout(storageKey, layout, scale, null);
  } catch {
    // Corrupt or unreadable: the defaults apply and the next change writes a fresh layout.
  }
}

/** Forget a stored layout, so the next open uses the defaults. */
export function clearColumnLayout(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Nothing stored, or storage refuses; the defaults apply either way.
  }
}
