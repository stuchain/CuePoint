/**
 * The Library page's left pane, in two sections (ORG-09, DEC-062).
 *
 * DEC-062 amended DEC-020's information architecture: CuePoint's Collections
 * are browsed *here*, beside the Rekordbox mirror, rather than behind a second
 * browser. So the pane is one scroll container with three things in it —
 * everything, what the user made, and what Rekordbox gave them.
 *
 * **"All tracks" belongs to neither section**, which is why this component
 * draws it rather than either of them. It is the row that clears the scope,
 * and putting it under the Rekordbox heading would say it came from there.
 * :func:`PlaylistPane` still draws its own when it is used alone, which is
 * what every one of its tests does.
 *
 * The two sections are separate trees on purpose. Each keeps its own roving
 * tab stop, so Tab moves between sections and the arrows move inside one —
 * which is what a keyboard user expects of two trees, and what ARIA says they
 * are.
 */
import { PixelIcon } from "../../components/PixelIcon";
import type { CollectionNode } from "../../api/cuepointBridge.types";
import { CollectionsPane } from "./CollectionsPane";
import { PlaylistPane } from "./PlaylistPane";
import type { PlaylistTreeNode } from "./playlistTree";
import type { DraggedTracks } from "./collectionDrag";
import type { CollectionTreeController } from "./useCollectionTree";
import type { PlaylistTreeController } from "./usePlaylistTree";
import "./PlaylistPane.css";
import "./CollectionsPane.css";

export interface LibraryPaneProps {
  /** Tracks in the whole library, for the "All tracks" row. */
  libraryTrackCount: number;
  playlists: PlaylistTreeController;
  collections: CollectionTreeController;
  /** True when the table is showing the whole library. */
  scopeIsLibrary: boolean;
  onSelectPlaylist: (node: PlaylistTreeNode | null) => void;
  onSelectCollection: (node: CollectionNode | null) => void;
  /**
   * Tracks dropped on a Collection (ORG-11).
   *
   * The page's rather than the tree controller's, because the payload may be
   * "everything the current query matches" — and the query is the page's
   * (DEC-045). `silent` says the page has already reported the outcome.
   */
  onDropTracks: (
    collectionId: number,
    tracks: DraggedTracks,
  ) => Promise<{
    ok: boolean;
    error?: string;
    added?: number;
    skipped?: number;
    silent?: boolean;
  }>;
  onNotify?: (message: string, tone: "info" | "warning") => void;
}

export function LibraryPane({
  libraryTrackCount,
  playlists,
  collections,
  scopeIsLibrary,
  onSelectPlaylist,
  onSelectCollection,
  onDropTracks,
  onNotify,
}: LibraryPaneProps) {
  return (
    <div className="cp-library-pane">
      <div className="cp-playlist-pane cp-library-pane__all">
        <div className="cp-playlist-pane__tree" role="tree" aria-label="Everything">
          <div
            role="treeitem"
            aria-level={1}
            aria-selected={scopeIsLibrary}
            data-tree-key="__all__"
            tabIndex={0}
            className={`cp-playlist-pane__row${
              scopeIsLibrary ? " cp-playlist-pane__row--selected" : ""
            }`}
            onClick={() => onSelectPlaylist(null)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelectPlaylist(null);
              }
            }}
          >
            <span className="cp-playlist-pane__twisty" aria-hidden />
            <PixelIcon name="library" className="cp-playlist-pane__icon" />
            <span className="cp-playlist-pane__name">All tracks</span>
            <span className="cp-playlist-pane__count">
              {libraryTrackCount.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      <CollectionsPane
        tree={collections.tree}
        rows={collections.rows}
        selected={collections.selected}
        status={collections.status}
        error={collections.error}
        collapsed={collections.collapsed}
        onToggleSection={collections.setCollapsed}
        onSelect={onSelectCollection}
        onExpand={collections.expand}
        onCreate={collections.create}
        onRename={collections.rename}
        onMove={collections.move}
        onPreviewDelete={collections.previewDelete}
        onDelete={collections.remove}
        onDropTracks={onDropTracks}
        onNotify={onNotify}
      />

      <PlaylistPane
        rows={playlists.rows}
        selected={playlists.selected}
        libraryTrackCount={libraryTrackCount}
        onSelect={onSelectPlaylist}
        onExpand={playlists.expand}
        selectionFellBack={playlists.selectionFellBack}
        status={playlists.status}
        error={playlists.error}
        showAllTracks={false}
        onRefuseDrop={(message) => onNotify?.(message, "warning")}
      />
    </div>
  );
}
