/**
 * What "New Set from…" can copy, when the Prepare page asks (PREP-10).
 *
 * In the Library the source is the node right-clicked (PREP-09). The Prepare
 * page has no node under the pointer, so it offers every source first: CuePoint's
 * Collections and Smart Collections in the tree's order, then the Rekordbox
 * playlists. Folders hold nothing to copy, and a Set is copied with
 * "Duplicate", which keeps its chapters and times.
 */
import type { LibraryPlaylistNode } from "../../api/cuepointBridge.types";
import { flattenCollections, type CollectionTreeNode } from "../library/collectionTree";
import type { NewSetSource } from "../library/newSetFrom";

export interface SourceGroup {
  label: string;
  sources: NewSetSource[];
}

/** The sources, grouped as the picker draws them; empty groups are left out. */
export function newSetSources(
  tree: readonly CollectionTreeNode[],
  playlists: readonly LibraryPlaylistNode[],
): SourceGroup[] {
  const nodes = flattenCollections(tree);
  const collections = nodes
    .filter((node) => node.kind === "collection" || node.kind === "smart")
    .map(
      (node): NewSetSource => ({
        kind: node.kind === "smart" ? "smart" : "collection",
        id: node.id,
        name: node.name,
        parentId: node.parent_id,
      }),
    );
  const rekordbox = playlists
    .filter((node) => node.kind === "playlist")
    .map((node): NewSetSource => ({ kind: "playlist", id: node.id, name: node.name, parentId: null }));
  return [
    { label: "CuePoint", sources: collections },
    { label: "Rekordbox playlists", sources: rekordbox },
  ].filter((group) => group.sources.length > 0);
}

/** A source's key in the picker: its kind and id, since a Collection and a playlist can share an id. */
export function sourceKey(source: Pick<NewSetSource, "kind" | "id">): string {
  return `${source.kind}:${source.id}`;
}
