/**
 * Whether the player bar is its one compact line: a window under 700px tall, in real pixels
 * whatever the interface size (a 1264x735 laptop keeps the full bar at 1.25x and 1.5x). This is
 * the one place the number lives (C207): the hook below and the `data-short-window` flag the
 * stylesheet reads (`:root[data-short-window] .cp-player-bar`) both ask `COMPACT_BAR_QUERY`, so
 * the code and the CSS cannot disagree. The zoomed strip and its toggle are not drawn when the bar
 * is compact, so nothing should be fetched or made for it either.
 */
import { useEffect, useSyncExternalStore } from "react";

/** The tallest window, in px, that still gets the compact bar (just under 700). */
export const COMPACT_BAR_MAX_PX = 699.98;

export const COMPACT_BAR_QUERY = `(max-height: ${COMPACT_BAR_MAX_PX}px)`;

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

/** True in a window too short for the full bar; a platform without matchMedia counts as tall. */
export function useCompactBar(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}

/** Puts `data-short-window` on the page while the bar is compact, for the stylesheet. App mounts it once. */
export function useCompactBarFlag(): void {
  const compact = useCompactBar();
  useEffect(() => {
    const root = document.documentElement;
    if (compact) root.setAttribute("data-short-window", "");
    else root.removeAttribute("data-short-window");
    return () => root.removeAttribute("data-short-window");
  }, [compact]);
}
