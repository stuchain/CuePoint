/**
 * What CuePoint knows about one track (LIBUI-09, DEC-047).
 *
 * The first thing ever to render inside the Inspector container DEC-024 built
 * empty in Phase 2. Everything imported, read-only, plus where the track sits
 * in the collection.
 *
 * **Read-only is the whole design.** Nothing here owns a write path: ratings
 * and tags are Phase 6, Beatport values are Phase 7, and a field that looked
 * editable would be a promise this build cannot keep.
 *
 * **A field Rekordbox did not supply reads as absent, not as zero.** That is
 * why LIBRARY-01 made those columns nullable (DEC-034): unrated and rated-zero
 * are different facts, and so are "never played" and "no play count recorded".
 */
import { PixelIcon } from "../../components/PixelIcon";
import type { LibraryPlaylistNode, LibraryTrackDetail } from "../../api/cuepointBridge.types";
import { starsFor } from "./filterText";
import "./TrackDetailPanel.css";

export interface TrackDetailPanelProps {
  detail: LibraryTrackDetail | null;
  loading?: boolean;
  error?: string | null;
  /** How many tracks are selected, when it is more than the one shown. */
  selectionCount?: number;
  /** Scope the table to a playlist the track is in. */
  onSelectPlaylist?: (playlist: LibraryPlaylistNode) => void;
  /** Show the file in the OS file manager. */
  onReveal?: (filePath: string) => void;
}

/** Absent is absent: an em dash, never a zero. */
function text(value: string | null | undefined): string {
  return value == null || value === "" ? "—" : value;
}

function number(value: number | null | undefined, suffix = ""): string {
  return value == null ? "—" : `${value.toLocaleString()}${suffix}`;
}

function duration(seconds: number | null): string {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="cp-track-detail__row">
      <dt className="cp-track-detail__label">{label}</dt>
      <dd className="cp-track-detail__value">{value}</dd>
    </div>
  );
}

export function TrackDetailPanel({
  detail,
  loading = false,
  error = null,
  selectionCount = 0,
  onSelectPlaylist,
  onReveal,
}: TrackDetailPanelProps) {
  if (error) {
    return (
      <p className="cp-track-detail__note" role="alert">
        {error}
      </p>
    );
  }

  if (!detail) {
    return (
      <p className="cp-track-detail__note">
        {loading ? "Reading the track…" : "Select a track to see everything about it."}
      </p>
    );
  }

  const { track, playlists } = detail;

  return (
    <div className="cp-track-detail">
      <header className="cp-track-detail__head">
        <h2 className="cp-track-detail__title">{text(track.title)}</h2>
        <p className="cp-track-detail__artist">{text(track.artist)}</p>
        {selectionCount > 1 && (
          <p className="cp-track-detail__selection" role="status">
            {selectionCount.toLocaleString()} tracks selected
          </p>
        )}
      </header>

      <dl className="cp-track-detail__fields">
        <Row label="Remixer" value={text(track.remixer)} />
        <Row label="Album" value={text(track.album)} />
        <Row label="Label" value={text(track.label)} />
        <Row label="Genre" value={text(track.genre)} />
        <Row label="Key" value={text(track.key)} />
        <Row label="BPM" value={track.bpm == null ? "—" : track.bpm.toFixed(1)} />
        <Row label="Year" value={track.year == null ? "—" : String(track.year)} />
        <Row label="Length" value={duration(track.duration_seconds)} />
        {/* Stars, not a number: the parser converted Rekordbox's 0/51/…/255
            encoding at import, so what is stored is already a star count. */}
        <Row
          label="Rating"
          value={track.rating == null ? "—" : starsFor(track.rating)}
        />
        <Row label="Plays" value={number(track.play_count)} />
        <Row label="Colour" value={text(track.colour)} />
        <Row label="Added" value={text(track.date_added)} />
        <Row label="Bitrate" value={number(track.bitrate, " kbps")} />
        <Row label="Comment" value={text(track.comment)} />
        <Row
          label="File"
          value={
            <span className="cp-track-detail__file">
              <span title={track.file_path}>{text(track.file_path)}</span>
              {onReveal && track.file_path && (
                <button
                  type="button"
                  className="cp-track-detail__reveal"
                  onClick={() => onReveal(track.file_path)}
                >
                  Show in folder
                </button>
              )}
            </span>
          }
        />
      </dl>

      <section className="cp-track-detail__playlists">
        <h3 className="cp-track-detail__subtitle">
          {playlists.length === 0
            ? "In no playlists"
            : `In ${playlists.length} ${playlists.length === 1 ? "playlist" : "playlists"}`}
        </h3>
        <ul>
          {playlists.map((playlist) => (
            <li key={playlist.id}>
              <button
                type="button"
                className="cp-track-detail__playlist"
                title={playlist.path}
                onClick={() => onSelectPlaylist?.(playlist)}
              >
                <PixelIcon name="playlist" className="cp-track-detail__icon" />
                {playlist.name}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
