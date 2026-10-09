/**
 * The Statistics page's reads (STATS-04): one hook per route, over one scope.
 *
 * Each reads again when the scope changes, when `refresh` moves (the library
 * changed, or an import or a refresh finished) and when Try again is pressed.
 * A scope of `null` means "not yet": the page is still finding out whether
 * there is a library and which scope is still there, and a read made earlier
 * would only be wasted.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CollectionNode,
  LibraryPlaylistNode,
  StatisticsHealth,
  StatisticsPlays,
  StatisticsSpreads,
} from "../../api/cuepointBridge.types";
import { useActiveJob } from "../../components/shell/useActiveJob";
import { bridgeErrorFields, isEngineRefusal } from "../../api/bridgeError";
import { reportUnexpected } from "../../reporting/reporting";
import { playsParams, type PlaysChoice } from "./playsChoice";

type ReadStatus = "loading" | "ready" | "error" | "unavailable";

interface StatisticsRead<T> {
  status: ReadStatus;
  data: T | null;
  retry: () => void;
}

type RouteName = "getStatisticsPlays" | "getStatisticsSpreads" | "getStatisticsHealth";

function useStatisticsRead<T>(
  route: RouteName,
  scope: string | null,
  refresh: number,
): StatisticsRead<T> {
  const [result, setResult] = useState<{ scope: string; data: T } | null>(null);
  const [failed, setFailed] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [retries, setRetries] = useState(0);

  useEffect(() => {
    if (scope === null) return;
    const read = window.cuepoint?.[route] as
      | ((params: { scope: string }) => Promise<T>)
      | undefined;
    if (!read) {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    setFailed(false);
    let cancelled = false;
    read({ scope }).then(
      (data) => {
        if (!cancelled) setResult({ scope, data });
      },
      (cause: unknown) => {
        reportUnexpected(cause);
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [route, scope, refresh, retries]);

  const retry = useCallback(() => setRetries((value) => value + 1), []);
  // An answer for another scope is not this scope's answer.
  const data = result && result.scope === scope ? result.data : null;
  const status: ReadStatus = unavailable
    ? "unavailable"
    : failed
      ? "error"
      : data
        ? "ready"
        : "loading";
  return { status, data, retry };
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
 * can report: the first ask is without it, and the answer is asked for again with the id it
 * named. An id the route no longer knows (404) is forgotten, so the next ask learns it again.
 */
export function useStatisticsPlays(
  scope: string | null,
  refresh: number,
  choice: PlaysChoice,
): PlaysRead {
  const [result, setResult] = useState<{ scope: string; data: StatisticsPlays } | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [retries, setRetries] = useState(0);
  const [readId, setReadId] = useState<number | null>(null);

  const { limit, since } = choice;
  const asking = since === "refresh" ? readId : null;

  useEffect(() => {
    if (scope === null) return;
    const read = window.cuepoint?.getStatisticsPlays;
    if (!read) {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    setFailed(false);
    setPending(true);
    let cancelled = false;
    // "Today" is read each time the page is read, so a page left open past midnight counts
    // "the last 7 days" from the new day.
    const params = playsParams({ limit, since }, asking, new Date());
    read({ ...params, scope }).then(
      (data) => {
        if (cancelled) return;
        // The route says which read is the last. If the one asked about was not it (or none was
        // asked about), ask again with that one rather than show the wrong window.
        if (since === "refresh" && data.last_read_id !== asking) {
          setReadId(data.last_read_id);
          return;
        }
        setResult({ scope, data });
        setPending(false);
      },
      (cause: unknown) => {
        if (cancelled) return;
        if (since === "refresh" && asking !== null && bridgeErrorFields(cause).status === 404) {
          // That read is gone (the history was cleared): learn the last one again.
          setReadId(null);
          return;
        }
        if (!isEngineRefusal(cause)) reportUnexpected(cause);
        setFailed(true);
        setPending(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [scope, refresh, retries, limit, since, asking]);

  const retry = useCallback(() => setRetries((value) => value + 1), []);
  const data = result && result.scope === scope ? result.data : null;
  // Without an answer a failed read is the section's; with one it is the page's, inline.
  const status: ReadStatus = unavailable
    ? "unavailable"
    : data
      ? "ready"
      : failed
        ? "error"
        : "loading";
  return { status, data, retry, stale: data !== null && pending && !failed, failed };
}

/** Your library: how the scope spreads by genre, tempo, year, date added, rating and loudness. */
export function useStatisticsSpreads(scope: string | null, refresh: number) {
  return useStatisticsRead<StatisticsSpreads>("getStatisticsSpreads", scope, refresh);
}

/** Health: file, Beatport and analysis counts. */
export function useStatisticsHealth(scope: string | null, refresh: number) {
  return useStatisticsRead<StatisticsHealth>("getStatisticsHealth", scope, refresh);
}

/** The work whose end changes what Statistics counts: a new library, or a refresh of it. */
const LIBRARY_JOBS: ReadonlySet<string> = new Set(["library_import", "library_refresh_apply"]);

/**
 * Calls `onFinished` when an import or a refresh that was running is gone from the active
 * work. It is found by the status strip's own poll (without its progress stream), because one
 * can be started from the Library or the menu while this page is open, and nothing announces
 * its end.
 *
 * A poll that failed says nothing about what is running, so it is ignored. The poll lists at
 * most a few jobs, so one that is not listed while more are active than were listed is not
 * known to be finished either.
 */
export function useLibraryJobsFinished(onFinished: () => void, pollMs?: number): void {
  const { jobs, activeCount, loaded, failed } = useActiveJob(pollMs, { subscribe: false });
  const running = useRef<Set<string>>(new Set());
  const latest = useRef(onFinished);
  latest.current = onFinished;

  useEffect(() => {
    if (!loaded || failed) return;
    const listed = new Set(jobs.map((job) => job.id));
    const hidden = activeCount > jobs.length;
    const now = new Set(jobs.filter((job) => LIBRARY_JOBS.has(job.type)).map((job) => job.id));
    let finished = false;
    for (const id of running.current) {
      if (now.has(id)) continue;
      if (hidden && !listed.has(id)) now.add(id);
      else finished = true;
    }
    running.current = now;
    if (finished) latest.current();
  }, [jobs, activeCount, loaded, failed]);
}

interface StatisticsTrees {
  playlists: LibraryPlaylistNode[];
  collections: CollectionNode[];
  /**
   * True once both trees have answered, or failed to, for the current `refresh`: the scope
   * can be judged. It is false again the moment a refresh asks, so nothing is read with a
   * scope judged against the trees of the time before.
   */
  settled: boolean;
}

/**
 * The Rekordbox playlists and CuePoint's Collections the picker offers, read as Clean's scope
 * list reads them. One failing leaves its part empty rather than the page without a picker.
 */
export function useStatisticsTrees(refresh: number): StatisticsTrees {
  const [loaded, setLoaded] = useState<{
    playlists: LibraryPlaylistNode[];
    collections: CollectionNode[];
    generation: number;
  }>({ playlists: [], collections: [], generation: -1 });

  useEffect(() => {
    const bridge = window.cuepoint;
    let cancelled = false;
    void Promise.all([
      bridge?.getLibraryPlaylists?.().catch(() => null) ?? Promise.resolve(null),
      bridge?.getCollections?.().catch(() => null) ?? Promise.resolve(null),
    ]).then(([playlists, collections]) => {
      if (cancelled) return;
      setLoaded({
        playlists: playlists?.playlists ?? [],
        collections: collections?.collections ?? [],
        generation: refresh,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  return { playlists: loaded.playlists, collections: loaded.collections, settled: loaded.generation === refresh };
}
