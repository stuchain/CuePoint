/**
 * Whether the player bar is its one compact line: a window under 700px tall (PlayerBar.css keeps
 * the same number). The zoomed waveform strip and its toggle are not drawn then, so nothing
 * should be fetched or made for it either.
 */
import { useSyncExternalStore } from "react";

/** Kept in step with the `@media (max-height: 699px)` block in PlayerBar.css. */
export const COMPACT_BAR_QUERY = "(max-height: 699px)";

function query(): MediaQueryList | null {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(COMPACT_BAR_QUERY)
    : null;
}

function subscribe(listener: () => void): () => void {
  const list = query();
  list?.addEventListener?.("change", listener);
  return () => list?.removeEventListener?.("change", listener);
}

const snapshot = (): boolean => query()?.matches === true;

/** True in a window too short for the zoomed strip; a platform without matchMedia counts as tall. */
export function useCompactBar(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
