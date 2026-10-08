import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/** While the library is empty, how often it is asked again; the engine status is read as often. */
const EMPTY_POLL_MS = 4000;

/**
 * Whether the library is known to be empty (NAV-5): nothing imported yet.
 *
 * The sidebar dims the pages that have nothing to show until then. It reads the library
 * summary (a quick count) on mount and after every page change, and only while the
 * library is empty also every few seconds, so the first import lights the pages up
 * without waiting for the next click. Once there are tracks it stops asking. A library
 * that cannot be read is not called empty: nothing dims for a reason that is not known.
 */
export function useLibraryEmpty(pollMs: number = EMPTY_POLL_MS): boolean {
  const { pathname } = useLocation();
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    const read = window.cuepoint?.getLibrarySummary;
    if (!read) {
      setEmpty(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = () => {
      void read()
        .then((summary) => {
          if (cancelled) return;
          const isEmpty = Boolean(summary?.library_empty);
          setEmpty(isEmpty);
          if (isEmpty) timer = setTimeout(ask, pollMs);
        })
        .catch(() => {
          // Not known to be empty, but not known otherwise either: ask again on the timer.
          if (cancelled) return;
          setEmpty(false);
          timer = setTimeout(ask, pollMs);
        });
    };
    ask();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [pathname, pollMs]);

  return empty;
}
