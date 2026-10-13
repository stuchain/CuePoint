/**
 * The places a track can be filed, for Clean's pickers (PAGES-07B, FLW-7).
 *
 * The same list the Library's "In playlist" field offers: Rekordbox playlists
 * and folders, then Collections, then Sets, each in the order its pane draws
 * them. Read through the shared cache (C19d); either read failing leaves that kind out rather than the
 * picker empty, so a library with no Collections still lists its playlists.
 */
import { useMemo } from "react";

import type { CollectionNode, LibraryPlaylistNode } from "../../api/cuepointBridge.types";
import { COLLECTIONS, LIBRARY_PLAYLISTS, useSharedRead } from "../../api/sharedReads";
import { inTreeOrder } from "./cleanRules";
import type { RuleSource } from "../library/filterText";

export interface CleanSource extends RuleSource {
  name: string;
  depth: number;
}

export function sourceOptions(
  playlists: readonly LibraryPlaylistNode[],
  collections: readonly CollectionNode[],
): CleanSource[] {
  const out: CleanSource[] = inTreeOrder(playlists).map((node) => ({
    kind: "playlist",
    id: node.id,
    name: node.name,
    depth: node.depth,
  }));
  const own = inTreeOrder(collections);
  for (const node of own.filter((entry) => entry.kind === "collection")) {
    out.push({ kind: "collection", id: node.id, name: node.name, depth: 0 });
  }
  for (const node of own.filter((entry) => entry.kind === "set")) {
    out.push({ kind: "set", id: node.id, name: node.name, depth: 0 });
  }
  return out;
}

export function useCleanSources(): CleanSource[] {
  // Either read failing, or missing, leaves that kind out (nothing is reported: the picker still works).
  const playlists = useSharedRead(LIBRARY_PLAYLISTS).value;
  const collections = useSharedRead(COLLECTIONS).value;
  return useMemo(
    () => sourceOptions(playlists?.playlists ?? [], collections?.collections ?? []),
    [playlists, collections],
  );
}
