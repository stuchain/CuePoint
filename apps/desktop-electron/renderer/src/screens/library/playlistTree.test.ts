/**
 * The mirrored tree, as the pane needs it (LIBUI-07, DEC-044).
 *
 * Two things here are decisions rather than plumbing:
 *
 * **A name may contain the path separator.** Four playlists in a real 3,880-
 * track export do (`COZMO_11/02`), which is why migration 0006 made
 * `parent_id` the structure and the path a derived convenience. Nothing here
 * may split a path to find a name.
 *
 * **What is remembered is a path, not an id.** A refresh replaces the whole
 * mirror, so every playlist gets a new id on every import; a remembered id
 * would either lose the user's place or land them in a different playlist.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryPlaylistNode } from "../../api/cuepointBridge.types";
import {
  EMPTY_PANE_STATE,
  PLAYLIST_PANE_STORAGE_KEY,
  ancestorPaths,
  buildTree,
  defaultSortForScope,
  findByPath,
  flatten,
  loadPaneState,
  pruneExpanded,
  resolveSelection,
  savePaneState,
  sortLabel,
  visibleRows,
} from "./playlistTree";

function node(
  id: number,
  name: string,
  kind: "folder" | "playlist",
  depth: number,
  path: string,
  parentId: number | null,
  trackCount = 0,
): LibraryPlaylistNode {
  return {
    id,
    parent_id: parentId,
    name,
    kind,
    depth,
    position: 0,
    path,
    track_count: trackCount,
  };
}

/**
 * SETS
 *   warmup (12)
 *   peak
 *     COZMO_11/02 (9)   <- a name containing the separator
 * ONE-OFFS (3)
 */
const NODES: LibraryPlaylistNode[] = [
  node(1, "SETS", "folder", 0, "SETS", null),
  node(2, "warmup", "playlist", 1, "SETS/warmup", 1, 12),
  node(3, "peak", "folder", 1, "SETS/peak", 1),
  node(4, "COZMO_11/02", "playlist", 2, "SETS/peak/COZMO_11/02", 3, 9),
  node(5, "ONE-OFFS", "playlist", 0, "ONE-OFFS", null, 3),
];

const tree = () => buildTree(NODES);

beforeEach(() => {
  localStorage.clear();
});

describe("building the tree", () => {
  it("nests children under their parent", () => {
    const roots = tree();
    expect(roots.map((n) => n.name)).toEqual(["SETS", "ONE-OFFS"]);
    expect(roots[0]!.children.map((n) => n.name)).toEqual(["warmup", "peak"]);
    expect(roots[0]!.children[1]!.children.map((n) => n.name)).toEqual(["COZMO_11/02"]);
  });

  it("keeps a name that contains the separator whole", () => {
    const deep = tree()[0]!.children[1]!.children[0]!;
    expect(deep.name).toBe("COZMO_11/02");
    expect(deep.path).toBe("SETS/peak/COZMO_11/02");
  });

  it("treats a node whose parent is missing as a root", () => {
    const orphan = [node(9, "stray", "playlist", 1, "GONE/stray", 404, 2)];
    expect(buildTree(orphan).map((n) => n.name)).toEqual(["stray"]);
  });

  it("builds nothing from nothing", () => {
    expect(buildTree([])).toEqual([]);
  });

  it("flattens depth first, in draw order", () => {
    expect(flatten(tree()).map((n) => n.name)).toEqual([
      "SETS",
      "warmup",
      "peak",
      "COZMO_11/02",
      "ONE-OFFS",
    ]);
  });
});

describe("what is on screen", () => {
  it("shows the roots when nothing is expanded", () => {
    expect(visibleRows(tree(), []).map((row) => row.node.name)).toEqual([
      "SETS",
      "ONE-OFFS",
    ]);
  });

  it("shows the children of an expanded folder", () => {
    expect(visibleRows(tree(), ["SETS"]).map((row) => row.node.name)).toEqual([
      "SETS",
      "warmup",
      "peak",
      "ONE-OFFS",
    ]);
  });

  it("keeps a subtree hidden while its parent is closed", () => {
    // "peak" is expanded but SETS is not, so nothing under either shows.
    expect(visibleRows(tree(), ["SETS/peak"]).map((row) => row.node.name)).toEqual([
      "SETS",
      "ONE-OFFS",
    ]);
  });

  it("reports depth, so a row can be indented", () => {
    const rows = visibleRows(tree(), ["SETS", "SETS/peak"]);
    expect(rows.map((row) => row.depth)).toEqual([0, 1, 1, 2, 0]);
  });

  it("says which rows have children", () => {
    const rows = visibleRows(tree(), ["SETS"]);
    expect(rows.map((row) => row.hasChildren)).toEqual([true, false, true, false]);
  });
});

describe("finding a node", () => {
  it("finds one by path", () => {
    expect(findByPath(tree(), "SETS/warmup")?.id).toBe(2);
  });

  it("finds one whose name contains the separator", () => {
    expect(findByPath(tree(), "SETS/peak/COZMO_11/02")?.name).toBe("COZMO_11/02");
  });

  it("finds nothing for a path that is gone", () => {
    expect(findByPath(tree(), "SETS/deleted")).toBeNull();
  });

  it("treats no path as the whole library", () => {
    expect(findByPath(tree(), null)).toBeNull();
  });

  it("takes the first match when a path is ambiguous", () => {
    // Paths are not unique by construction (migration 0006): a folder "A/B"
    // holding "C" and a folder "A" holding "B/C" produce the same string.
    const ambiguous = [
      node(1, "A", "folder", 0, "A", null),
      node(2, "B/C", "playlist", 1, "A/B/C", 1, 4),
      node(3, "B", "folder", 1, "A/B", 1),
      node(4, "C", "playlist", 2, "A/B/C", 3, 7),
    ];
    expect(findByPath(buildTree(ambiguous), "A/B/C")?.id).toBe(2);
  });

  it("lists the ancestors that have to be open to see a node", () => {
    expect(ancestorPaths(tree(), "SETS/peak/COZMO_11/02")).toEqual([
      "SETS",
      "SETS/peak",
    ]);
  });

  it("has no ancestors for a root", () => {
    expect(ancestorPaths(tree(), "ONE-OFFS")).toEqual([]);
  });
});

describe("the sort a scope opens on", () => {
  it("is Rekordbox's own order inside a playlist", () => {
    expect(defaultSortForScope(findByPath(tree(), "SETS/warmup"))).toBe(
      "playlist_position",
    );
  });

  it("is the library default for a folder", () => {
    // A folder interleaves several playlists' positions, which means nothing.
    expect(defaultSortForScope(findByPath(tree(), "SETS"))).toBe("artist");
  });

  it("is the library default for the whole library", () => {
    expect(defaultSortForScope(null)).toBe("artist");
  });

  it("has a name a person would recognize", () => {
    expect(sortLabel("playlist_position")).toBe("As arranged in Rekordbox");
  });
});

describe("remembering where the user was", () => {
  it("round-trips expansion and selection", () => {
    const state = { expandedPaths: ["SETS", "SETS/peak"], selectedPath: "SETS/warmup" };
    savePaneState(PLAYLIST_PANE_STORAGE_KEY, state);

    expect(loadPaneState(PLAYLIST_PANE_STORAGE_KEY)).toEqual(state);
  });

  it("remembers paths rather than ids", () => {
    // A refresh replaces the mirror, so ids change on every import. Storing
    // one would lose the user's place, or land them somewhere else entirely.
    savePaneState(PLAYLIST_PANE_STORAGE_KEY, {
      expandedPaths: ["SETS"],
      selectedPath: "SETS/warmup",
    });
    const raw = localStorage.getItem(PLAYLIST_PANE_STORAGE_KEY)!;

    expect(raw).toContain("SETS/warmup");
    expect(JSON.parse(raw).selectedPath).not.toBe(2);
  });

  it("starts empty", () => {
    expect(loadPaneState(PLAYLIST_PANE_STORAGE_KEY)).toEqual(EMPTY_PANE_STATE);
  });

  it("ignores a corrupt value", () => {
    localStorage.setItem(PLAYLIST_PANE_STORAGE_KEY, "{not json");
    expect(loadPaneState(PLAYLIST_PANE_STORAGE_KEY)).toEqual(EMPTY_PANE_STATE);
  });

  it("ignores a value of the wrong shape", () => {
    localStorage.setItem(PLAYLIST_PANE_STORAGE_KEY, JSON.stringify({
      expandedPaths: "SETS",
      selectedPath: 7,
    }));
    expect(loadPaneState(PLAYLIST_PANE_STORAGE_KEY)).toEqual(EMPTY_PANE_STATE);
  });

  it("survives a storage that will not be read", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Access denied");
    });
    expect(loadPaneState(PLAYLIST_PANE_STORAGE_KEY)).toEqual(EMPTY_PANE_STATE);
    spy.mockRestore();
  });

  it("survives a storage that will not be written", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Quota exceeded");
    });
    expect(() =>
      savePaneState(PLAYLIST_PANE_STORAGE_KEY, EMPTY_PANE_STATE),
    ).not.toThrow();
    spy.mockRestore();
  });

  it("uses a key without the legacy naming", () => {
    expect(PLAYLIST_PANE_STORAGE_KEY).toBe("cuepoint-library-playlist-pane");
    expect(PLAYLIST_PANE_STORAGE_KEY).not.toContain("ui-lab");
  });
});

describe("a remembered selection that is gone", () => {
  it("resolves a selection that still exists", () => {
    const resolved = resolveSelection(tree(), "SETS/warmup");
    expect(resolved.node?.name).toBe("warmup");
    expect(resolved.fellBack).toBe(false);
  });

  it("falls back when the playlist has been removed", () => {
    const resolved = resolveSelection(tree(), "SETS/deleted");
    expect(resolved.node).toBeNull();
    expect(resolved.fellBack).toBe(true);
  });

  it("does not call the whole library a fallback", () => {
    expect(resolveSelection(tree(), null)).toEqual({ node: null, fellBack: false });
  });

  it("forgets expansion for folders that are gone", () => {
    expect(pruneExpanded(tree(), ["SETS", "GONE", "SETS/peak"])).toEqual([
      "SETS",
      "SETS/peak",
    ]);
  });
});
