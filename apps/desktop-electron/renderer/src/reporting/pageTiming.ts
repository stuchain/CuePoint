import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { findOwningDestination } from "../components/shell/navRegistry";
import { reportBreadcrumb } from "./reporting";

/** A page that took longer than this to draw is also a step before an error. */
const SLOW_DRAW_MS = 1000;

/**
 * How long each destination takes to draw, sent to main's log (`main.log`) with the
 * destination's id only: never the path, a query or a name. The clock starts when the render
 * for the new path begins and stops at the second animation frame after it is committed, so it
 * is what the user waited for before the page was on screen. The first page counts too.
 * Main adds how long the engine then took to go quiet.
 */
export function usePageTiming(): void {
  const { pathname } = useLocation();
  const seen = useRef<{ path: string | null; startedAt: number }>({ path: null, startedAt: 0 });
  // Taken while rendering, so the work of rendering the page is inside the number.
  if (seen.current.path !== pathname) {
    seen.current = { path: pathname, startedAt: performance.now() };
  }
  const startedAt = seen.current.startedAt;

  useEffect(() => {
    const destination = findOwningDestination(pathname);
    if (!destination) return;
    const id = destination.id;
    let cancelled = false;
    let first = 0;
    let second = 0;
    first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (cancelled) return;
        const drawMs = Math.max(0, Math.round(performance.now() - startedAt));
        try {
          performance.mark(`cp-page:${id}`);
        } catch {
          // A mark is only for the profiler.
        }
        try {
          window.cuepoint?.reportPageSwitch?.(id, drawMs);
        } catch {
          // Timing is never worth a failure.
        }
        if (drawMs > SLOW_DRAW_MS) reportBreadcrumb("page", `${id} drawn ${drawMs} ms`);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [pathname, startedAt]);
}
