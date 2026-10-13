/**
 * The Playlists view (C22, G4 §2.2): where Match opens.
 *
 * Your Rekordbox playlists, each with how far it is: a tick, the playlist
 * (its folder path muted before the name), how many tracks, where it stands with
 * Beatport (`playlistStatus.ts`), and what to do next. The first row is the
 * whole library. A filter box narrows by name or folder, because a library has
 * hundreds of playlists. The view draws and reports: the ticks, Review and Save
 * belong to the page, which also owns the header's **Match N playlists on
 * Beatport**. The Save button shows only when the page can save.
 */
import { useMemo, useState } from "react";

import type { CleanPlaylistCounts, CleanPlaylists, CleanPlaylistStatus } from "../../../api/cuepointBridge.types";
import { Button } from "../../../components/Button";
import { EmptyState } from "../../../components/EmptyState";
import { PixelIcon } from "../../../components/PixelIcon";
import { TextField } from "../../../components/TextField";
import { WHOLE_LIBRARY } from "../cleanRules";
import { playlistStatus, type PlaylistStatus } from "./playlistStatus";
import { WHOLE_LIBRARY_NAME, playlistKey } from "./useCleanPlaylists";
import "./playlists.css";

interface PlaylistsViewProps {
  data: CleanPlaylists | null;
  /** A problem reading them, said in words. */
  error?: string | null;
  loading?: boolean;
  /** Tick keys: `library`, or `playlist:12`. */
  ticked: ReadonlySet<string>;
  onTick: (key: string, on: boolean) => void;
  /** Review N: open One at a time on this playlist's waiting tracks; null is the whole library. */
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

function Chip({ status }: { status: PlaylistStatus }) {
  return (
    <span className={`playlists__chip${status.tone === "none" ? "" : ` cp-status--${status.tone}`}`}>
      {/* The tick: a pixel icon, never a typed one. */}
      {status.kind === "done" && <PixelIcon name="clean" />}
      {status.text}
    </span>
  );
}

export function PlaylistsView({
  data,
  error = null,
  loading = false,
  ticked,
  onTick,
  onReview,
  onSave,
}: PlaylistsViewProps) {
  const [filter, setFilter] = useState("");
  const text = filter.trim().toLowerCase();
  // A ticked row stays in view whatever the filter says, so what will be matched is always seen.
  const shown = useMemo(
    () =>
      data
        ? data.playlists.filter(
            (playlist) => ticked.has(playlistKey(playlist.id)) || matches(playlist, text),
          )
        : [],
    [data, text, ticked],
  );
  const wholeTicked = ticked.has(WHOLE_LIBRARY);

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
    const next = status.next;
    return (
      <tr key={key} data-ticked={ticked.has(key) ? "true" : undefined}>
        <td className="playlists__tick">
          <input
            type="checkbox"
            aria-label={`Match ${name}`}
            checked={ticked.has(key)}
            // The whole library includes every playlist: ticking one more would mean nothing.
            disabled={wholeTicked && playlist !== null}
            onChange={(event) => onTick(key, event.target.checked)}
          />
        </td>
        <td>
          {prefix && <span className="playlists__path">{prefix}</span>}
          <span className="playlists__name">{name}</span>
        </td>
        <td className="playlists__number cp-data">{counts.track_count.toLocaleString()}</td>
        <td>
          <Chip status={status} />
          {counts.running && counts.running.total > 0 && (
            <progress
              className="clean-progress"
              aria-label={`${name} progress`}
              value={counts.running.done}
              max={counts.running.total}
            />
          )}
        </td>
        <td>
          {next?.kind === "text" && <span className="playlists__next">{next.text}</span>}
          {next?.kind === "review" && (
            <Button
              size="sm"
              variant="secondary"
              aria-label={`${next.label} for ${name}`}
              onClick={() => onReview(playlist)}
            >
              {next.label}
            </Button>
          )}
          {next?.kind === "save" && onSave && (
            <Button
              size="sm"
              className="playlists__save"
              aria-label={`${next.label} for ${name}`}
              onClick={() => onSave(playlist)}
            >
              {next.label}
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
      {wholeTicked && <p className="playlists__empty">Whole library includes every playlist.</p>}
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
              <th scope="col">Beatport</th>
              <th scope="col">Next</th>
            </tr>
          </thead>
          <tbody>
            {row(WHOLE_LIBRARY, WHOLE_LIBRARY_NAME, "", data.whole_library, null)}
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
