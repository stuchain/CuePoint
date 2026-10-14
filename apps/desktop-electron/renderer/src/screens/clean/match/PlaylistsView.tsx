/**
 * The Playlists view (C22, G4 §2.2): where Match opens.
 *
 * Your Rekordbox playlists, each with how far it is: the playlist (its folder
 * path muted before the name), how many tracks, where it stands with Beatport
 * (`playlistStatus.ts`), and what to do next. The first row is the whole
 * library. A filter box narrows by name or folder, because a library has
 * hundreds of playlists.
 *
 * No ticks and no header button: every row has its own **Match**. While a row
 * is matched it shows a bar and "Matching 12 of 24" with a **Stop**; when done
 * it says "9 to check" and "15 confirmed" and offers **Review 9 ›**. The view draws
 * and reports: matching, stopping, Review and Save belong to the page. The Save
 * button shows only when the page can save.
 */
import { useMemo, useState } from "react";

import type { CleanPlaylistCounts, CleanPlaylists, CleanPlaylistStatus } from "../../../api/cuepointBridge.types";
import { Button } from "../../../components/Button";
import { EmptyState } from "../../../components/EmptyState";
import { PixelIcon } from "../../../components/PixelIcon";
import { TextField } from "../../../components/TextField";
import { playlistStatus, type PlaylistChip } from "./playlistStatus";
import { WHOLE_LIBRARY_NAME, playlistKey } from "./useCleanPlaylists";
import "./playlists.css";

interface PlaylistsViewProps {
  data: CleanPlaylists | null;
  /** A problem reading them, said in words. */
  error?: string | null;
  loading?: boolean;
  /** A match is running, here or elsewhere: one runs at a time, so every Match waits. */
  matching?: boolean;
  /** Match: look this playlist up on Beatport; null is the whole library. */
  onMatch: (playlist: CleanPlaylistStatus | null) => void;
  /** Stop the match job working on a row. */
  onStop: (jobId: string) => void;
  /** Review N ›: open One at a time on this playlist's waiting tracks; null is the whole library. */
  onReview: (playlist: CleanPlaylistStatus | null) => void;
  /** Save N to files…; the button shows only when this is given. */
  onSave?: (playlist: CleanPlaylistStatus | null) => void;
}

/**
 * The folder path before a name, "Techno / ", or nothing for a playlist at the top.
 * The engine's `path` is the folders above the playlist, joined " / ".
 */
function folderPrefix(path: string): string {
  return path ? `${path} / ` : "";
}

function matches(playlist: CleanPlaylistStatus, text: string): boolean {
  if (!text) return true;
  return `${playlist.path} ${playlist.name}`.toLowerCase().includes(text);
}

function Chip({ chip, done = false }: { chip: PlaylistChip; done?: boolean }) {
  return (
    <span className={`playlists__chip${chip.tone === "none" ? "" : ` cp-status--${chip.tone}`}`}>
      {/* The tick: a pixel icon, never a typed one. */}
      {done && <PixelIcon name="clean" />}
      {chip.text}
    </span>
  );
}

export function PlaylistsView({
  data,
  error = null,
  loading = false,
  matching = false,
  onMatch,
  onStop,
  onReview,
  onSave,
}: PlaylistsViewProps) {
  const [filter, setFilter] = useState("");
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

  const row = (
    key: string,
    name: string,
    prefix: string,
    counts: CleanPlaylistCounts,
    playlist: CleanPlaylistStatus | null,
  ) => {
    const status = playlistStatus(counts);
    return (
      <tr key={key} data-status={status.kind}>
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
              {status.chips.map((chip, index) => (
                <Chip key={chip.text} chip={chip} done={status.kind === "done" && index === 0} />
              ))}
            </span>
          )}
        </td>
        <td>
          <span className="playlists__actions">
            {status.running && (
              <Button
                size="sm"
                variant="secondary"
                aria-label={`Stop matching ${name}`}
                onClick={() => onStop(status.running!.jobId)}
              >
                Stop
              </Button>
            )}
            {status.canMatch && (
              <Button
                size="sm"
                variant="secondary"
                aria-label={`Match ${name}`}
                disabled={matching}
                onClick={() => onMatch(playlist)}
              >
                Match
              </Button>
            )}
            {status.review && (
              <Button
                size="sm"
                variant="primary"
                aria-label={`${status.review.label} for ${name}`}
                onClick={() => onReview(playlist)}
              >
                {status.review.label}
              </Button>
            )}
            {status.save && onSave && (
              <Button
                size="sm"
                className="playlists__save"
                aria-label={`${status.save.label} for ${name}`}
                onClick={() => onSave(playlist)}
              >
                {status.save.label}
              </Button>
            )}
            {status.note && <span className="playlists__next">{status.note}</span>}
          </span>
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
              <th scope="col">Playlist</th>
              <th scope="col" className="playlists__number">
                Tracks
              </th>
              <th scope="col">Beatport</th>
              <th scope="col">Next</th>
            </tr>
          </thead>
          <tbody>
            {row("library", WHOLE_LIBRARY_NAME, "", data.whole_library, null)}
            {shown.map((playlist) =>
              row(
                playlistKey(playlist.id),
                playlist.name,
                folderPrefix(playlist.path),
                playlist,
                playlist,
              ),
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
    </div>
  );
}
