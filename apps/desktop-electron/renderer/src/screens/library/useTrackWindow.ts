/**
 * Rows for the Library table, a window at a time (LIBUI-05, DEC-040).
 *
 * The table asks for a range and renders what it is given; this asks the
 * engine for the pages that range needs, keeps the recent ones, and throws
 * away the rest. Everything that makes windowed data hard lives here:
 *
 * **A page is asked for once.** A page in flight is not asked for again, and
 * neither is one already loaded. Without that, dragging a scrollbar across a
 * 50,000-row table would issue hundreds of identical requests.
 *
 * **Memory is bounded.** Only the pages near the window are kept, however far
 * you scroll. Keeping everything would turn a long browse into a slow copy of
 * the library in the renderer, which is the thing DEC-040 exists to avoid.
 *
 * **A response is accepted only if it answers the current question.** Compared
 * against what the engine echoed rather than a counter — see
 * `answersQuery` — so a slow response from the previous sort cannot land on
 * top of the current one.
 *
 * **A failure is a state, not a silence.** The status says so and `retry`
 * asks again; the table keeps its placeholders, and the page (LIBUI-10) says
 * what happened.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  LibrarySearchResponse,
  LibraryTrackRow,
} from "../../api/cuepointBridge.types";
import type { TrackTableSource, TrackTableStatus } from "../../components/table";
import {
  answersQuery,
  browseParams,
  queryKey,
  type LibraryQuery,
} from "./libraryQuery";

/** Rows per request. The engine clamps at 500; this is a window, not a dump. */
export const PAGE_SIZE = 100;

/**
 * Pages kept in memory at once — 1,200 rows.
 *
 * Enough that scrolling back a screen or two costs nothing, few enough that
 * browsing a 50,000-track library end to end never holds more than a few
 * megabytes of rows.
 */
export const MAX_PAGES = 12;

/** Rows fetched either side of the visible range, so scrolling stays ahead. */
export const PREFETCH_ROWS = 100;

export interface TrackWindow {
  /** What the table renders from. */
  source: TrackTableSource<LibraryTrackRow>;
  /** Rows matching the query, from the engine — never counted from loaded rows. */
  total: number;
  status: TrackTableStatus;
  error: string | null;
  /** True when nothing has been imported: a different problem from "no matches". */
  libraryEmpty: boolean;
  /** True until the first response for this query has arrived. */
  loading: boolean;
  /** Ask again for whatever failed. */
  retry: () => void;
  /** How many rows are held in memory, for tests and diagnostics. */
  loadedRows: number;
}

function pageOf(index: number): number {
  return Math.floor(index / PAGE_SIZE);
}

/** The pages a visible range needs, including the prefetch margin. */
export function pagesForRange(
  startIndex: number,
  endIndex: number,
  total: number,
): number[] {
  // No guard for an empty library: `total - 1` is -1, so the last page is
  // before the first and the loop below yields nothing. A separate check would
  // be a second statement of the same rule.
  const first = pageOf(Math.max(0, startIndex - PREFETCH_ROWS));
  const last = pageOf(Math.min(total - 1, endIndex + PREFETCH_ROWS));
  const pages: number[] = [];
  for (let page = first; page <= last; page += 1) pages.push(page);
  return pages;
}

/**
 * Which pages to forget, keeping those nearest the one in view.
 *
 * Distance rather than age: scrolling back to the top should not have evicted
 * the top, and a run of pages either side of the window is what a user is
 * about to look at.
 */
export function pagesToEvict(
  loaded: readonly number[],
  centre: number,
  keep = MAX_PAGES,
): number[] {
  if (loaded.length <= keep) return [];
  return [...loaded]
    .sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre))
    .slice(keep);
}

export function useTrackWindow(query: LibraryQuery): TrackWindow {
  const key = queryKey(query);

  const [pages, setPages] = useState<Map<number, LibraryTrackRow[]>>(new Map());
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<TrackTableStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [libraryEmpty, setLibraryEmpty] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // What is being fetched, and what is worth keeping. Refs rather than state:
  // changing them must not re-render, and the effect that reads them runs
  // between renders.
  const inFlight = useRef<Set<number>>(new Set());
  const centre = useRef(0);
  const queryRef = useRef(key);
  const failedPages = useRef<Set<number>>(new Set());
  // What is held, tracked beside the state that holds it. React commits state
  // between renders, and a scroll produces several windows before any of them
  // commits — reading the state here would re-request pages that arrived a
  // moment ago and have not been rendered yet.
  const loadedPages = useRef<Set<number>>(new Set());

  // A new question: everything loaded belongs to the old one.
  useEffect(() => {
    queryRef.current = key;
    inFlight.current = new Set();
    failedPages.current = new Set();
    loadedPages.current = new Set();
    centre.current = 0;
    setPages(new Map());
    setTotal(0);
    setLoaded(false);
    setError(null);
    setStatus("loading");
  }, [key]);

  /**
   * Ask for whatever of `wanted` is not already held, in flight, or known to
   * have failed. Returns whether anything was actually requested.
   *
   * Every caller goes through here — the first window, a scroll, a retry — so
   * this is the one place that decides a page is missing. A second such
   * decision upstream would be a second thing to keep in step, and the two
   * would disagree the moment one of them learned about eviction.
   */
  const fetchPages = useCallback(
    (wanted: number[]): boolean => {
      const bridge = window.cuepoint?.browseLibrary;
      if (!bridge) {
        setStatus("error");
        setError("CuePoint's engine is not available in this window");
        return false;
      }

      const missing = wanted.filter(
        (page) =>
          !inFlight.current.has(page) &&
          !failedPages.current.has(page) &&
          !loadedPages.current.has(page),
      );
      if (missing.length === 0) return false;

      // Contiguous runs become one request each: a gap of six pages is one
      // call for six hundred rows, not six calls.
      const runs: Array<[number, number]> = [];
      for (const page of missing.sort((a, b) => a - b)) {
        const last = runs[runs.length - 1];
        if (last && page === last[1] + 1) last[1] = page;
        else runs.push([page, page]);
      }

      for (const [first, lastPage] of runs) {
        for (let page = first; page <= lastPage; page += 1) inFlight.current.add(page);
        const offset = first * PAGE_SIZE;
        const limit = (lastPage - first + 1) * PAGE_SIZE;
        const askedFor = key;

        void bridge(browseParams(query, offset, limit))
          .then((response: LibrarySearchResponse) => {
            for (let page = first; page <= lastPage; page += 1) {
              inFlight.current.delete(page);
            }
            // Two ways a response can be stale: the query moved on, or the
            // engine answered a different question than it was asked.
            if (askedFor !== queryRef.current) return;
            if (!answersQuery(response, query)) return;

            setTotal(response.total);
            setLibraryEmpty(response.library_empty);
            setLoaded(true);
            setError(null);
            setStatus("ready");
            setPages((previous) => {
              const next = new Map(previous);
              for (let page = first; page <= lastPage; page += 1) {
                const slice = response.tracks.slice(
                  (page - first) * PAGE_SIZE,
                  (page - first + 1) * PAGE_SIZE,
                );
                if (slice.length > 0) next.set(page, slice);
              }
              for (const page of pagesToEvict([...next.keys()], centre.current)) {
                next.delete(page);
              }
              loadedPages.current = new Set(next.keys());
              return next;
            });
          })
          .catch((cause: unknown) => {
            for (let page = first; page <= lastPage; page += 1) {
              inFlight.current.delete(page);
              // Remembered, so a failing page is not asked for again on every
              // scroll event until the user retries.
              failedPages.current.add(page);
            }
            if (askedFor !== queryRef.current) return;
            setStatus("error");
            setError(cause instanceof Error ? cause.message : String(cause));
          });
      }
      return true;
    },
    [key, query],
  );

  // The first page, so the table knows how many rows there are before anyone
  // scrolls. Without it an empty table would never ask for anything.
  useEffect(() => {
    fetchPages([0]);
    // Deliberately keyed on the query, not on fetchPages: this runs once per
    // question, and fetchPages is rebuilt on every render of a new query.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const requestWindow = useCallback(
    (startIndex: number, endIndex: number) => {
      centre.current = pageOf(Math.floor((startIndex + endIndex) / 2));
      fetchPages(pagesForRange(startIndex, endIndex, total));
    },
    [fetchPages, total],
  );

  const retry = useCallback(() => {
    failedPages.current = new Set();
    setError(null);
    setStatus("loading");
    // Nothing to ask for means nothing was missing: say so rather than leaving
    // a table that says it is loading and never will be.
    if (!fetchPages([centre.current])) setStatus("ready");
  }, [fetchPages]);

  const getRow = useCallback(
    (index: number) => pages.get(pageOf(index))?.[index % PAGE_SIZE],
    [pages],
  );

  const loadedRows = useMemo(
    () => [...pages.values()].reduce((sum, page) => sum + page.length, 0),
    [pages],
  );

  const source = useMemo<TrackTableSource<LibraryTrackRow>>(
    () => ({ total, getRow, requestWindow, status, error }),
    [total, getRow, requestWindow, status, error],
  );

  return {
    source,
    total,
    status,
    error,
    libraryEmpty,
    loading: !loaded && status !== "error",
    retry,
    loadedRows,
  };
}
