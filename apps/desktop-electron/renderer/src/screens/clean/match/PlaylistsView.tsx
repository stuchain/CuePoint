/**
 * The Playlists view (C22): where Match opens, laid out as step 1 of "tick, review, sync".
 *
 * Your Rekordbox playlists, each with a big **tick**, its folder path muted before the name, how
 * many tracks, and, under "In your files", a green "Synced <day>" once its values were written to
 * the files (nothing otherwise). The first row is the whole library. Tick one or more playlists and press **Match N playlists**: that is the only way to
 * start a match. The whole library is its own choice: ticking it unticks and disables the
 * playlists (they are in it), and matches only the collection. A matched row has a **Review**
 * button. A filter box narrows by name or folder, because a library has hundreds of playlists.
 *
 * The view draws and reports: matching and Review belong to the page. Stop and the progress bar are on the
 * strip at the top of Clean while a match runs; the playlist being matched also shows its own bar,
 * "16 of 24 · about 1 minute left" and a Stop, and one started with it but not reached says Waiting. The bar under
 * the rows says what is ticked and holds the Match button.
 */
import { useMemo, useState } from "react";

import type { CleanPlaylistCounts, CleanPlaylists, CleanPlaylistStatus } from "../../../api/cuepointBridge.types";
import { Badge } from "../../../components/Badge";
import { Button } from "../../../components/Button";
import { EmptyState } from "../../../components/EmptyState";
import { Notice } from "../../../components/Notice";
import { PixelIcon } from "../../../components/PixelIcon";
import { SearchField } from "../../../components/SearchField";
import { formatCount, plural } from "../../../format/counts";
import { formatDay } from "../../../format/dates";
import { aboutDuration } from "../../../components/shell/useActiveJob";
import { nothingMatches, SYNC_TO_FILES } from "../../../format/words";
import { displayFolderPath, matchButtonLabel, type MatchChoice } from "./matchPlaylists";
import { playlistStatus } from "./playlistStatus";
import { WHOLE_LIBRARY_NAME } from "./useCleanPlaylists";
import "./playlists.css";

interface PlaylistsViewProps {
  data: CleanPlaylists | null;
  /** A problem reading them, said in words. */
  error?: string | null;
  loading?: boolean;
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

/**
 * The three steps Clean is for, with the one this list is (1) lit. Only a map: the steps are
 * reached through the tabs and the Sync button, not through these.
 */
function StepLine() {
  const steps = ["Tick the playlists to match", "Review", SYNC_TO_FILES];
  return (
    <ol className="playlists__steps" aria-label="The steps">
      {steps.map((label, index) => (
        <li key={label} className="playlists__stepitem">
          {index > 0 && <PixelIcon name="chevron-right" size="sm" className="playlists__arrow" />}
          <span className="playlists__step" aria-current={index === 0 ? "step" : undefined}>
            <span className="playlists__step-number" aria-hidden>
              {index + 1}
            </span>
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

const WHOLE = "whole";

export function PlaylistsView({ data, error = null, loading = false, matching = false, onMatch, onReview, secondsLeft = null, progress = null, onStop }: PlaylistsViewProps) {
  const [filter, setFilter] = useState("");
  // What is ticked: the whole library, or some playlists by id. Never both.
  const [ticked, setTicked] = useState<ReadonlySet<number | typeof WHOLE>>(new Set());
  const text = filter.trim().toLowerCase();
  const shown = useMemo(
    () => (data ? data.playlists.filter((playlist) => matches(playlist, text)) : []),
    [data, text],
  );

  if (!data) {
    return (
      <div className="playlists">
        {error ? (
          <Notice kind="problem">{error}</Notice>
        ) : (
          loading && <p className="playlists__empty">Reading your playlists…</p>
        )}
      </div>
    );
  }

  const wholeTicked = ticked.has(WHOLE);
  // Only playlists that still exist and can be matched count: a row that began matching drops out.
  const chosen = data.playlists.filter((playlist) => ticked.has(playlist.id) && playlistStatus(playlist).canTick);
  const choice: MatchChoice | null = wholeTicked ? { whole: true } : chosen.length > 0 ? { whole: false, playlists: chosen } : null;

  const toggle = (key: number | typeof WHOLE) =>
    setTicked((now) => {
      if (key === WHOLE) return now.has(WHOLE) ? new Set() : new Set([WHOLE]);
      const next = new Set(now);
      next.delete(WHOLE);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // What the bar says about the choice: how many playlists, and how many tracks are in them.
  const tickedTracks = wholeTicked
    ? data.whole_library.track_count
    : chosen.reduce((sum, playlist) => sum + playlist.track_count, 0);
  const choiceLine = wholeTicked
    ? `Whole library · ${plural(tickedTracks, "track")}`
    : `${plural(chosen.length, "playlist")} · ${plural(tickedTracks, "track")}`;

  const start = () => {
    if (!choice) return;
    onMatch(choice);
    setTicked(new Set());
  };

  const row = (
    key: string,
    tick: number | typeof WHOLE,
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
      <tr key={key} data-status={status.kind} data-ticked={ticked.has(tick) ? "true" : undefined}>
        <td className="playlists__tick">
          <input
            type="checkbox"
            aria-label={`Match ${name}`}
            checked={ticked.has(tick)}
            disabled={disabled}
            onChange={() => toggle(tick)}
          />
        </td>
        <td>
          {prefix && <span className="playlists__path">{prefix}</span>}
          <span className="playlists__name">{name}</span>
          {status.running && (
            // The app's own bar (the status strip's): a progress element, so it reports its value.
            <progress
              className="playlists__progress"
              value={status.running.done}
              max={Math.max(1, status.running.total)}
              aria-label={`Matching ${name}`}
            />
          )}
        </td>
        <td className="playlists__number cp-data">{formatCount(counts.track_count)}</td>
        <td>
          {status.running ? (
            <span className="playlists__matching">
              {status.text}
              {rowSecondsLeft !== null && ` · ${aboutDuration(rowSecondsLeft)} left`}
            </span>
          ) : status.kind === "queued" ? (
            <span className="playlists__waiting">{status.text}</span>
          ) : (
            playlist?.synced && <SyncedBadge at={playlist.synced_at} />
          )}
        </td>
        <td>
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
        </td>
      </tr>
    );
  };

  return (
    <div className="playlists">
      <StepLine />
      <div className="playlists__bar">
        <SearchField thing="playlists" label="Filter playlists" value={filter} onValueChange={setFilter} />
      </div>
      <div className="playlists__scroll">
        <table className="playlists__table">
          <caption className="match-visually-hidden">Your playlists and where each stands with Beatport</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="match-visually-hidden">Match</span>
              </th>
              <th scope="col">Playlist</th>
              <th scope="col" className="playlists__number">
                Tracks
              </th>
              <th scope="col">In your files</th>
              <th scope="col">
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
            icon="playlist"
            headline="No playlists yet"
            description="Playlists from your Rekordbox file show here. Import it in the Library first."
          />
        )}
        {data.playlists.length > 0 && text && shown.length === 0 && (
          <EmptyState icon="search" headline={nothingMatches(filter.trim()).replace(/[.]$/, "")} />
        )}
      </div>
      <div className="playlists__footer">
        <span className={choice ? "playlists__choice" : "playlists__next"}>
          {choice ? choiceLine : "Tick one or more playlists"}
        </span>
        {matching && <span className="playlists__next">One match at a time: wait for the one that is running.</span>}
        <Button disabled={!choice || matching} onClick={start}>
          {matchButtonLabel(choice)}
        </Button>
      </div>
    </div>
  );
}
