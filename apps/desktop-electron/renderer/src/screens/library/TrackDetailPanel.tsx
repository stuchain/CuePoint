/**
 * What CuePoint knows about one track (LIBUI-09, DEC-047, then ORG-10).
 *
 * The first thing ever to render inside the Inspector container DEC-024 built
 * empty in Phase 2. LIBUI-09 filled it with everything the import captured and
 * said read-only was the whole design, because nothing in the build owned a
 * write path: ratings and tags were Phase 6, and a field that looked editable
 * would have been a promise this build could not keep.
 *
 * ORG-10 is Phase 6, and it keeps that promise **without taking the old one
 * back**. The panel is now two zones. "Yours" is CuePoint's own layer and is
 * editable; everything below it is the imported record and is exactly as read-
 * only as it was, field for field. They are never blurred, because DEC-057's
 * whole design is that a rating you set and a rating Rekordbox sent are
 * different facts that both survive.
 *
 * **A field Rekordbox did not supply reads as absent, not as zero.** That is
 * why LIBRARY-01 made those columns nullable (DEC-034): unrated and rated-zero
 * are different facts, and so are "never played" and "no play count recorded".
 */
import { useCallback, useState } from "react";

import { PixelIcon } from "../../components/PixelIcon";
import type {
  CollectionNode,
  LibraryPlaylistNode,
  LibraryTrackDetail,
} from "../../api/cuepointBridge.types";
import { starsFor } from "./filterText";
import { TrackHistorySection } from "./TrackHistorySection";
import { TrackYours } from "./TrackYours";
import { useTrackHistory } from "./useTrackHistory";
import "./TrackDetailPanel.css";

/** A Collection as the track-detail read names it — enough to show and to open. */
export type TrackCollectionRef = Pick<CollectionNode, "id" | "name" | "kind">;

export interface TrackDetailPanelProps {
  detail: LibraryTrackDetail | null;
  loading?: boolean;
  error?: string | null;
  /** How many tracks are selected, when it is more than the one shown. */
  selectionCount?: number;
  /** Scope the table to a playlist the track is in. */
  onSelectPlaylist?: (playlist: LibraryPlaylistNode) => void;
  /** Scope the table to a Collection holding it (ORG-09). */
  onSelectCollection?: (collection: TrackCollectionRef) => void;
  /** Show the file in the OS file manager. */
  onReveal?: (filePath: string) => void;
  /** Where a refused edit goes. Without it the zone still works and stays quiet. */
  onError?: (message: string) => void;
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

/** The pixel icon for a Collection's kind — a saved question looks like one. */
function collectionIcon(kind: TrackCollectionRef["kind"]) {
  if (kind === "smart") return "smart" as const;
  if (kind === "folder") return "folder" as const;
  return "collections" as const;
}

export function TrackDetailPanel({
  detail,
  loading = false,
  error = null,
  selectionCount = 0,
  onSelectPlaylist,
  onSelectCollection,
  onReveal,
  onError,
}: TrackDetailPanelProps) {
  // Bumped by every accepted write, which is what makes the History section
  // re-read. A local append would show entries the engine did not write:
  // re-saving the same note records nothing at all.
  const [written, setWritten] = useState(0);
  const trackId = detail?.track.id ?? null;
  const history = useTrackHistory(trackId, written);
  const onSaved = useCallback(() => setWritten((n) => n + 1), []);

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

  const { track, playlists, collections } = detail;

  return (
    <div className="cp-track-detail">
      <header className="cp-track-detail__head">
        <h2 className="cp-track-detail__title">{text(track.title)}</h2>
        <p className="cp-track-detail__artist">{text(track.artist)}</p>
        {selectionCount > 1 && (
          // DEC-045: the panel shows the last-clicked track and says how many
          // there are. Editing all of them is ORG-11's toolbar, and saying so
          // here is cheaper than a user discovering it by rating the wrong one.
          <p className="cp-track-detail__selection" role="status">
            {selectionCount.toLocaleString()} tracks selected — edits here change this
            one
          </p>
        )}
      </header>

      {/* A track with no id is not editable, and there is nothing to say
          about that: the id is what every write is addressed to. */}
      {track.id != null && (
        <TrackYours
          // A different track is a different editor: a note being typed
          // belongs to the track it was typed against, and remounting is what
          // makes that structural rather than careful.
          key={track.id}
          trackId={track.id}
          metadata={detail.metadata}
          tags={detail.tags}
          onError={onError ?? (() => undefined)}
          onSaved={onSaved}
        />
      )}

      <h3 className="cp-track-detail__subtitle">From Rekordbox</h3>
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
            encoding at import, so what is stored is already a star count. This
            row stays Rekordbox's own value whatever CuePoint's layer says —
            the resolved one is above, with its source beside it. */}
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
          {collections.length === 0
            ? "In no Collections"
            : `In ${collections.length} ${
                collections.length === 1 ? "Collection" : "Collections"
              }`}
        </h3>
        <ul>
          {collections.map((collection) => (
            <li key={collection.id}>
              <button
                type="button"
                className="cp-track-detail__playlist"
                onClick={() => onSelectCollection?.(collection)}
              >
                <PixelIcon
                  name={collectionIcon(collection.kind)}
                  className="cp-track-detail__icon"
                />
                {collection.name}
              </button>
            </li>
          ))}
        </ul>
      </section>

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

      <TrackHistorySection
        changes={history.changes}
        loading={history.loading}
        error={history.error}
        unavailable={history.unavailable}
      />
    </div>
  );
}
