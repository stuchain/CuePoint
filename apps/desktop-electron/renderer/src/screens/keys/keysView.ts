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

export function saveView(view: KeysView): void {
  try {
    window.localStorage.setItem(KEYS_VIEW_STORAGE_KEY, view);
  } catch {
    // Remembering is a convenience: a blocked store only means the next visit starts on the wheel.
  }
}
