import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { LIBRARY_SUMMARY, useSharedRead } from "../../api/sharedReads";

/** While the library is empty, how often it is asked again; the engine status is read as often. */
const EMPTY_POLL_MS = 4000;

/**
 * Whether the library is known to be empty (NAV-5): nothing imported yet.
 *
 * The sidebar dims the pages that have nothing to show until then. It reads the library
 * summary (a quick count) through the shared cache (C19d), which the Library page uses
 * too: an import, a refresh or any announced change makes the cache read again.
 *
 * While the shared value is missing, failed or empty, the shell also asks on its own,
 * privately and quietly (`getLibrarySummary` directly): on mount's timer, after a page
 * change and every few seconds, one question at a time (the next is scheduled only after
 * the last answered). Asking through the shared key would make every failed attempt a
 * toast and a "Reading your library…" flicker on the Library page, e.g. before the engine
 * answers. Only when a private answer differs from the shared one (the first import has
 * finished) does it make the shared read refresh, once, so the pages update. Once there are
 * tracks it stops asking. A library that cannot be read is not called empty: nothing dims
 * for a reason that is not known.
 */
export function useLibraryEmpty(pollMs: number = EMPTY_POLL_MS): boolean {
  const { value, error, unavailable, refresh } = useSharedRead(LIBRARY_SUMMARY);
  // The cache keeps an old value beside a later failure; a failed read is "not known".
  const failed = error !== undefined && error !== null;
  const empty = Boolean(value?.library_empty) && !failed;
  const settled = value !== undefined && !value.library_empty;

  const latest = useRef({ value, refresh });
  latest.current = { value, refresh };

  const { pathname } = useLocation();
  const seen = useRef(pathname);
  useEffect(() => {
    if (unavailable || settled) return;
    const read = window.cuepoint?.getLibrarySummary;
    if (!read) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The first read is the cache's; only a later page change asks at once.
    const delay = seen.current === pathname ? pollMs : 0;
    seen.current = pathname;
    let refreshedFor: string | undefined;

    const ask = () => {
      new Promise<unknown>((resolve) => resolve(read.call(window.cuepoint)))
        .then(
          (answer) => {
            if (cancelled) return;
            const seenNow = JSON.stringify(answer ?? null);
            const shared = latest.current.value;
            const same = shared !== undefined && JSON.stringify(shared) === seenNow;
            if (!same && refreshedFor !== seenNow) {
              refreshedFor = seenNow;
              latest.current.refresh();
            }
          },
          () => undefined, // not known either way: ask again on the timer
        )
        .finally(() => {
          if (!cancelled) timer = setTimeout(ask, pollMs);
        });
    };
    timer = setTimeout(ask, delay);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pathname, unavailable, settled, pollMs]);

  return empty;
}
