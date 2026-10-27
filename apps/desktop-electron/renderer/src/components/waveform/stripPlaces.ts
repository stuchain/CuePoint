/**
 * Where the zoomed strip is drawn (D27, D11, M315, M318): on Library, Prepare and Keys, below 2x, from the
 * content's edge. The player bar reads the same rules to say why its toggle shows nothing elsewhere.
 */
import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { findOwningDestination } from "../shell/navRegistry";

/** The pages that show the zoomed strip (D27, M318): where tracks are chosen and cued. Not Settings, Clean, Discover or Statistics. */
export const STRIP_PAGES: readonly string[] = ["library", "prepare", "keys"];

/** The text size from which the strip collapses (D11, M74): a strip and a bar would take a fifth of the window. */
export const STRIP_MAX_SCALE = 2;

function subscribeToRoute(listener: () => void): () => void {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

/** The page the window is on, read from the hash route (the app is a HashRouter); null when there is none yet. */
function routePage(): string | null {
  const path = window.location.hash.replace(/^#/, "").split("?")[0] ?? "";
  return path === "" ? null : (findOwningDestination(path)?.id ?? null);
}

/** Whether the zoomed strip belongs on this page; a route that is not known yet shows it. */
export function useStripPage(): boolean {
  const page = useSyncExternalStore(subscribeToRoute, routePage, () => null);
  return page === null || STRIP_PAGES.includes(page);
}

/** Where the page's content starts, in px from the window's left: the strip starts there, not under the sidebar (M315). */
export function useContentEdge(): number {
  const [edge, setEdge] = useState(0);
  useLayoutEffect(() => {
    const content = document.querySelector<HTMLElement>(".app-shell__content");
    if (!content) return undefined;
    const measure = () => setEdge(Math.max(0, Math.round(content.getBoundingClientRect().left)));
    measure();
    window.addEventListener("resize", measure);
    const watcher = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    watcher?.observe(content);
    return () => {
      window.removeEventListener("resize", measure);
      watcher?.disconnect();
    };
  }, []);
  return edge;
}
