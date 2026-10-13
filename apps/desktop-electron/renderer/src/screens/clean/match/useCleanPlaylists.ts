/**
 * The Playlists view's data (C22, G4 §2.2): one read of `getCleanPlaylists`.
 *
 * Read on mount and whenever something announces a library change
 * (`useLibraryChanges`: a decision, an undo, a write). While a match runs the
 * rows say "Matching x of y", so the next read follows two seconds after the
 * last one settled, and one more when the match ends so the rows move to
 * "waiting" or "ready to save". A build without the route says so (`NEEDS_DESKTOP`).
 *
 * The ticks live beside it (`usePlaylistTicks`), because the page header
 * reads them: a row is ticked by its key, `library` for the whole library and
 * `playlist:12` for a playlist, the scope values `cleanRules.ts` already uses.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CleanPlaylistCounts, CleanPlaylists, CleanPlaylistStatus } from "../../../api/cuepointBridge.types";
import { useLibraryChanges } from "../../../api/libraryChanges";
import { NEEDS_DESKTOP, userMessage } from "../../../api/userMessage";
import { reportUnexpected } from "../../../reporting/reporting";
import { WHOLE_LIBRARY } from "../cleanRules";

/** How often the rows are read again while a match runs. */
export const PLAYLISTS_POLL_MS = 2000;

export interface CleanPlaylistsState {
  data: CleanPlaylists | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * `active` is whether the Clean page is on screen and on Match: a hidden page
 * keeps its state but neither polls nor reads on a change, and reads once when
 * it is shown again.
 */
export function useCleanPlaylists(matching: boolean, active = true): CleanPlaylistsState {
  const [data, setData] = useState<CleanPlaylists | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const newest = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // One read. A read is never cancelled: an answer that a newer read has overtaken is dropped.
  const reload = useCallback((): Promise<void> => {
    const bridge = window.cuepoint?.getCleanPlaylists;
    if (!bridge) {
      setLoading(false);
      setError(NEEDS_DESKTOP);
      return Promise.resolve();
    }
    const mine = ++newest.current;
    const read = bridge()
      .then((payload) => {
        if (!alive.current || mine !== newest.current) return;
        setData(payload);
        setError(null);
      })
      .catch((cause: unknown) => {
        reportUnexpected(cause);
        if (alive.current && mine === newest.current) setError(userMessage(cause));
      })
      .finally(() => {
        if (alive.current && mine === newest.current) setLoading(false);
      })
      .finally(() => {
        if (inFlight.current === read) inFlight.current = null;
      });
    inFlight.current = read;
    return read;
  }, []);

  // On mount, and again each time the page is shown.
  useEffect(() => {
    if (active) void reload();
  }, [active, reload]);

  useLibraryChanges(() => {
    if (active) void reload();
  });

  // While a match runs: the next read is scheduled when the last has settled.
  useEffect(() => {
    if (!matching || !active) return;
    let stopped = false;
    let timer: number | undefined;
    const next = () => {
      timer = window.setTimeout(() => {
        // A read already on its way is waited for, not overtaken: its answer would be dropped.
        void (inFlight.current ?? reload()).then(() => {
          if (!stopped) next();
        });
      }, PLAYLISTS_POLL_MS);
    };
    next();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [matching, active, reload]);

  // Once when the match ends, so the rows move to waiting or ready to save.
  const wasMatching = useRef(matching);
  useEffect(() => {
    if (wasMatching.current && !matching && active) void reload();
    wasMatching.current = matching;
  }, [matching, active, reload]);

  const reloadNow = useCallback(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload: reloadNow };
}

/** A playlist's tick key. */
export function playlistKey(id: number): string {
  return `playlist:${id}`;
}

/** A ticked row: its key, name, and what it holds. */
export interface TickedPlaylist {
  key: string;
  name: string;
  /** The playlist's id; null for the whole library. */
  id: number | null;
  counts: CleanPlaylistCounts;
}

export const WHOLE_LIBRARY_NAME = "Whole library";

export interface PlaylistTicks {
  ticked: ReadonlySet<string>;
  onTick: (key: string, on: boolean) => void;
  /** The ticked rows in the list's order, or just the whole library when that is ticked; a row the list no longer has is dropped. */
  rows: TickedPlaylist[];
  clear: () => void;
}

export function usePlaylistTicks(data: CleanPlaylists | null): PlaylistTicks {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const onTick = useCallback((key: string, on: boolean) => {
    setTicked((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);
  const clear = useCallback(() => setTicked(new Set()), []);
  const rows = useMemo<TickedPlaylist[]>(() => {
    if (!data) return [];
    // The whole library includes every playlist: when it is ticked it is the only row.
    if (ticked.has(WHOLE_LIBRARY)) {
      return [{ key: WHOLE_LIBRARY, name: WHOLE_LIBRARY_NAME, id: null, counts: data.whole_library }];
    }
    const out: TickedPlaylist[] = [];
    data.playlists.forEach((playlist: CleanPlaylistStatus) => {
      if (ticked.has(playlistKey(playlist.id))) {
        out.push({ key: playlistKey(playlist.id), name: playlist.name, id: playlist.id, counts: playlist });
      }
    });
    return out;
  }, [data, ticked]);
  return { ticked, onTick, rows, clear };
}
