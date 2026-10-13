/**
 * The Statistics page's reads (STATS-04): one hook per route, over one scope.
 *
 * Each goes through the shared cache (C19d), keyed by its scope and parameters: a page shown
 * again has its answers at once, and they are read again when the library announces a
 * change or an import or a refresh ends. Try again reads now. A scope of `null` means
 * "not yet": the page is still finding out whether there is a library and which scope is
 * still there, and a read made earlier would only be wasted.
 */
import { useEffect, useMemo, useRef } from "react";

import type {
  CollectionNode,
  LibraryPlaylistNode,
  StatisticsHealth,
  StatisticsPlays,
  StatisticsSpreads,
} from "../../api/cuepointBridge.types";
import { onJobFinished, subscribeActiveJobs } from "../../api/jobsStore";
import { bridgeErrorFields, isEngineRefusal } from "../../api/bridgeError";
import {
  COLLECTIONS,
  LIBRARY_PLAYLISTS,
  statisticsHealth,
  statisticsPlays,
  statisticsSpreads,
  useOnReadError,
  useReportReadError,
  useSharedRead,
  type SharedRead,
} from "../../api/sharedReads";
import { reportUnexpected } from "../../reporting/reporting";
import { playsParams, type PlaysChoice } from "./playsChoice";

type ReadStatus = "loading" | "ready" | "error" | "unavailable";

interface StatisticsRead<T> {
  status: ReadStatus;
  data: T | null;
  retry: () => void;
}

/**
 * True for the engine's "no such scope" while the trees that name the scopes are being read
 * again: the scope on screen was read at the same moment the trees were, and is about to be
 * replaced by one they still have, so its refusal is not a failure.
 */
function isScopeGone(error: unknown, treesRefreshing: boolean): boolean {
  return treesRefreshing && error !== undefined && bridgeErrorFields(error).status === 404;
}

function useStatisticsRead<T>(
  descriptor: (params: { scope: string }) => SharedRead<T>,
  scope: string | null,
  treesRefreshing = false,
): StatisticsRead<T> {
  const read = useSharedRead(descriptor({ scope: scope ?? "" }), scope !== null);
  useReportReadError(read.error);
  // The key carries the scope, so an answer for another scope is never this scope's answer.
  const data = read.value ?? null;
  const status: ReadStatus =
    scope !== null && read.unavailable
      ? "unavailable"
      : data
        ? "ready"
        : read.error !== undefined && !isScopeGone(read.error, treesRefreshing)
          ? "error"
          : "loading";
  return { status, data, retry: read.refresh };
}

interface PlaysRead extends StatisticsRead<StatisticsPlays> {
  /** True while an answer is shown and a newer one is being read. */
  stale: boolean;
  /** True when the last read failed; the earlier answer, if any, is still in `data`. */
  failed: boolean;
}

/**
 * Plays: the most played tracks, artists and labels, and the never-played counts, for a
 * choice of length and "since" (STATS-05).
 *
 * A new choice keeps the last answer on screen (marked `stale`) until the next one arrives, so
 * the controls that made it are not torn down under the person's hands; a read that fails
 * with an answer on screen sets `failed` and leaves the answer, and the page says so beside
 * it. "Your last refresh" is asked of the route by the id of the last read, which only a read
 * can report: the first ask is without it (its own cached read), and the answer is asked for
 * again with the id it named. An id the route no longer knows (404) is forgotten, so the
 * first ask is made again and learns it again.
 */
export function useStatisticsPlays(
  scope: string | null,
  choice: PlaysChoice,
  treesRefreshing = false,
): PlaysRead {
  const { limit, since } = choice;
  const sinceRefresh = since === "refresh";
  const known = scope !== null;
  // "Today" is worked out at each render, so a page left open past midnight counts
  // "the last 7 days" from the new day (its key moves with the day).
  const first = known ? { ...playsParams({ limit, since }, null, new Date()), scope } : undefined;
  const learn = useSharedRead(statisticsPlays(first), known && sinceRefresh);
  const learnedId = learn.value?.last_read_id;
  const learning = learnedId === undefined || learnedId === null;
  const asked =
    known && sinceRefresh
      ? learning
        ? undefined
        : { ...playsParams({ limit, since }, learnedId, new Date()), scope }
      : first;
  const main = useSharedRead(statisticsPlays(asked), asked !== undefined);
  // Until the last read's id is known (or when there is none), the first ask is the answer.
  const shown = sinceRefresh && learning ? learn : main;

  const forgotten =
    sinceRefresh && bridgeErrorFields(main.error).status === 404 && !isScopeGone(main.error, treesRefreshing);
  const relearn = learn.refresh;
  const refreshingNow = useRef(treesRefreshing);
  refreshingNow.current = treesRefreshing;
  // "Your last refresh" is asked by the id of the last read; the answer names the newest
  // one, and when that is not the id learned, the learned one is out of date (a refresh
  // since it was read, with nothing announced to this page): learn it again.
  const answeredId = main.value?.last_read_id;
  useEffect(() => {
    if (!sinceRefresh || answeredId === undefined || answeredId === null) return;
    if (learnedId !== undefined && learnedId !== null && answeredId !== learnedId) relearn();
  }, [sinceRefresh, answeredId, learnedId, relearn]);
  useOnReadError(main.error, (cause) => {
    // The scope is gone from the trees being read: the page moves to one they have.
    if (isScopeGone(cause, refreshingNow.current)) return;
    if (sinceRefresh && bridgeErrorFields(cause).status === 404) {
      // That read is gone (the history was cleared): learn the last one again.
      relearn();
      return;
    }
    if (!isEngineRefusal(cause)) reportUnexpected(cause);
  });
  useOnReadError(learn.error, (cause) => {
    if (!isEngineRefusal(cause)) reportUnexpected(cause);
  });

  // The last answer for this scope stays up while the next is read.
  const last = useRef<{ scope: string; data: StatisticsPlays } | null>(null);
  const own = shown.value ?? null;
  if (own && scope !== null) last.current = { scope, data: own };
  const data = own ?? (scope !== null && last.current?.scope === scope ? last.current.data : null);
  const failed = shown.error !== undefined && !forgotten && !isScopeGone(shown.error, treesRefreshing);
  const reading = shown.loading || shown.refreshing || forgotten;

  const status: ReadStatus =
    known && shown.unavailable ? "unavailable" : data ? "ready" : failed ? "error" : "loading";
  return { status, data, retry: shown.refresh, stale: data !== null && reading && !failed, failed };
}

/** Your library: how the scope spreads by genre, tempo, year, date added, rating and loudness. */
export function useStatisticsSpreads(scope: string | null, treesRefreshing = false) {
  return useStatisticsRead<StatisticsSpreads>(statisticsSpreads, scope, treesRefreshing);
}

/** Health: file, Beatport and analysis counts. */
export function useStatisticsHealth(scope: string | null, treesRefreshing = false) {
  return useStatisticsRead<StatisticsHealth>(statisticsHealth, scope, treesRefreshing);
}

/** The work whose end changes what Statistics counts: a new library, or a refresh of it. */
const LIBRARY_JOBS: ReadonlySet<string> = new Set(["library_import", "library_refresh_apply"]);

/**
 * Calls `onFinished` when an import or a refresh that was running is gone from the active
 * work. It is found by the shared job poll (without its progress stream), because one can be
 * started from the Library or the menu while this page is open, and nothing announces its end.
 *
 * The store decides what counts as finished: a poll that failed says nothing about what is
 * running, and one that is not listed while more are active than were listed is not known to
 * be finished either. Subscribing to the poll here is what keeps it running while this page
 * is the only reader.
 */
export function useLibraryJobsFinished(onFinished: () => void, pollMs?: number): void {
  const latest = useRef(onFinished);
  latest.current = onFinished;

  useEffect(() => {
    const stopPolling = subscribeActiveJobs(() => {}, pollMs);
    // An import and a refresh that end in one poll read the library once.
    let due = false;
    let live = true;
    const stopListening = onJobFinished((job) => {
      if (!LIBRARY_JOBS.has(job.type) || due) return;
      due = true;
      queueMicrotask(() => {
        due = false;
        if (live) latest.current();
      });
    });
    return () => {
      live = false;
      stopListening();
      stopPolling();
    };
  }, [pollMs]);
}

interface StatisticsTrees {
  playlists: LibraryPlaylistNode[];
  collections: CollectionNode[];
  /**
   * True once both trees have answered, or failed to, so the scope can be judged. A tree read
   * again behind the one shown does not unsettle it: the scope is judged again when it lands.
   */
  settled: boolean;
  /** True while either tree is being read again behind the one shown. */
  refreshing: boolean;
}

/**
 * The Rekordbox playlists and CuePoint's Collections the picker offers, read as Clean's scope
 * list reads them. One failing leaves its part empty rather than the page without a picker.
 */
export function useStatisticsTrees(): StatisticsTrees {
  const playlists = useSharedRead(LIBRARY_PLAYLISTS);
  const collections = useSharedRead(COLLECTIONS);
  const playlistNodes = playlists.value?.playlists;
  const collectionNodes = collections.value?.collections;
  const settled =
    (playlists.value !== undefined || playlists.error !== undefined || playlists.unavailable) &&
    (collections.value !== undefined || collections.error !== undefined || collections.unavailable);
  const refreshing = playlists.refreshing || collections.refreshing;
  return useMemo(
    () => ({ playlists: playlistNodes ?? [], collections: collectionNodes ?? [], settled, refreshing }),
    [playlistNodes, collectionNodes, settled, refreshing],
  );
}
