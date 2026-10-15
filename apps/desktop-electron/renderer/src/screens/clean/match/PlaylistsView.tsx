/**
 * The Playlists view (C22): where Match opens.
 *
 * Your Rekordbox playlists, each with a **tick**, its folder path muted before the name, how many
 * tracks, and where it stands with Beatport (`playlistStatus.ts`). The first row is the whole
 * library. Tick one or more playlists and press **Match N playlists**: that is the only way to
 * start a match. The whole library is its own choice: ticking it unticks and disables the
 * playlists (they are in it), and matches only the collection. A matched row has a **Review**
 * button. A filter box narrows by name or folder, because a library has hundreds of playlists.
 *
 * The view draws and reports: matching and Review belong to the page. Stop is on the line at the
 * top of Clean while a match runs, so a row only shows how far its own run is.
 */
import { useMemo, useState } from "react";

import type { CleanPlaylistCounts, CleanPlaylists, CleanPlaylistStatus } from "../../../api/cuepointBridge.types";
import { Button } from "../../../components/Button";
import { EmptyState } from "../../../components/EmptyState";
import { TextField } from "../../../components/TextField";
import { PixelIcon } from "../../../components/PixelIcon";
import { matchButtonLabel, type MatchChoice } from "./matchPlaylists";
import { playlistStatus, type PlaylistChip } from "./playlistStatus";
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
}

/** The folder path before a name, "Techno / ", or nothing for a playlist at the top. */
function folderPrefix(path: string): string {
  return path ? `${path} / ` : "";
}

function matches(playlist: CleanPlaylistStatus, text: string): boolean {
  if (!text) return true;
  return `${playlist.path} ${playlist.name}`.toLowerCase().includes(text);
}

function Chip({ chip }: { chip: PlaylistChip }) {
  return (
    <span className={`playlists__chip${chip.tone === "none" ? "" : ` cp-status--${chip.tone}`}`}>
      {/* The tick: a pixel icon, never a typed one. */}
      {chip.tone === "done" && <PixelIcon name="clean" />}
      {chip.text}
    </span>
  );
}

const WHOLE = "whole";

export function PlaylistsView({ data, error = null, loading = false, matching = false, onMatch, onReview }: PlaylistsViewProps) {
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
          <p className="playlists__problem" role="alert">
            {error}
          </p>
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
    const disabled = !status.canTick || (tick !== WHOLE && wholeTicked);
    return (
      <tr key={key} data-status={status.kind}>
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
        </td>
        <td className="playlists__number cp-data">{counts.track_count.toLocaleString()}</td>
        <td>
          {status.running ? (
            <>
              <span className="playlists__matching">{status.text}</span>
              <progress
                className="clean-progress"
                aria-label={`${name} progress`}
                value={status.running.done}
                max={status.running.total}
              />
            </>
          ) : (
            <span className="playlists__chips">
              {status.chips.map((chip) => (
                <Chip key={chip.text} chip={chip} />
              ))}
            </span>
          )}
        </td>
        <td>
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
      <div className="playlists__bar">
        <TextField
          label="Filter playlists"
          type="search"
          value={filter}
          placeholder="Name or folder"
          onChange={(event) => setFilter(event.target.value)}
        />
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
              <th scope="col">Status</th>
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
            headline="No playlists yet"
            description="Playlists from your Rekordbox file show here. Import it in the Library first."
          />
        )}
        {data.playlists.length > 0 && text && shown.length === 0 && (
          <p className="playlists__empty">No playlist has that in its name or folder.</p>
        )}
      </div>
      <div className="playlists__footer">
        <Button disabled={!choice || matching} onClick={start}>
          {matchButtonLabel(choice)}
        </Button>
        {matching && <span className="playlists__next">One match at a time: wait for the one that is running.</span>}
      </div>
    </div>
  );
}
