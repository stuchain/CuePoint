/**
 * The engine reads more than one screen makes, as shared descriptors (C19d).
 *
 * A key names a read in the engine-read cache (`engineReads.ts`), so two
 * screens that read the same thing must use the same key: the playlist tree the
 * Library draws is the one Prepare and Clean offer as a picker, and a screen
 * shown again finds it there instead of asking the engine once per visit. They
 * live in one module for that reason, so a key is spelled once.
 *
 * A read that takes parameters is a function that returns its descriptor, and
 * its key carries every parameter: a key that leaves one out would serve one
 * parameter's answer for another.
 */
import { useEffect, useRef } from "react";

import { reportUnexpected } from "../reporting/reporting";
import type { CuePointBridge, KeySource } from "./cuepointBridge.types";
import { useEngineRead, type EngineRead, type ReadDomain } from "./engineReads";

type Bridge = Partial<CuePointBridge>;

/** One read: its cache key, what makes it stale, and how to ask the engine. */
export interface SharedRead<T> {
  key: string;
  domains: ReadDomain[];
  /** False when this shell has no such bridge method (a browser tab, an older shell). */
  available: () => boolean;
  read: () => Promise<T>;
}

function bridge(): Bridge | undefined {
  return typeof window === "undefined" ? undefined : window.cuepoint;
}

type Method = {
  [K in keyof CuePointBridge]-?: CuePointBridge[K] extends ((...args: never[]) => Promise<unknown>) | undefined
    ? K
    : never;
}[keyof CuePointBridge];

type Answer<K extends Method> = Awaited<ReturnType<NonNullable<CuePointBridge[K]>>>;

/** A descriptor over one bridge method, called with `args` (none for a plain read). */
function over<K extends Method>(
  method: K,
  key: string,
  domains: ReadDomain[],
  args: unknown[] = [],
): SharedRead<Answer<K>> {
  return {
    key,
    domains,
    available: () => typeof bridge()?.[method] === "function",
    read: () => {
      const call = bridge()?.[method] as ((...a: unknown[]) => Promise<Answer<K>>) | undefined;
      if (!call) return Promise.reject(new Error(`The bridge has no ${String(method)}.`));
      return call.call(bridge(), ...args);
    },
  };
}

// ---------------------------------------------------------------- the library

export const LIBRARY_SUMMARY = over("getLibrarySummary", "library/summary", ["library"]);
export const LIBRARY_PLAYLISTS = over("getLibraryPlaylists", "library/playlists", ["library"]);
export const COLLECTIONS = over("getCollections", "library/collections", ["library"]);
export const TAGS = over("getTags", "library/tags", ["library"]);
export const LIBRARY_FILTER_FIELDS = over("getLibraryFilterFields", "library/filter-fields", ["library"]);
export const LIBRARY_HEALTH = over("getLibraryHealth", "library/health", ["library"]);
export const CLEAN_PLAYLISTS = over("getCleanPlaylists", "clean/playlists", ["library"]);

/** The Keys page's population over its sources (the key lists every one). */
export function keysPopulation(sources: KeySource[]): SharedRead<Answer<"getKeysPopulation">> {
  return over("getKeysPopulation", `keys/population?${JSON.stringify(sources)}`, ["library"], [{ sources }]);
}

// ----------------------------------------------------------------- statistics

type PlaysParams = Parameters<NonNullable<CuePointBridge["getStatisticsPlays"]>>[0];
type ScopeParams = Parameters<NonNullable<CuePointBridge["getStatisticsSpreads"]>>[0];

export function statisticsPlays(params?: PlaysParams): SharedRead<Answer<"getStatisticsPlays">> {
  return over("getStatisticsPlays", `statistics/plays?${JSON.stringify(params ?? {})}`, ["library"], [params]);
}

// The engine caches spreads and health on the library and the waveforms (loudness, analysis counts).
export function statisticsSpreads(params?: ScopeParams): SharedRead<Answer<"getStatisticsSpreads">> {
  return over("getStatisticsSpreads", `statistics/spreads?${JSON.stringify(params ?? {})}`, ["library", "waveforms"], [params]);
}

export function statisticsHealth(params?: ScopeParams): SharedRead<Answer<"getStatisticsHealth">> {
  return over("getStatisticsHealth", `statistics/health?${JSON.stringify(params ?? {})}`, ["library", "waveforms"], [params]);
}

// ------------------------------------------------------------------- discover

/** The options a run starts from; they report the token, so a sign-in changes them too. */
export const DISCOVER_OPTIONS = over("getDiscoverOptions", "discover/options", ["discover", "settings"]);

type RunsParams = Parameters<NonNullable<CuePointBridge["listDiscoveryRuns"]>>[0];

export function discoveryRuns(params?: RunsParams): SharedRead<Answer<"listDiscoveryRuns">> {
  return over("listDiscoveryRuns", `discover/runs?${JSON.stringify(params ?? {})}`, ["discover"], [params]);
}

// ------------------------------------------------------------------- settings

export const BEATPORT_TOKEN_STATUS = over("getBeatportTokenStatus", "settings/beatport-token", ["settings"]);

export function exportHistory(limit?: number): SharedRead<Answer<"getRekordboxExportHistory">> {
  return over(
    "getRekordboxExportHistory",
    `library/export-history?${JSON.stringify({ limit: limit ?? null })}`,
    ["library"],
    [limit === undefined ? undefined : { limit }],
  );
}

// ------------------------------------------------------------------------ use

export interface SharedReadState<T> extends EngineRead<T> {
  /** The shell has no bridge method for this read; nothing was asked. */
  unavailable: boolean;
}

/**
 * Reads a descriptor through the shared cache; an absent bridge method reads nothing.
 * `enabled` false reads (and shows) nothing either, for a read that waits for something.
 */
export function useSharedRead<T>(descriptor: SharedRead<T>, enabled = true): SharedReadState<T> {
  const unavailable = !descriptor.available();
  const state = useEngineRead<T>(unavailable || !enabled ? null : descriptor.key, descriptor.read, {
    domains: descriptor.domains,
  });
  return { ...state, unavailable };
}

const reported = new WeakSet<object>();

/**
 * Hands each failed read to `reportUnexpected` once, however many screens and
 * visits show it: the cache keeps a failure beside an old value, and mounting
 * again must not report it again.
 */
export function useReportReadError(error: unknown): void {
  useEffect(() => {
    if (error === undefined || error === null) return;
    if (typeof error === "object") {
      if (reported.has(error)) return;
      reported.add(error);
    }
    reportUnexpected(error);
  }, [error]);
}

const handled = new WeakSet<object>();

/**
 * Runs `onError` once for each new failure (a toast, a message), however many times
 * the page mounts: the cache keeps a failure beside an old value, and a page shown
 * again must not say it a second time.
 */
export function useOnReadError(error: unknown, onError: (error: unknown) => void): void {
  const latest = useRef(onError);
  latest.current = onError;
  const last = useRef<unknown>(undefined);
  useEffect(() => {
    if (error === undefined || error === null) return;
    if (typeof error === "object") {
      if (handled.has(error)) return;
      handled.add(error);
    } else {
      if (last.current === error) return;
      last.current = error;
    }
    latest.current(error);
  }, [error]);
}
