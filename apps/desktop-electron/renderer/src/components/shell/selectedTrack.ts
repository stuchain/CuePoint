import { useSyncExternalStore } from "react";

/**
 * The track the user has selected, wherever they selected it (PAGES-03).
 *
 * Each page owns its own selection and hands the Inspector a rendered element,
 * not a track. The Camelot wheel needs the selected track's key from any page,
 * so each page sets this beside its `useInspectorSlot` call. `key` is the track's
 * key in Camelot notation, or null when it has none or it is not known.
 *
 * A page clears it with `null` when its selection goes.
 */
export interface SelectedTrack {
  id: number | string;
  key: string | null;
  /** The track's title, for the wheel's caption; the wheel looks a library track up when absent. */
  title?: string | null;
}

let current: SelectedTrack | null = null;
const listeners = new Set<() => void>();

export function getSelectedTrack(): SelectedTrack | null {
  return current;
}

export function setSelectedTrack(next: SelectedTrack | null): void {
  const same =
    next === current ||
    (next !== null && current !== null && next.id === current.id &&
      next.key === current.key &&
      (next.title ?? null) === (current.title ?? null));
  if (same) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSelectedTrack(): SelectedTrack | null {
  return useSyncExternalStore(subscribe, getSelectedTrack, getSelectedTrack);
}
