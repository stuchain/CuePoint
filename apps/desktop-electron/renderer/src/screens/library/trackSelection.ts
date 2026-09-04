/**
 * What is selected in the Library table (LIBUI-09, DEC-045).
 *
 * **A selection is by track id, never by row index.** With windowed data an
 * index means nothing once the window moves: row 400 is a different track
 * after a sort, and no track at all after a filter.
 *
 * **"Everything matching" is a description, not a list.** Selecting all of a
 * 47,913-track view must not put 47,913 numbers in memory, and Phase 6's "tag
 * everything matching this filter" needs the *query*, not a list that was true
 * a moment ago. So a selection is either the ids that are in it, or everything
 * the current query matches minus the ids that have been taken out.
 *
 * Nothing here fetches, renders or knows what a track is. The hook drives it,
 * and the page renders it.
 */

export interface Selection {
  /** True when the selection is "everything the query matches". */
  all: boolean;
  /** The selected ids, when `all` is false. */
  ids: ReadonlySet<number>;
  /** The ids taken out again, when `all` is true. */
  excluded: ReadonlySet<number>;
  /** Row index a plain click landed on, for shift-extending from. */
  anchor: number | null;
  /** The last track clicked — what the Inspector shows. */
  lastId: number | null;
}

export const EMPTY_SELECTION: Selection = {
  all: false,
  ids: new Set(),
  excluded: new Set(),
  anchor: null,
  lastId: null,
};

export function isSelected(selection: Selection, id: number): boolean {
  return selection.all ? !selection.excluded.has(id) : selection.ids.has(id);
}

/**
 * How many tracks are selected.
 *
 * `total` is the engine's match count, so "everything except three" is
 * answerable without listing anything.
 */
export function selectionCount(selection: Selection, total: number): number {
  return selection.all
    ? Math.max(0, total - selection.excluded.size)
    : selection.ids.size;
}

export function isEmpty(selection: Selection, total: number): boolean {
  return selectionCount(selection, total) === 0;
}

/** The one id in the selection, or null when it is not exactly one. */
export function onlySelectedId(selection: Selection, total: number): number | null {
  if (selectionCount(selection, total) !== 1) return null;
  // A described selection holds no ids at all, so this answers null for it
  // without a branch of its own: "everything except all but one" *is* a single
  // selection, but its id is not in hand, and the caller resolves it from the
  // query if it needs it.
  return [...selection.ids][0] ?? null;
}

/** Replace the selection with one track. A plain click. */
export function selectOnly(id: number, index: number): Selection {
  return {
    all: false,
    ids: new Set([id]),
    excluded: new Set(),
    anchor: index,
    lastId: id,
  };
}

/** Add or remove one track, keeping the rest. Ctrl or Cmd click. */
export function toggle(selection: Selection, id: number, index: number): Selection {
  if (selection.all) {
    const excluded = new Set(selection.excluded);
    if (excluded.has(id)) excluded.delete(id);
    else excluded.add(id);
    return { ...selection, excluded, anchor: index, lastId: id };
  }
  const ids = new Set(selection.ids);
  if (ids.has(id)) ids.delete(id);
  else ids.add(id);
  return { ...selection, ids, anchor: index, lastId: id };
}

/**
 * Add a run of tracks to the selection. Shift click.
 *
 * The ids are resolved by the caller — from the rows it has, or from the
 * engine when the range crosses rows the table has never loaded — because this
 * module cannot ask anyone anything.
 */
export function extend(
  selection: Selection,
  ids: readonly number[],
  lastId: number,
): Selection {
  if (selection.all) {
    const excluded = new Set(selection.excluded);
    for (const id of ids) excluded.delete(id);
    return { ...selection, excluded, lastId };
  }
  const next = new Set(selection.ids);
  for (const id of ids) next.add(id);
  // The anchor stays where it was: shift-clicking twice extends from the same
  // place, rather than walking the selection down the table.
  return { ...selection, ids: next, lastId };
}

/** Everything the current query matches (DEC-045). */
export function selectAll(selection: Selection): Selection {
  return {
    all: true,
    ids: new Set(),
    excluded: new Set(),
    anchor: selection.anchor,
    lastId: selection.lastId,
  };
}

export function clear(): Selection {
  return EMPTY_SELECTION;
}

/** True when the selection is the query rather than a list of tracks. */
export function isDescribed(selection: Selection): boolean {
  return selection.all;
}

/** "3 tracks selected", "47,913 tracks selected". */
export function describeSelection(selection: Selection, total: number): string {
  const count = selectionCount(selection, total);
  if (count === 0) return "";
  return `${count.toLocaleString()} ${count === 1 ? "track" : "tracks"} selected`;
}

/** The range of row indices a shift-click covers, in either direction. */
export function rangeBetween(anchor: number, index: number): [number, number] {
  return anchor <= index ? [anchor, index] : [index, anchor];
}
