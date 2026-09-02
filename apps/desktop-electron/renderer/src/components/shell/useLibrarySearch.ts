import { useCallback, useEffect, useRef, useState } from "react";
import type { LibrarySearchResponse } from "../../api/cuepointBridge.types";

/** How long typing settles before a request goes out. */
export const SEARCH_DEBOUNCE_MS = 200;

/** Below this, a query is not worth a round trip or a results panel. */
export const MIN_QUERY_LENGTH = 2;

export type SearchStatus =
  | "idle"
  | "searching"
  | "results"
  | "no-results"
  | "empty-library"
  | "unavailable"
  | "error";

export interface LibrarySearchState {
  status: SearchStatus;
  response: LibrarySearchResponse | null;
  error: string | null;
}

/** What a query and a response mean together, as a pure function.
 *
 * Kept separate from the hook so the interesting part — telling "no library
 * yet" apart from "no matches", which are different problems with different
 * answers — is testable without rendering or faking timers. */
export function statusFor(
  query: string,
  response: LibrarySearchResponse | null,
): SearchStatus {
  if (query.trim().length < MIN_QUERY_LENGTH) return "idle";
  if (!response) return "searching";
  if (response.library_empty) return "empty-library";
  return response.total > 0 ? "results" : "no-results";
}

/** Whether a query is worth sending to the engine at all. */
export function shouldSearch(query: string): boolean {
  return query.trim().length >= MIN_QUERY_LENGTH;
}

/**
 * Debounced library search against the engine (DEC-023).
 *
 * Search-as-you-type over a 50,000-track library needs the debounce and the
 * server-side limit from the start, not once it feels slow. Responses are
 * dropped when a newer query has already been typed, so a slow early request
 * cannot overwrite the results of a later one.
 */
export function useLibrarySearch(query: string): LibrarySearchState {
  const [state, setState] = useState<LibrarySearchState>({
    status: "idle",
    response: null,
    error: null,
  });
  // Identifies the query a response belongs to, so a stale one can be dropped.
  const latest = useRef(0);

  useEffect(() => {
    if (!shouldSearch(query)) {
      latest.current += 1;
      setState({ status: "idle", response: null, error: null });
      return;
    }

    const search = window.cuepoint?.searchLibrary;
    if (!search) {
      // The renderer runs in a plain browser tab during development, where
      // there is no bridge at all.
      setState({ status: "unavailable", response: null, error: null });
      return;
    }

    const token = (latest.current += 1);
    setState((prev) => ({ ...prev, status: "searching", error: null }));

    const timer = setTimeout(() => {
      void search({ q: query.trim() })
        .then((response) => {
          if (token !== latest.current) return;
          setState({ status: statusFor(query, response), response, error: null });
        })
        .catch((cause: unknown) => {
          if (token !== latest.current) return;
          setState({
            status: "error",
            response: null,
            error: cause instanceof Error ? cause.message : String(cause),
          });
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query]);

  return state;
}

/** Formats "showing 20 of 340", using the unpaged total the engine returns. */
export function resultSummary(response: LibrarySearchResponse | null): string {
  if (!response || response.total === 0) return "";
  const shown = response.tracks.length;
  return shown < response.total
    ? `Showing ${shown} of ${response.total}`
    : `${response.total} ${response.total === 1 ? "result" : "results"}`;
}

/** A stable, human-readable second line for a result row. */
export function trackSubtitle(track: {
  album: string | null;
  label: string | null;
  bpm: number | null;
  key: string | null;
}): string {
  return [track.album, track.label, track.bpm ? `${track.bpm} BPM` : null, track.key]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
}

export function useSearchInputRef() {
  const ref = useRef<HTMLInputElement>(null);
  const focus = useCallback(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return { ref, focus };
}
