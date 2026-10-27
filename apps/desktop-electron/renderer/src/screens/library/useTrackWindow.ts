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
 *
 * **A new question does not blank the table (M369).** The rows and the total
 * that answered the last question stay on screen, marked `stale` (the table
 * dims them), until the first page of the new answer lands; a filter or a
 * search typed letter by letter no longer flashes an empty table.
 *
 * **A change can be shown before the engine has it (M382).** `patch` lays a
 * change over the rows it matches for a while, through reloads, so a rating
 * or a favorite from a menu is on screen at once; `unpatch` takes it back
 * when the engine refuses it.
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
import { reportUnexpected } from "../../reporting/reporting";
import { NEEDS_DESKTOP, userMessage } from "../../api/userMessage";

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
const PREFETCH_ROWS = 100;

interface TrackWindow {
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
  /**
   * Ask the whole window again, unchanged.
   *
   * For when the library moved under a query that did not: after a refresh or
   * an import the question is word for word the same and every answer to it is
   * stale, which no comparison of queries can notice.
   */
  reload: () => void;
  /** How many rows are held in memory, for tests and diagnostics. */
  loadedRows: number;
  /**
   * True while the rows shown answer the previous question, kept until the new answer's first page
   * lands (M369): the table dims them.
   */
  stale: boolean;
  /**
   * Show a change over the rows `match` picks, at once and for `ms` (M382). Returns the patch's id,
   * for `unpatch`. The rows the engine sends meanwhile are patched too, so a reload does not flash
   * the old value back.
   */
  patch: (match: (row: LibraryTrackRow) => boolean, change: (row: LibraryTrackRow) => LibraryTrackRow, ms?: number) => number;
  /** Take a patch back: the engine refused the change. */
  unpatch: (id: number) => void;
  /**
   * Which question the rows answer: changes with the query and with every
   * reload (CLEAN-12).
   */
  identity: string;
  /**
   * True once a response to `identity` has landed.
   *
   * What a caller waits for after `reload` when it means to act on the rows
   * the new answer holds: until then, the rows on screen are the old answer's.
   * The review queue selects the next track this way after a decision takes
   * one out of it.
   */
  answered: boolean;
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
  // A reload is a new identity for the same question, so everything below —
  // the reset, the first page, and what counts as a stale response — treats it
  // as it treats a change of sort, except that the old total stands until the
  // new answer lands.
  const [generation, setGeneration] = useState(0);
  const identity = `${generation}\u0000${key}`;

  const [pages, setPages] = useState<Map<number, LibraryTrackRow[]>>(new Map());
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<TrackTableStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [libraryEmpty, setLibraryEmpty] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [answeredIdentity, setAnsweredIdentity] = useState<string | null>(null);
  // The previous question's rows and total, shown dimmed until the new answer lands (M369).
  const [previous, setPrevious] = useState<{ pages: Map<number, LibraryTrackRow[]>; total: number } | null>(null);
  const pagesNow = useRef(pages);
  pagesNow.current = pages;
  const totalNow = useRef(total);
  totalNow.current = total;
  // Changes shown before the engine has them (M382).
  const [patches, setPatches] = useState<
    Array<{ id: number; match: (row: LibraryTrackRow) => boolean; change: (row: LibraryTrackRow) => LibraryTrackRow }>
  >([]);
  const patchId = useRef(0);
  const patchTimers = useRef<Map<number, number>>(new Map());

  // What is being fetched, and what is worth keeping. Refs rather than state:
  // changing them must not re-render, and the effect that reads them runs
  // between renders.
  const inFlight = useRef<Set<number>>(new Set());
  const centre = useRef(0);
  const queryRef = useRef(identity);
  const failedPages = useRef<Set<number>>(new Set());
  // What is held, tracked beside the state that holds it. React commits state
  // between renders, and a scroll produces several windows before any of them
  // commits — reading the state here would re-request pages that arrived a
  // moment ago and have not been rendered yet.
  const loadedPages = useRef<Set<number>>(new Set());

  // The question the held total answers, to tell a reload from a new question.
  const totalKey = useRef(key);

  // The question the effects below last reset for, and whether this run of them is the page
  // being shown again (a kept-alive page re-runs its effects on show with nothing changed).
  const resetFor = useRef<string | null>(null);
  const shownAgain = useRef(false);
  // Pages that had failed when the page was hidden: asked for again on show.
  const failedBeforeShow = useRef<number[]>([]);

  // A new question: everything loaded belongs to the old one.
  useEffect(() => {
    if (resetFor.current === identity) {
      // Shown again with the same question: the rows on screen are kept (the table would
      // otherwise draw skeletons until the engine answers) and the pages near the window are
      // asked for again behind them. Pages further away are let go, so no stale row is
      // scrolled back to.
      shownAgain.current = true;
      // A failure before the page was hidden is no reason to keep refusing the page: the
      // engine may be back, and a failed page left out would be a gap in a "ready" table.
      failedBeforeShow.current = [...failedPages.current];
      failedPages.current = new Set();
      const near = (page: number) => Math.abs(page - centre.current) <= 1;
      loadedPages.current = new Set([...loadedPages.current].filter(near));
      setPages((previous) => {
        const kept = new Map([...previous].filter(([page]) => near(page)));
        return kept.size === previous.size ? previous : kept;
      });
      return;
    }
    resetFor.current = identity;
    queryRef.current = identity;
    inFlight.current = new Set();
    failedPages.current = new Set();
    loadedPages.current = new Set();
    centre.current = 0;
    // What is on screen stays, dimmed, until the new answer lands (M369). When nothing landed for
    // the question before this one either, the rows before that are still the ones shown.
    const held = pagesNow.current;
    if (held.size > 0) setPrevious({ pages: held, total: totalNow.current });
    setPages(new Map());
    // A reload asks the same question again, so the old answer's total stands
    // until the new one lands. Dropping it to 0 would read an "everything
    // matching" selection as nothing selected, and switch off every button of
    // the selection bar, for as long as the reload takes.
    if (totalKey.current !== key) setTotal(0);
    totalKey.current = key;
    setLoaded(false);
    setError(null);
    setStatus("loading");
  }, [identity, key]);

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
    (wanted: number[], again = false): boolean => {
      const bridge = window.cuepoint?.browseLibrary;
      if (!bridge) {
        setStatus("error");
        setError(NEEDS_DESKTOP);
        return false;
      }

      const missing = wanted.filter(
        (page) =>
          !inFlight.current.has(page) &&
          !failedPages.current.has(page) &&
          (again || !loadedPages.current.has(page)),
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
        const askedFor = identity;

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
            setAnsweredIdentity(askedFor);
            setPrevious(null);
            setError(null);
            setStatus("ready");
            setPages((previous) => {
              const next = new Map(previous);
              for (let page = first; page <= lastPage; page += 1) {
                const slice = response.tracks.slice(
                  (page - first) * PAGE_SIZE,
                  (page - first + 1) * PAGE_SIZE,
                );
                // A page that now answers empty (the library shrank) lets go of its old rows.
                if (slice.length > 0) next.set(page, slice);
                else next.delete(page);
              }
              for (const page of pagesToEvict([...next.keys()], centre.current)) {
                next.delete(page);
              }
              loadedPages.current = new Set(next.keys());
              return next;
            });
          })
          .catch((cause: unknown) => {
            reportUnexpected(cause);
            for (let page = first; page <= lastPage; page += 1) {
              inFlight.current.delete(page);
              // Remembered, so a failing page is not asked for again on every
              // scroll event until the user retries.
              failedPages.current.add(page);
            }
            if (askedFor !== queryRef.current) return;
            // A failure is said over an empty table, not over the last question's rows.
            setPrevious(null);
            setStatus("error");
            setError(userMessage(cause));
          });
      }
      return true;
    },
    [identity, query],
  );

  // The first page, so the table knows how many rows there are before anyone
  // scrolls. Without it an empty table would never ask for anything.
  useEffect(() => {
    if (shownAgain.current) {
      // Shown again: ask for the first page and the window's pages once more, held ones included.
      shownAgain.current = false;
      const near = [...loadedPages.current, ...failedBeforeShow.current];
      failedBeforeShow.current = [];
      fetchPages([...new Set([0, ...near])], true);
      return;
    }
    fetchPages([0]);
    // Deliberately keyed on the query, not on fetchPages: this runs once per
    // question, and fetchPages is rebuilt on every render of a new query.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  const requestWindow = useCallback(
    (startIndex: number, endIndex: number) => {
      centre.current = pageOf(Math.floor((startIndex + endIndex) / 2));
      fetchPages(pagesForRange(startIndex, endIndex, total));
    },
    [fetchPages, total],
  );

  const reload = useCallback(() => setGeneration((value) => value + 1), []);

  const retry = useCallback(() => {
    failedPages.current = new Set();
    setError(null);
    setStatus("loading");
    // Nothing to ask for means nothing was missing: say so rather than leaving
    // a table that says it is loading and never will be.
    if (!fetchPages([centre.current])) setStatus("ready");
  }, [fetchPages]);

  const stale = previous !== null && answeredIdentity !== identity;
  const shownPages = stale ? previous.pages : pages;
  const shownTotal = stale ? previous.total : total;

  const getRow = useCallback(
    (index: number) => {
      const row = shownPages.get(pageOf(index))?.[index % PAGE_SIZE];
      if (!row || patches.length === 0) return row;
      return patches.reduce((current, entry) => (entry.match(current) ? entry.change(current) : current), row);
    },
    [patches, shownPages],
  );

  const unpatch = useCallback((id: number) => {
    window.clearTimeout(patchTimers.current.get(id));
    patchTimers.current.delete(id);
    setPatches((list) => list.filter((entry) => entry.id !== id));
  }, []);

  const patch = useCallback(
    (match: (row: LibraryTrackRow) => boolean, change: (row: LibraryTrackRow) => LibraryTrackRow, ms = 2000) => {
      patchId.current += 1;
      const id = patchId.current;
      setPatches((list) => [...list, { id, match, change }]);
      patchTimers.current.set(id, window.setTimeout(() => unpatch(id), ms));
      return id;
    },
    [unpatch],
  );

  useEffect(() => {
    const timers = patchTimers.current;
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);

  const loadedRows = useMemo(
    () => [...pages.values()].reduce((sum, page) => sum + page.length, 0),
    [pages],
  );

  const source = useMemo<TrackTableSource<LibraryTrackRow>>(
    () => ({ total: shownTotal, getRow, requestWindow, status, error }),
    [shownTotal, getRow, requestWindow, status, error],
  );

  return {
    source,
    total: shownTotal,
    status,
    error,
    libraryEmpty,
    loading: !loaded && status !== "error",
    retry,
    reload,
    loadedRows,
    stale,
    patch,
    unpatch,
    identity,
    answered: answeredIdentity === identity,
  };
}
