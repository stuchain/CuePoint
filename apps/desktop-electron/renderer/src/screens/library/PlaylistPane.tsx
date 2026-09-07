/**
 * Browsing the collection the way it is organized (LIBUI-07, DEC-044).
 *
 * A DJ's index of their own library is the playlist tree, not an alphabetical
 * list of fifty thousand tracks. This is that tree, mirrored from Rekordbox
 * and **read-only** (DEC-031): there is no rename here, no delete, no drag, no
 * new playlist. CuePoint's own editable Collections are the section beside it
 * (ORG-09), and an edit landing *here* would be destroyed by the next refresh
 * — so the pane says where these came from rather than leaving a user to
 * discover it.
 *
 * ORG-09 moved the rows, the twisties and the arrow keys into
 * :func:`PaneTree`, which both sections share. What did not move is what this
 * section is allowed to do: it passes none of that component's editing or
 * drag handlers, which is what "read-only" means here in code rather than in a
 * comment. The one exception is a *refused* drop — a target that silently does
 * nothing teaches nothing (DEC-031), so a selection dropped here is turned
 * away with a reason.
 */
import { useState } from "react";

import type { PlaylistTreeNode, VisibleRow } from "./playlistTree";
import { PaneTree, type PaneTreeRow } from "./PaneTree";
import { isCuePointDrag } from "./collectionDrag";
import "./PlaylistPane.css";

export interface PlaylistPaneProps {
  rows: VisibleRow[];
  selected: PlaylistTreeNode | null;
  /** Tracks in the whole library, for the "All tracks" row. */
  libraryTrackCount: number;
  onSelect: (node: PlaylistTreeNode | null) => void;
  onExpand: (path: string, expanded: boolean) => void;
  /** Shown once when a remembered playlist is gone after a refresh. */
  selectionFellBack?: boolean;
  status?: "loading" | "ready" | "error" | "unavailable";
  error?: string | null;
  /**
   * Whether this section draws the "All tracks" row.
   *
   * True when it is the whole pane, which is what it was through Phase 4 and
   * what it still is anywhere it is used alone. The two-section pane (ORG-09)
   * draws that row itself, above both sections: "everything" belongs to
   * neither Rekordbox's mirror nor CuePoint's own tree, and putting it under
   * one of the two headings would say it came from there.
   */
  showAllTracks?: boolean;
  /** Said out loud when a drag is turned away (DEC-031). */
  onRefuseDrop?: (message: string) => void;
}

const ALL_TRACKS_KEY = "__all__";

/** What a user is told when they drop a selection on a mirrored playlist. */
export const REKORDBOX_DROP_REFUSAL =
  "Rekordbox playlists are read-only in CuePoint. Drop onto a Collection instead.";

export function PlaylistPane({
  rows,
  selected,
  libraryTrackCount,
  onSelect,
  onExpand,
  selectionFellBack = false,
  status = "ready",
  error = null,
  showAllTracks = true,
  onRefuseDrop,
}: PlaylistPaneProps) {
  const [refusing, setRefusing] = useState<string | null>(null);

  const byKey = new Map(rows.map((row) => [row.node.path, row.node] as const));
  const treeRows: PaneTreeRow[] = rows.map((row) => ({
    key: row.node.path,
    name: row.node.name,
    // A name, not a path: four playlists in a real export contain the
    // separator, and splitting one would show half a name.
    title: row.node.path,
    icon: row.node.kind === "folder" ? "folder" : "playlist",
    depth: row.depth,
    expanded: row.expanded,
    hasChildren: row.hasChildren,
    kind: row.node.kind,
    count: row.node.kind === "playlist" ? row.node.track_count : null,
  }));

  const selectedKey = selected ? selected.path : showAllTracks ? ALL_TRACKS_KEY : null;

  return (
    <nav className="cp-playlist-pane" aria-label="Playlists">
      <div className="cp-playlist-pane__head">
        <span className="cp-playlist-pane__title">Playlists</span>
        <span className="cp-playlist-pane__source" title="Mirrored from your Rekordbox export">
          from Rekordbox
        </span>
      </div>

      {selectionFellBack && (
        <p className="cp-playlist-pane__note" role="status">
          That playlist is no longer in your collection. Showing all tracks.
        </p>
      )}

      {status === "error" && (
        <p className="cp-playlist-pane__note cp-playlist-pane__note--error" role="alert">
          {error ?? "Could not read your playlists"}
        </p>
      )}

      {refusing && (
        <p className="cp-playlist-pane__note cp-playlist-pane__note--error" role="alert">
          {refusing}
        </p>
      )}

      <PaneTree
        label="Playlists"
        rows={treeRows}
        selectedKey={selectedKey}
        onSelect={(key) =>
          onSelect(key === ALL_TRACKS_KEY ? null : (byKey.get(key) ?? null))
        }
        onExpand={onExpand}
        leadingRow={
          showAllTracks
            ? {
                key: ALL_TRACKS_KEY,
                name: "All tracks",
                icon: "library",
                depth: 0,
                expanded: false,
                hasChildren: false,
                count: libraryTrackCount,
              }
            : null
        }
        // The only drag handlers this section has, and they exist to say no.
        // Nothing here is draggable and nothing here accepts a drop; what a
        // drop gets is a sentence explaining where it should have gone.
        onDragOver={(_key, event) => {
          if (!isCuePointDrag(event.dataTransfer)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "none";
        }}
        onDrop={(_key, event) => {
          if (!isCuePointDrag(event.dataTransfer)) return;
          event.preventDefault();
          setRefusing(REKORDBOX_DROP_REFUSAL);
          onRefuseDrop?.(REKORDBOX_DROP_REFUSAL);
        }}
      >
        {status === "ready" && rows.length === 0 && (
          <p className="cp-playlist-pane__note">Your export has no playlists in it.</p>
        )}
      </PaneTree>
    </nav>
  );
}
