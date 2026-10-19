/**
 * The Playlists view (C22): where Match opens, step 1 of "tick, match, check and sync".
 *
 * Your Rekordbox playlists, each with a **tick**, its folder path muted before the name, how many
 * tracks, and, under "In your files", a green "Synced <day>" once its values were written to the
 * files (nothing otherwise). The first row is the whole library. The box means one thing: include
 * this playlist in the match. Clicking a row only highlights it (C195); it never ticks. Tick one
 * or more playlists, or all of them from the header, and press **Match ticked playlists**: that is
 * the only way to start a match, and its label never changes, so its width does not (the count of
 * what is ticked is beside it). The whole library is its own choice: ticking it unticks and
 * disables the playlists (they are in it), and matches only the collection. A matched row has a
 * **Review** button in the row's end column. The area's one search narrows the rows by name or
 * folder, because a library has hundreds of playlists.
 *
 * The view draws and reports: matching and Review belong to the page. Stop and the progress bar
 * are on the status strip while a match runs; the playlist being matched also shows its own bar,
 * "16 of 24 · about 1 minute left" and a Stop, and one started with it but not reached says
 * Waiting. The bar under the rows says what is ticked and holds the Match button.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type { CleanPlaylistCounts, CleanPlaylists, CleanPlaylistStatus } from "../../../api/cuepointBridge.types";
import { Badge } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { EmptyState } from "../../../components/EmptyState";
import { Hint } from "../../../components/Hint";
import { Loading } from "../../../components/Loading";
import { MissingValue } from "../../../components/MissingValue";
import { Notice } from "../../../components/Notice";
import { PixelIcon } from "../../../components/PixelIcon";
import { formatCount, plural } from "../../../format/counts";
import { formatDay } from "../../../format/dates";
import { aboutDuration } from "../../../components/shell/useActiveJob";
import { RETRY, nothingMatches } from "../../../format/words";
import { displayFolderPath, MATCH_TICKED_LABEL, type MatchChoice } from "./matchPlaylists";
import { playlistStatus } from "./playlistStatus";
import { WHOLE_LIBRARY_NAME } from "./useCleanPlaylists";
import "./playlists.css";

interface PlaylistsViewProps {
  data: CleanPlaylists | null;
  /** A problem reading them, said in words. */
  error?: string | null;
  /** Read them again: the red notice offers Try again (C142). */
  onRetry?: () => void;
  loading?: boolean;
  /** What the area's one search holds: it narrows the rows by name or folder. */
  filter?: string;
  /** A match is running, here or elsewhere: one runs at a time, so Match waits. */
  matching?: boolean;
  /** Match what is ticked. */
  onMatch: (choice: MatchChoice) => void;
  /** Review: open the review of this playlist's tracks; null is the whole library. */
  onReview: (playlist: CleanPlaylistStatus | null) => void;
  /** About how many seconds the running match has left, once that can be said. */
  secondsLeft?: number | null;
  /** How far the whole running match is; a row's time left is its share of the job's. */
  progress?: { done: number; total: number } | null;
  /** Stop the running match. */
  onStop?: (jobId: string) => void;
}

/** A running playlist's share of the job's time left: by tracks left in it and in the job. */
export function rowTimeLeft(
  secondsLeft: number | null,
  job: { done: number; total: number } | null,
  row: { done: number; total: number } | null | undefined,
): number | null {
  if (secondsLeft === null || !job || !row) return null;
  const jobLeft = job.total - job.done;
  if (jobLeft <= 0) return null;
  const rowLeft = Math.max(0, Math.min(row.total - row.done, jobLeft));
  return Math.round((secondsLeft * rowLeft) / jobLeft);
}

/** The folder path before a name, "Techno / ", or nothing for a playlist at the top. */
function folderPrefix(path: string): string {
  const shown = displayFolderPath(path);
  return shown ? `${shown} / ` : "";
}

function matches(playlist: CleanPlaylistStatus, text: string): boolean {
  if (!text) return true;
  return `${displayFolderPath(playlist.path)} ${playlist.name}`.toLowerCase().includes(text);
}

/** The one mark the list makes: this playlist's values have been written to the files. */
function SyncedBadge({ at }: { at: string | null | undefined }) {
  const day = formatDay(at);
  return (
    <Badge tone="success" className="playlists__synced">
      {/* The tick: a pixel icon, never a typed one. */}
      <PixelIcon name="clean" size="sm" />
      {day ? `Synced ${day}` : "Synced"}
    </Badge>
  );
}

const WHOLE = "whole";
type RowKey = number | typeof WHOLE;

export function PlaylistsView({
  data,
  error = null,
  onRetry,
  loading = false,
  filter = "",
  matching = false,
  onMatch,
  onReview,
  secondsLeft = null,
  progress = null,
  onStop,
}: PlaylistsViewProps) {
  // What is ticked: the whole library, or some playlists by id. Never both.
  const [ticked, setTicked] = useState<ReadonlySet<RowKey>>(new Set());
  // The highlighted row: only a place to be, never a tick (C195).
  const [selected, setSelected] = useState<RowKey | null>(null);
  const headerTick = useRef<HTMLInputElement>(null);
  const text = filter.trim().toLowerCase();
  const shown = useMemo(
    () => (data ? data.playlists.filter((playlist) => matches(playlist, text)) : []),
    [data, text],
  );

  const wholeTicked = ticked.has(WHOLE);
  // Only playlists that still exist and can be matched count: a row that began matching drops out.
  const chosen = data ? data.playlists.filter((playlist) => ticked.has(playlist.id) && playlistStatus(playlist).canTick) : [];
  const choice: MatchChoice | null = wholeTicked ? { whole: true } : chosen.length > 0 ? { whole: false, playlists: chosen } : null;
  // The header tick covers the playlists on show that can be ticked.
  const tickable = shown.filter((playlist) => playlistStatus(playlist).canTick);
  const allTicked = tickable.length > 0 && tickable.every((playlist) => ticked.has(playlist.id));
  const someTicked = tickable.some((playlist) => ticked.has(playlist.id));
  useEffect(() => {
    if (headerTick.current) headerTick.current.indeterminate = someTicked && !allTicked;
  }, [allTicked, someTicked]);

  if (!data) {
    return (
      <div className="playlists">
        {error ? (
          <Notice
            kind="danger"
            action={
              onRetry && (
                <Button variant="secondary" onClick={onRetry}>
                  {RETRY}
                </Button>
              )
            }
          >
            {error}
          </Notice>
        ) : (
          loading && <Loading what="your playlists" />
        )}
      </div>
    );
  }

  const toggle = (key: RowKey) =>
    setTicked((now) => {
      if (key === WHOLE) return now.has(WHOLE) ? new Set() : new Set([WHOLE]);
      const next = new Set(now);
      next.delete(WHOLE);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const toggleAll = () =>
    setTicked((now) => {
      const next = new Set(now);
      next.delete(WHOLE);
      for (const playlist of tickable) {
        if (allTicked) next.delete(playlist.id);
        else next.add(playlist.id);
      }
      return next;
    });

  // What the bar says about the choice: how many playlists, and how many tracks are in them.
  const tickedTracks = wholeTicked
    ? data.whole_library.track_count
    : chosen.reduce((sum, playlist) => sum + playlist.track_count, 0);
  const choiceLine = wholeTicked
    ? `${WHOLE_LIBRARY_NAME} · ${plural(tickedTracks, "track")}`
    : `${plural(chosen.length, "playlist")} · ${plural(tickedTracks, "track")}`;

  const start = () => {
    if (!choice) return;
    onMatch(choice);
    setTicked(new Set());
  };

  const row = (
    key: string,
    tick: RowKey,
    name: string,
    prefix: string,
    counts: CleanPlaylistCounts,
    playlist: CleanPlaylistStatus | null,
  ) => {
    const status = playlistStatus(counts);
    // The playlists are part of the whole library: while it is ticked they cannot be chosen too.
    // The job's time left covers every playlist it was started for: this row has its share.
    const rowSecondsLeft = rowTimeLeft(secondsLeft, progress, status.running);
    const disabled = !status.canTick || (tick !== WHOLE && wholeTicked);
    return (
      <tr
        key={key}
        data-status={status.kind}
        aria-selected={selected === tick}
        onClick={(event) => {
          // A click on a button or a tick inside the row is that control's own.
          if ((event.target as HTMLElement).closest("button, input, a")) return;
          setSelected(tick);
        }}
      >
        <td className="playlists__tick">
          <input
            type="checkbox"
            aria-label={`Match ${name}`}
            checked={ticked.has(tick)}
            disabled={disabled}
            onChange={() => toggle(tick)}
          />
        </td>
        <td className="playlists__name-cell">
          {prefix && <span className="playlists__path">{prefix}</span>}
          <span className="playlists__name">{name}</span>
          {status.running && (
            // The app's own bar (the status strip's): a progress element, so it reports its value.
            <progress
              className="cp-progress playlists__progress"
              value={status.running.done}
              max={Math.max(1, status.running.total)}
              aria-label={`Matching ${name}`}
            />
          )}
        </td>
        <td className="num">{formatCount(counts.track_count)}</td>
        <td className="playlists__files">
          {status.running ? (
            <span className="playlists__matching">
              {status.text}
              {rowSecondsLeft !== null && ` · ${aboutDuration(rowSecondsLeft)} left`}
            </span>
          ) : status.kind === "queued" ? (
            <span className="playlists__waiting">{status.text}</span>
          ) : playlist ? (
            playlist.synced ? (
              <SyncedBadge at={playlist.synced_at} />
            ) : (
              <span className="playlists__not-yet">Not yet</span>
            )
          ) : (
            // The whole library is not one set of files: nothing to say (C182).
            <MissingValue />
          )}
        </td>
        <td className="playlists__end">
          <div className="cp-button-row playlists__buttons">
            {status.running && onStop && (
              <Button size="sm" variant="secondary" aria-label={`Stop matching ${name}`} onClick={() => onStop(status.running!.jobId)}>
                Stop
              </Button>
            )}
            {status.canReview && (
              <Button size="sm" variant="secondary" aria-label={`Review ${name}`} onClick={() => onReview(playlist)}>
                Review
              </Button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="playlists">
      <div className="playlists__scroll">
        <table className="cp-data-table playlists__table">
          <caption className="match-visually-hidden">Your playlists and where each stands with Beatport</caption>
          <thead>
            <tr>
              <th scope="col" className="playlists__tick">
                <input
                  ref={headerTick}
                  type="checkbox"
                  aria-label="Tick every playlist"
                  checked={allTicked}
                  disabled={tickable.length === 0 || wholeTicked}
                  onChange={toggleAll}
                />
              </th>
              <th scope="col">Playlist</th>
              <th scope="col" className="num">
                Tracks
              </th>
              <th scope="col">In your files</th>
              <th scope="col" className="playlists__end">
                <span className="match-visually-hidden">Review</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {row("library", WHOLE, WHOLE_LIBRARY_NAME, "", data.whole_library, null)}
            {shown.map((playlist) =>
              row(`playlist:${playlist.id}`, playlist.id, playlist.name, folderPrefix(playlist.path), playlist, playlist),
            )}
          </tbody>
        </table>
        {data.playlists.length === 0 && (
          <EmptyState
            compact
            icon="playlist"
            headline="No playlists yet"
            description="Playlists from your Rekordbox file show here. Import it in the Library first."
          />
        )}
        {data.playlists.length > 0 && text && shown.length === 0 && (
          <EmptyState compact icon="search" headline={nothingMatches(filter.trim()).replace(/[.]$/, "")} />
        )}
      </div>
      <div className="cp-toolbar playlists__footer">
        {!choice && <span className="playlists__next">Tick one or more playlists</span>}
        {choice && <span className="cp-count playlists__choice">{choiceLine}</span>}
        <Hint text={matching && choice ? "Wait for the match that is running" : undefined}>
          <Button variant="primary" disabled={!choice || matching} onClick={start}>
            {MATCH_TICKED_LABEL}
          </Button>
        </Hint>
      </div>
    </div>
  );
}
