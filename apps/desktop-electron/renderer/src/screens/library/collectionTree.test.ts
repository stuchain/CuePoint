/**
 * CuePoint's tree, as the pane needs it (ORG-09).
 *
 * Three things here are worth more than the rest.
 *
 * **Identity is the id.** The Rekordbox tree beside this one remembers a path,
 * because a refresh renumbers every playlist. Nothing renumbers a Collection,
 * and a *name* is what changes — so remembering a path here would lose the
 * user's place every time they renamed a folder. The tests state that by
 * renaming things and expecting the state to survive.
 *
 * **A drop is refused before it is offered.** ORG-04 refuses a move into a
 * node's own subtree, and so does this, so the cursor never offers a target
 * that can only fail. It answers false rather than a message: the rule is the
 * engine's, and this is the pane declining to draw an impossible affordance.
 *
 * **A delete says what it takes.** A folder holding nine Collections is not a
 * question anyone can answer as "delete this?".
 */
import { beforeEach, describe, expect, it } from "vitest";

import type { CollectionNode } from "../../api/cuepointBridge.types";
import {
  COLLECTIONS_PANE_STORAGE_KEY,
  EMPTY_COLLECTIONS_STATE,
  buildCollectionTree,
  canMoveInto,
  canReorder,
  collectionAncestors,
  collectionRows,
  collectionSortLabel,
  defaultSortForCollection,
  describeDeletion,
  findCollection,
  flattenCollections,
  holdsTracks,
  iconForKind,
  loadCollectionsState,
  movedPosition,
  pruneCollectionIds,
  rulesOf,
  saveCollectionsState,
  subtreeIds,
} from "./collectionTree";

function node(
  id: number,
  name: string,
  kind: CollectionNode["kind"],
  parentId: number | null,
  extra: Partial<CollectionNode> = {},
): CollectionNode {
  return {
    id,
    parent_id: parentId,
    kind,
    name,
    position: 0,
    depth: parentId == null ? 0 : 1,
    rules: null,
    sort: null,
    dir: null,
    frozen_from_id: null,
    frozen_at: null,
    entry_count: 0,
    track_count: 0,
    broken: false,
    problem: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...extra,
  };
}

const NODES: CollectionNode[] = [
  node(1, "Sets", "folder", null),
  node(2, "Warmups", "collection", 1, { entry_count: 12, track_count: 12 }),
  node(3, "Peak", "folder", 1),
  node(4, "Closers", "collection", 3, { entry_count: 4, track_count: 3 }),
  node(5, "Recent techno", "smart", null, {
    rules: { match: "all", rules: [{ field: "genre", operator: "is", value: "Techno" }] },
    sort: "date_added",
    dir: "desc",
  }),
];

describe("building the tree", () => {
  it("nests children under their parents", () => {
    const tree = buildCollectionTree(NODES);
    expect(tree.map((n) => n.name)).toEqual(["Sets", "Recent techno"]);
    expect(tree[0]!.children.map((n) => n.name)).toEqual(["Warmups", "Peak"]);
  });

  it("draws a node whose parent is missing rather than dropping it", () => {
    // The pane shows the tree; it does not audit it. A lost node the user can
    // see is a node they can move; one that is hidden is one they cannot.
    const orphan = buildCollectionTree([node(9, "Lost", "collection", 404)]);
    expect(orphan.map((n) => n.name)).toEqual(["Lost"]);
  });

  it("visits every node depth first", () => {
    expect(flattenCollections(buildCollectionTree(NODES)).map((n) => n.id)).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });
});

describe("what is visible", () => {
  it("shows only the roots when nothing is open", () => {
    const rows = collectionRows(buildCollectionTree(NODES), []);
    expect(rows.map((row) => row.node.name)).toEqual(["Sets", "Recent techno"]);
  });

  it("opens one level at a time", () => {
    const rows = collectionRows(buildCollectionTree(NODES), [1]);
    expect(rows.map((row) => row.node.name)).toEqual([
      "Sets",
      "Warmups",
      "Peak",
      "Recent techno",
    ]);
  });

  it("indents by depth", () => {
    const rows = collectionRows(buildCollectionTree(NODES), [1, 3]);
    const closers = rows.find((row) => row.node.name === "Closers")!;
    expect(closers.depth).toBe(2);
  });

  it("says which rows have children", () => {
    const rows = collectionRows(buildCollectionTree(NODES), [1]);
    expect(rows.find((row) => row.node.name === "Sets")!.hasChildren).toBe(true);
    expect(rows.find((row) => row.node.name === "Warmups")!.hasChildren).toBe(false);
  });
});

describe("finding things", () => {
  it("finds a node by its id", () => {
    expect(findCollection(buildCollectionTree(NODES), 4)?.name).toBe("Closers");
  });

  it("answers null for an id that is gone", () => {
    expect(findCollection(buildCollectionTree(NODES), 404)).toBeNull();
  });

  it("lists the ancestors that have to be opened to reveal a node", () => {
    expect(collectionAncestors(buildCollectionTree(NODES), 4)).toEqual([1, 3]);
  });

  it("lists a subtree, node included", () => {
    const sets = buildCollectionTree(NODES)[0]!;
    expect(subtreeIds(sets).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("where a node may be dropped", () => {
  const tree = buildCollectionTree(NODES);
  const sets = tree[0]!;
  const peak = sets.children[1]!;
  const warmups = sets.children[0]!;

  it("into a folder", () => {
    expect(canMoveInto(warmups, peak)).toBe(true);
  });

  it("not into a Collection, which holds tracks rather than nodes", () => {
    expect(canMoveInto(peak, warmups)).toBe(false);
  });

  it("not into a Smart Collection, which holds a question (DEC-061)", () => {
    expect(canMoveInto(warmups, tree[1]!)).toBe(false);
  });

  it("not into itself", () => {
    expect(canMoveInto(sets, sets)).toBe(false);
  });

  it("not into its own subtree — the tree bug that hides both (ORG-04)", () => {
    expect(canMoveInto(sets, peak)).toBe(false);
  });

  it("out to the top level, when it is not already there", () => {
    expect(canMoveInto(warmups, null)).toBe(true);
    expect(canMoveInto(sets, null)).toBe(false);
  });
});

describe("what a node is", () => {
  it("only a Collection holds tracks", () => {
    expect(holdsTracks(NODES[1]!)).toBe(true);
    expect(holdsTracks(NODES[0]!)).toBe(false);
    expect(holdsTracks(NODES[4]!)).toBe(false);
  });

  it("draws each kind with its own icon", () => {
    expect(iconForKind("folder")).toBe("folder");
    expect(iconForKind("collection")).toBe("collections");
    expect(iconForKind("smart")).toBe("smart");
  });

  it("hands the filter bar a Smart Collection's rules and nothing else's", () => {
    expect(rulesOf(NODES[4]!)?.rules[0]?.field).toBe("genre");
    expect(rulesOf(NODES[1]!)).toBeNull();
  });
});

describe("the order a scope opens on", () => {
  it("is the order the user arranged, inside a Collection", () => {
    expect(defaultSortForCollection(NODES[1]!)).toEqual({
      sort: "collection_position",
      dir: "asc",
    });
  });

  it("is the sort a Smart Collection was saved with", () => {
    expect(defaultSortForCollection(NODES[4]!)).toEqual({
      sort: "date_added",
      dir: "desc",
    });
  });

  it("falls back to the library's default for one saved without a sort", () => {
    const plain = node(6, "Anything", "smart", null, {
      rules: { match: "all", rules: [] },
    });
    expect(defaultSortForCollection(plain)).toEqual({ sort: "artist", dir: "asc" });
  });

  it("names that order in words a user recognizes", () => {
    expect(collectionSortLabel("collection_position")).toBe("In the order you arranged");
    expect(collectionSortLabel("artist")).toBe("artist");
  });
});

describe("what a delete takes", () => {
  it("names every kind and the entries with them", () => {
    expect(
      describeDeletion({
        folders: 2,
        collections: 3,
        smart_collections: 1,
        entries: 412,
        nodes: 6,
      }),
    ).toBe(
      "This removes 2 folders, 3 Collections and 1 Smart Collection, with 412 track " +
        "entries filed in them. No tracks are deleted.",
    );
  });

  it("says one of a thing as one", () => {
    expect(
      describeDeletion({
        folders: 0,
        collections: 1,
        smart_collections: 0,
        entries: 1,
        nodes: 1,
      }),
    ).toBe(
      "This removes 1 Collection, with 1 track entry filed in them. No tracks are deleted.",
    );
  });

  it("leaves the entries out when there are none", () => {
    expect(
      describeDeletion({
        folders: 1,
        collections: 0,
        smart_collections: 0,
        entries: 0,
        nodes: 1,
      }),
    ).toBe("This removes 1 folder. No tracks are deleted.");
  });

  it("always says no tracks are deleted, which is the thing a user fears", () => {
    const sentence = describeDeletion({
      folders: 0,
      collections: 9,
      smart_collections: 0,
      entries: 4000,
      nodes: 9,
    });
    expect(sentence).toContain("No tracks are deleted");
  });
});

describe("what the pane remembers", () => {
  beforeEach(() => localStorage.clear());

  it("starts with nothing open and nothing selected", () => {
    expect(loadCollectionsState(COLLECTIONS_PANE_STORAGE_KEY)).toEqual(
      EMPTY_COLLECTIONS_STATE,
    );
  });

  it("round-trips what was open, selected and folded", () => {
    const state = { expandedIds: [1, 3], selectedId: 4, collapsed: true };
    saveCollectionsState(COLLECTIONS_PANE_STORAGE_KEY, state);
    expect(loadCollectionsState(COLLECTIONS_PANE_STORAGE_KEY)).toEqual(state);
  });

  it("ignores storage that holds something else entirely", () => {
    localStorage.setItem(COLLECTIONS_PANE_STORAGE_KEY, "not json at all");
    expect(loadCollectionsState(COLLECTIONS_PANE_STORAGE_KEY)).toEqual(
      EMPTY_COLLECTIONS_STATE,
    );
  });

  it("ignores a stored shape from some other version", () => {
    localStorage.setItem(
      COLLECTIONS_PANE_STORAGE_KEY,
      JSON.stringify({ expandedIds: ["one"], selectedId: "four" }),
    );
    expect(loadCollectionsState(COLLECTIONS_PANE_STORAGE_KEY)).toEqual(
      EMPTY_COLLECTIONS_STATE,
    );
  });

  it("uses a key of its own, not the legacy ui-lab one", () => {
    // PIXEL_DESIGN_SYSTEM.md §2: the legacy keys are a debt being paid down,
    // and a new key that joins them makes it larger.
    expect(COLLECTIONS_PANE_STORAGE_KEY).not.toContain("-ui-lab-");
    expect(COLLECTIONS_PANE_STORAGE_KEY).toBe("cuepoint-library-collections-pane");
  });

  it("drops ids for nodes that are gone", () => {
    expect(pruneCollectionIds(buildCollectionTree(NODES), [1, 404, 3])).toEqual([1, 3]);
  });

  it("keeps what was open when a node is renamed", () => {
    // The whole reason this tree remembers ids: renaming is the common edit,
    // and a pane that forgot where you were every time you fixed a typo would
    // be worse than one that never remembered.
    const renamed = NODES.map((n) => (n.id === 1 ? { ...n, name: "Live sets" } : n));
    expect(pruneCollectionIds(buildCollectionTree(renamed), [1, 3])).toEqual([1, 3]);
  });
});

describe("rearranging a Collection (ORG-11)", () => {
  const warmups = NODES[1]!;
  const closers = NODES[3]!;
  const inOrder = {
    scope: "collection" as const,
    collectionId: 2,
    sort: "collection_position",
    dir: "asc" as const,
    q: "",
    filtered: false,
  };

  it("is allowed when the table is showing the Collection as it was arranged", () => {
    expect(canReorder(inOrder, warmups)).toEqual({ ok: true });
  });

  it("is refused outside a Collection, and says where to go", () => {
    const answer = canReorder({ ...inOrder, scope: null, collectionId: null }, null);
    expect(answer.ok).toBe(false);
    expect(answer).toMatchObject({ why: expect.stringContaining("Open a Collection") });
  });

  it("is refused under any other ordering", () => {
    // A drag says "put this one there", and "there" has to be a place in the
    // Collection rather than a place in a view sorted by BPM.
    const answer = canReorder({ ...inOrder, sort: "bpm" }, warmups);
    expect(answer).toMatchObject({ ok: false, why: expect.stringContaining("own order") });
  });

  it("is refused when the Collection's own order is upside down", () => {
    const answer = canReorder({ ...inOrder, dir: "desc" }, warmups);
    expect(answer).toMatchObject({ ok: false, why: expect.stringContaining("own order") });
  });

  it("is refused while a search or a filter is narrowing the table", () => {
    // Row 4 of a filtered view is not entry 4 of the Collection, and writing
    // one as the other scrambles the order silently.
    expect(canReorder({ ...inOrder, q: "dub" }, warmups)).toMatchObject({
      ok: false,
      why: expect.stringContaining("Clear the search"),
    });
    expect(canReorder({ ...inOrder, filtered: true }, warmups)).toMatchObject({
      ok: false,
      why: expect.stringContaining("Clear the search"),
    });
  });

  it("is refused when a track is in the Collection twice (DEC-058)", () => {
    // The browse query collapses duplicates to the earliest position, so a row
    // index stops being an entry position and the renderer cannot tell.
    expect(canReorder({ ...inOrder, collectionId: 4 }, closers)).toMatchObject({
      ok: false,
      why: expect.stringContaining("more than once"),
    });
  });

  it("names the Collection it is refusing about", () => {
    const answer = canReorder({ ...inOrder, collectionId: 4 }, closers);
    expect(answer).toMatchObject({ why: expect.stringContaining("Closers") });
  });

  it("refuses with a sentence rather than a bare false", () => {
    // A drop that does nothing teaches a user the feature is broken.
    const answer = canReorder({ ...inOrder, sort: "bpm" }, warmups);
    expect(answer.ok).toBe(false);
    expect((answer as { why: string }).why.length).toBeGreaterThan(20);
  });
});

describe("where a dragged row lands", () => {
  it("keeps its place when it is dropped where it already is", () => {
    expect(movedPosition(3, 3)).toBe(3);
  });

  it("moves up to the gap it was dropped in", () => {
    expect(movedPosition(7, 2)).toBe(2);
  });

  it("accounts for its own removal when it moves down", () => {
    // Dropped into the gap before row 7, a row from position 2 ends at 6:
    // taking it out first moved everything after it up one.
    expect(movedPosition(2, 7)).toBe(6);
  });

  it("lands at the end when it is dropped past the last row", () => {
    expect(movedPosition(0, 10)).toBe(9);
  });
});
