/**
 * Browsing the collection the way it is organized (LIBUI-07, DEC-044).
 *
 * A DJ's index of their own library is the playlist tree, not an alphabetical
 * list of fifty thousand tracks. This is that tree, mirrored from Rekordbox
 * and **read-only** (DEC-031): there is no rename here, no delete, no drag, no
 * new playlist. CuePoint's own editable Collections are Phase 6, and an edit
 * landing here would be destroyed by the next refresh — so the pane says where
 * these came from rather than leaving a user to discover it.
 *
 * It is a tree by the ARIA definition, and it behaves like one: arrows move
 * and open, Enter and Space select, and exactly one row is in the tab order,
 * so a keyboard reaches the tree in one Tab and moves inside it with arrows.
 */
import { useRef, useState, type KeyboardEvent } from "react";

import { PixelIcon } from "../../components/PixelIcon";
import type { PlaylistTreeNode, VisibleRow } from "./playlistTree";
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
}

const ALL_TRACKS_KEY = "__all__";

export function PlaylistPane({
  rows,
  selected,
  libraryTrackCount,
  onSelect,
  onExpand,
  selectionFellBack = false,
  status = "ready",
  error = null,
}: PlaylistPaneProps) {
  // The row that carries the tab stop. A tree is one stop, not one per node.
  const [focusKey, setFocusKey] = useState<string>(ALL_TRACKS_KEY);
  const containerRef = useRef<HTMLDivElement>(null);

  const keys = [ALL_TRACKS_KEY, ...rows.map((row) => row.node.path)];

  // A folder that closed, or a playlist a refresh removed, can take the tab
  // stop's row with it. Derived rather than corrected in an effect, so the
  // tree is never rendered for even one frame with no way into it.
  const tabStop = keys.includes(focusKey) ? focusKey : ALL_TRACKS_KEY;

  const focusRow = (key: string) => {
    setFocusKey(key);
    const selector = `[data-tree-key="${CSS.escape(key)}"]`;
    containerRef.current?.querySelector<HTMLElement>(selector)?.focus();
  };

  const move = (from: string, delta: 1 | -1) => {
    const index = keys.indexOf(from);
    const next = keys[index + delta];
    if (next !== undefined) focusRow(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, row: VisibleRow | null) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        move(row?.node.path ?? ALL_TRACKS_KEY, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        move(row?.node.path ?? ALL_TRACKS_KEY, -1);
        break;
      case "ArrowRight":
        if (!row) break;
        event.preventDefault();
        // Open a closed folder; step into an open one.
        if (row.hasChildren && !row.expanded) onExpand(row.node.path, true);
        else if (row.hasChildren) move(row.node.path, 1);
        break;
      case "ArrowLeft":
        if (!row) break;
        event.preventDefault();
        if (row.hasChildren && row.expanded) onExpand(row.node.path, false);
        else move(row.node.path, -1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        onSelect(row ? row.node : null);
        break;
      default:
        break;
    }
  };

  const selectedKey = selected ? selected.path : ALL_TRACKS_KEY;

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

      <div
        ref={containerRef}
        className="cp-playlist-pane__tree"
        role="tree"
        aria-label="Playlists"
      >
        <div
          role="treeitem"
          aria-level={1}
          aria-selected={selectedKey === ALL_TRACKS_KEY}
          data-tree-key={ALL_TRACKS_KEY}
          tabIndex={tabStop === ALL_TRACKS_KEY ? 0 : -1}
          className={`cp-playlist-pane__row${selectedKey === ALL_TRACKS_KEY ? " cp-playlist-pane__row--selected" : ""}`}
          onClick={() => {
            setFocusKey(ALL_TRACKS_KEY);
            onSelect(null);
          }}
          onKeyDown={(event) => onKeyDown(event, null)}
        >
          <span className="cp-playlist-pane__twisty" aria-hidden />
          <PixelIcon name="library" className="cp-playlist-pane__icon" />
          <span className="cp-playlist-pane__name">All tracks</span>
          <span className="cp-playlist-pane__count">{libraryTrackCount.toLocaleString()}</span>
        </div>

        {rows.map((row) => {
          const isSelected = selectedKey === row.node.path;
          return (
            <div
              key={row.node.id}
              role="treeitem"
              aria-level={row.depth + 2}
              aria-selected={isSelected}
              aria-expanded={row.hasChildren ? row.expanded : undefined}
              data-tree-key={row.node.path}
              data-kind={row.node.kind}
              tabIndex={tabStop === row.node.path ? 0 : -1}
              style={{ paddingLeft: `calc(var(--space-sm) + ${row.depth} * var(--space-md))` }}
              className={`cp-playlist-pane__row${isSelected ? " cp-playlist-pane__row--selected" : ""}`}
              onClick={() => {
                setFocusKey(row.node.path);
                onSelect(row.node);
              }}
              onKeyDown={(event) => onKeyDown(event, row)}
            >
              {row.hasChildren ? (
                <button
                  type="button"
                  className="cp-playlist-pane__twisty"
                  aria-label={`${row.expanded ? "Collapse" : "Expand"} ${row.node.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onExpand(row.node.path, !row.expanded);
                  }}
                >
                  {row.expanded ? "▾" : "▸"}
                </button>
              ) : (
                <span className="cp-playlist-pane__twisty" aria-hidden />
              )}
              <PixelIcon
                name={row.node.kind === "folder" ? "folder" : "playlist"}
                className="cp-playlist-pane__icon"
              />
              {/* A name, not a path: four playlists in a real export contain the
                  separator, and splitting one would show half a name. */}
              <span className="cp-playlist-pane__name" title={row.node.path}>
                {row.node.name}
              </span>
              {row.node.kind === "playlist" && (
                <span className="cp-playlist-pane__count">
                  {row.node.track_count.toLocaleString()}
                </span>
              )}
            </div>
          );
        })}

        {status === "ready" && rows.length === 0 && (
          <p className="cp-playlist-pane__note">
            Your export has no playlists in it.
          </p>
        )}
      </div>
    </nav>
  );
}
