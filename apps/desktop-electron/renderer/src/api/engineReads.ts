/**
 * Stale-while-revalidate reads of the engine (C19d).
 *
 * A screen used to start empty and fetch on every visit, so coming back to one
 * meant a blank frame and a spinner for data it had shown a moment ago. Here a
 * read's answer is kept per key: a screen shows what it has at once and reads
 * again behind it when that answer may be out of date, then swaps the new one in.
 *
 * Plain module state shared through `useSyncExternalStore`, for the same reason
 * as the job store: what makes an answer stale (a job ending, the library
 * announcing a change) happens outside any one screen's tree.
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

import { onJobFinished, onRevisionsChanged } from "./jobsStore";
import { LIBRARY_CHANGED_EVENT } from "./libraryChanges";

/** What a cached answer depends on; a change to one of these makes it stale. */
export type ReadDomain = "library" | "waveforms" | "discover" | "settings";

const ALL_DOMAINS: readonly ReadDomain[] = ["library", "waveforms", "discover", "settings"];

/**
 * Which domains a finished job leaves stale, by job type. An import or a refresh
 * rewrites the collection every other screen derives from, so it touches all of
 * them; the rest only touch what they wrote. Types not listed (and a job whose
 * type the poll never learned, "") count as library: reading too much is cheap,
 * showing a stale library is not.
 */
export const JOB_TYPE_DOMAINS: Readonly<Record<string, readonly ReadDomain[]>> = {
  library_import: ALL_DOMAINS,
  library_refresh_apply: ALL_DOMAINS,
  clean_match: ["library"],
  tag_write: ["library"],
  tag_restore: ["library"],
  file_check: ["library"],
  library_batch: ["library"],
  duplicate_scan: ["library"],
  artwork_scan: ["library"],
  marks_backfill: ["library"],
  credit_index: ["library"],
  rekordbox_export: ["library"],
  waveform_analysis: ["waveforms"],
  discovery: ["discover"],
  beatport_playlist: ["discover"],
  beatport_resolve: ["discover"],
};

/** Entries kept, least recently used first out. */
const MAX_ENTRIES = 200;
/** How old an answer may be and still be used without asking again. */
const DEFAULT_MAX_AGE_MS = 5 * 60_000;

export interface EngineRead<T> {
  value: T | undefined;
  /** True only while there is no value yet and a read is on its way. */
  loading: boolean;
  /** True while a read runs behind a value that is already shown. */
  refreshing: boolean;
  /** The last read's failure; cleared by the next success. The value, if any, is kept. */
  error: unknown;
  /** Reads now, even if the answer is fresh. */
  refresh: () => void;
}

interface Snapshot {
  value: unknown;
  loading: boolean;
  refreshing: boolean;
  error: unknown;
}

interface Entry {
  has: boolean;
  value?: unknown;
  at: number;
  domains: readonly ReadDomain[];
  /** Invalidated since the last read began, so the answer may be out of date. */
  stale: boolean;
  /** The read now running. */
  inFlight?: Promise<void>;
  /** Invalidated while a read ran: read once more when it answers. */
  again: boolean;
  error?: unknown;
  /** A read has been started at least once, so "no value, no read" means "about to". */
  attempted: boolean;
  maxAgeMs: number;
  /** Latest reader given for this key, so an invalidation can read without a mounted caller. */
  read?: () => Promise<unknown>;
  /** Counts reads started; only the newest one may write its answer. */
  seq: number;
  listeners: Set<() => void>;
  snapshot: Snapshot;
}

/** Shown for a key nothing has read yet: the read is about to start. */
const PENDING: Snapshot = { value: undefined, loading: true, refreshing: false, error: undefined };
const IDLE: Snapshot = { value: undefined, loading: false, refreshing: false, error: undefined };

// Map order is use order: an entry is re-inserted whenever it is used.
let cache = new Map<string, Entry>();
let unwire: Array<() => void> | null = null;

function snapshotOf(entry: Entry): Snapshot {
  const running = entry.inFlight !== undefined;
  return {
    value: entry.value,
    loading: !entry.has && (running || (!entry.attempted && entry.error === undefined)),
    refreshing: entry.has && running,
    error: entry.error,
  };
}

function publish(entry: Entry): void {
  entry.snapshot = snapshotOf(entry);
  for (const listener of [...entry.listeners]) listener();
}

function entryFor(key: string): Entry {
  let entry = cache.get(key);
  if (!entry) {
    entry = {
      has: false,
      at: 0,
      domains: [],
      stale: true,
      again: false,
      attempted: false,
      maxAgeMs: DEFAULT_MAX_AGE_MS,
      seq: 0,
      listeners: new Set(),
      snapshot: PENDING,
    };
    cache.set(key, entry);
  }
  return entry;
}

function touch(key: string, entry: Entry): void {
  cache.delete(key);
  cache.set(key, entry);
  if (cache.size <= MAX_ENTRIES) return;
  for (const [oldKey, old] of cache) {
    if (cache.size <= MAX_ENTRIES) break;
    // A mounted screen is showing this one, and a running read would land in a
    // dropped entry; neither may go.
    if (old.listeners.size === 0 && old.inFlight === undefined && oldKey !== key) cache.delete(oldKey);
  }
}

function start(entry: Entry): Promise<void> {
  const read = entry.read;
  if (!read) return Promise.resolve();
  const seq = ++entry.seq;
  entry.attempted = true;
  // This read begins after everything invalidated so far; a later invalidation sets it again.
  entry.stale = false;
  entry.again = false;
  // Loading and a failure from the read before are not both shown.
  if (!entry.has) entry.error = undefined;
  let pending: Promise<unknown>;
  try {
    pending = read();
  } catch (error) {
    pending = Promise.reject(error);
  }
  const finish = () => {
    entry.inFlight = undefined;
    publish(entry);
    // Invalidated while this read ran: its answer is shown, then one more read follows.
    if (entry.again) {
      entry.again = false;
      void start(entry);
    }
  };
  const run = pending.then(
    (value) => {
      // A newer read has begun: its answer is the one to keep.
      if (seq !== entry.seq) return;
      entry.value = value;
      entry.has = true;
      entry.at = Date.now();
      entry.error = undefined;
      finish();
    },
    (error: unknown) => {
      if (seq !== entry.seq) return;
      // Never cached as an answer: the old value stays on screen and the next use reads again.
      entry.error = error;
      entry.stale = true;
      finish();
    },
  );
  entry.inFlight = run;
  publish(entry);
  return run;
}

function ensure(key: string, read: () => Promise<unknown>, domains: readonly ReadDomain[], maxAgeMs: number): void {
  const entry = entryFor(key);
  entry.read = read;
  entry.domains = domains;
  entry.maxAgeMs = maxAgeMs;
  touch(key, entry);
  if (entry.inFlight) {
    // Invalidated since it began: it may predate the change, so read again after it.
    if (entry.stale) entry.again = true;
    return;
  }
  const old = !entry.has || entry.stale || Date.now() - entry.at > maxAgeMs;
  if (old) void start(entry);
}

/**
 * Marks every cached answer that depends on one of `domains` stale. Those with a
 * mounted screen read again at once and swap in the new answer; the rest read
 * when next used. A hidden, kept-alive page has no mounted subscriber (its
 * effects are cleaned up while hidden), so it reads again when shown.
 */
export function invalidateReads(domains: readonly ReadDomain[]): void {
  for (const entry of [...cache.values()]) {
    if (!entry.domains.some((d) => domains.includes(d))) continue;
    entry.stale = true;
    if (entry.listeners.size === 0) continue;
    // A running read is let finish (restarting would starve it under steady
    // invalidations); however many arrive meanwhile cost one more read after it.
    if (entry.inFlight) entry.again = true;
    else void start(entry);
  }
}

function wire(): void {
  if (unwire) return;
  const onLibrary = () => invalidateReads(["library"]);
  window.addEventListener(LIBRARY_CHANGED_EVENT, onLibrary);
  unwire = [
    () => window.removeEventListener(LIBRARY_CHANGED_EVENT, onLibrary),
    onRevisionsChanged((domains) => invalidateReads(domains)),
    onJobFinished((job) => invalidateReads(JOB_TYPE_DOMAINS[job.type] ?? ["library"])),
  ];
}

/**
 * Reads through the shared cache. `key` must include every parameter the read
 * depends on (`"statistics/plays?" + JSON.stringify(params)`): two calls with
 * one key are one read, and a key that leaves a parameter out serves one
 * parameter's answer for another. `null` does nothing.
 */
export function useEngineRead<T>(
  key: string | null,
  read: () => Promise<T>,
  options: { domains: ReadDomain[]; maxAgeMs?: number },
): EngineRead<T> {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (key === null) return () => {};
      const entry = entryFor(key);
      entry.listeners.add(listener);
      touch(key, entry);
      return () => void entry.listeners.delete(listener);
    },
    [key],
  );
  const snapshot = useSyncExternalStore(
    subscribe,
    () => (key === null ? IDLE : (cache.get(key)?.snapshot ?? PENDING)),
  );

  const { domains, maxAgeMs = DEFAULT_MAX_AGE_MS } = options;
  // The latest reader and domains live in a ref, so a new closure each render
  // does not restart the effect (only the key does) and refresh() never reads
  // through the first render's.
  const latest = useRef({ read, domains, maxAgeMs });
  latest.current = { read, domains, maxAgeMs };
  const domainsKey = domains.join(",");
  useEffect(() => {
    if (key === null) return;
    wire();
    ensure(key, latest.current.read, latest.current.domains, latest.current.maxAgeMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see `latest`
  }, [key, domainsKey, maxAgeMs]);

  // Every render with the key is a use: keep the entry recent (a page shown
  // again after being kept alive hidden runs this too).
  useEffect(() => {
    if (key === null) return;
    const entry = cache.get(key);
    if (entry) touch(key, entry);
  });

  const refresh = useCallback(() => {
    if (key === null) return;
    const entry = entryFor(key);
    entry.read = latest.current.read;
    entry.domains = latest.current.domains;
    entry.maxAgeMs = latest.current.maxAgeMs;
    void start(entry);
  }, [key]);

  return {
    value: snapshot.value as T | undefined,
    loading: snapshot.loading,
    refreshing: snapshot.refreshing,
    error: snapshot.error,
    refresh,
  };
}

/** Puts the module back as it was at load: tests share one module instance. */
export function resetEngineReadsForTests(): void {
  for (const off of unwire ?? []) off();
  unwire = null;
  cache = new Map();
}
