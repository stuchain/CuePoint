/**
 * The Playlists view's data (C22, G4 §2.2): one read of `getCleanPlaylists`.
 *
 * Read through the shared cache (C19d), which reads again whenever something announces a
 * library change (a decision, an undo, a write) or a job ends. While a match runs the
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
import { CLEAN_PLAYLISTS, useReportReadError, useSharedRead } from "../../../api/sharedReads";
import { NEEDS_DESKTOP, userMessage } from "../../../api/userMessage";
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
  // Read through the shared cache (C19d): a page shown again has its rows at once, and the
  // cache reads again when the library announces a change or a job ends. Nothing is read
  // while the page is off Match or hidden; the last rows stay in hand meanwhile.
  // The read now running, so the poll below waits for it rather than overtaking it
  // (an overtaken read's answer is dropped).
  const pending = useRef<Promise<void> | null>(null);
  const tracked = useCallback(() => {
    const answer = CLEAN_PLAYLISTS.read();
    const settled: Promise<void> = answer
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        if (pending.current === settled) pending.current = null;
      });
    pending.current = settled;
    return answer;
  }, []);
  const read = useSharedRead({ ...CLEAN_PLAYLISTS, read: tracked }, active);
  const { refresh } = read;
  useReportReadError(read.error);
  const last = useRef<CleanPlaylists | null>(null);
  if (read.value) last.current = read.value;
  const data = read.value ?? last.current;

  // While a match runs: the next read is scheduled when the last has settled.
  useEffect(() => {
    if (!matching || !active) return;
    let stopped = false;
    let timer: number | undefined;
    const next = () => {
      timer = window.setTimeout(() => {
        if (!pending.current) refresh();
        void (pending.current ?? Promise.resolve()).then(() => {
          if (!stopped) next();
        });
      }, PLAYLISTS_POLL_MS);
    };
    next();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [matching, active, refresh]);

  // Once when the match ends, so the rows move to waiting or ready to save.
  const wasMatching = useRef(matching);
  useEffect(() => {
    if (wasMatching.current && !matching && active) refresh();
    wasMatching.current = matching;
  }, [matching, active, refresh]);

  const unavailable = read.unavailable;
  const error = unavailable ? NEEDS_DESKTOP : !data && read.error !== undefined ? userMessage(read.error) : null;
  const loading = !unavailable && data === null && error === null;
  return { data, error, loading, reload: refresh };
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
