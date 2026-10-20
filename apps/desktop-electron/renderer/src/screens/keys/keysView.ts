/**
 * Which reading of the counts the Keys page shows: the Camelot wheel or the list (K15). One
 * at a time, and the choice is remembered under cuepoint-keys-view.
 */
export type KeysView = "wheel" | "list";

export const KEYS_VIEW_STORAGE_KEY = "cuepoint-keys-view";

/** The remembered view, or the wheel when nothing reads (first visit, blocked storage). */
export function loadView(): KeysView {
  try {
    return window.localStorage.getItem(KEYS_VIEW_STORAGE_KEY) === "list" ? "list" : "wheel";
  } catch {
    return "wheel";
  }
}

/**
 * The Library's columns in the order the Keys track list starts with: Key straight after Title
 * (C69). The list shares a narrow pane with the wheel, and in the Library's order Key was the
 * third column, off the pane's right edge. A layout the person arranged keeps its own order.
 */
export function keysColumnOrder<Column extends { id: string }>(columns: readonly Column[]): Column[] {
  const key = columns.find((column) => column.id === "key");
  const title = columns.findIndex((column) => column.id === "title");
  if (!key || title < 0) return [...columns];
  const rest = columns.filter((column) => column !== key);
  rest.splice(title + 1, 0, key);
  return rest;
}

export function saveView(view: KeysView): void {
  try {
    window.localStorage.setItem(KEYS_VIEW_STORAGE_KEY, view);
  } catch {
    // Remembering is a convenience: a blocked store only means the next visit starts on the wheel.
  }
}

/**
 * Whether the track list's toolbar folds Select all and Open in Library into one "•••" menu
 * (item 3). It folds once the count would be cut short ("83 tr…"), and comes back only when the
 * toolbar is as wide as it was then plus the room the two took, so it does not flicker at the edge.
 */
export function headerFolds(folded: boolean, measure: { countCut: boolean; width: number; unfoldAt: number }): boolean {
  return folded ? measure.width < measure.unfoldAt : measure.countCut;
}
