/**
 * The Collections section, and the hook behind it (ORG-09, DEC-062).
 *
 * What these protect:
 *
 * **It is editable, and the Rekordbox section beside it is not.** Everything
 * here is a gesture the mirror deliberately refuses — create, rename, move,
 * delete, drop — and the two sections share one tree component, so the tests
 * that say the mirror offers none of it (`PlaylistPane.test.tsx`) and the
 * tests here that say this one does are the same claim from both ends.
 *
 * **A delete says what it takes before it takes it.** A folder holding nine
 * Collections cannot be deleted on a "delete this?" — and no gesture in this
 * pane may delete a track, which the confirmation says out loud.
 *
 * **A drop that cannot work is never offered.** The engine refuses a move into
 * a node's own subtree and rows against a Smart Collection; the cursor refuses
 * them first, so a user is never invited to do something that fails.
 *
 * **The place you were survives.** Expansion and selection are remembered by
 * id, so a rename does not lose them.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CollectionNode } from "../../api/cuepointBridge.types";
import { CollectionsPane } from "./CollectionsPane";
import {
  COLLECTIONS_PANE_STORAGE_KEY,
  buildCollectionTree,
  collectionRows,
} from "./collectionTree";
import { COLLECTION_NODE_MIME, TRACK_IDS_MIME } from "./collectionDrag";
import { useCollectionTree } from "./useCollectionTree";

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
  node(5, "Recent techno", "smart", null, {
    rules: { match: "all", rules: [{ field: "genre", operator: "is", value: "Techno" }] },
  }),
];

const SUBTREE = {
  folders: 1,
  collections: 2,
  smart_collections: 0,
  entries: 40,
  nodes: 3,
};

function paneWith(
  nodes: CollectionNode[] = NODES,
  expanded: number[] = [1],
  overrides: Partial<React.ComponentProps<typeof CollectionsPane>> = {},
) {
  const tree = buildCollectionTree(nodes);
  const handlers = {
    onSelect: vi.fn(),
    onExpand: vi.fn(),
    // The node a create answers with is the one the pane opens for renaming.
    // It is one the fixture already draws, because the tree here does not
    // reload the way the hook's does.
    onCreate: vi.fn(async () => ({ ok: true, node: NODES[1]! })),
    onRename: vi.fn(async () => ({ ok: true })),
    onMove: vi.fn(async () => ({ ok: true })),
    onPreviewDelete: vi.fn(async () => SUBTREE),
    onDelete: vi.fn(async () => ({ ok: true })),
    onDropTracks: vi.fn(async () => ({ ok: true, added: 2, skipped: 0 })),
    onNotify: vi.fn(),
  };
  const view = render(
    <CollectionsPane
      tree={tree}
      rows={collectionRows(tree, expanded)}
      selected={null}
      {...handlers}
      {...overrides}
    />,
  );
  return { tree, view, ...handlers };
}

function rowFor(name: string): HTMLElement {
  return screen
    .getAllByRole("treeitem")
    .find((item) => within(item).queryByText(name) !== null)!;
}

/** A drag carrying what the table drags (ORG-11's source, simulated here). */
function trackDrag(trackIds: number[]) {
  return {
    dataTransfer: {
      types: [TRACK_IDS_MIME],
      getData: (format: string) =>
        format === TRACK_IDS_MIME ? JSON.stringify(trackIds) : "",
      setData: vi.fn(),
      dropEffect: "",
      effectAllowed: "",
    },
  };
}

/** A drag carrying one of this tree's own nodes. */
function nodeDrag(id: number) {
  return {
    dataTransfer: {
      types: [COLLECTION_NODE_MIME],
      getData: (format: string) => (format === COLLECTION_NODE_MIME ? String(id) : ""),
      setData: vi.fn(),
      dropEffect: "",
      effectAllowed: "",
    },
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("what the section shows", () => {
  it("draws the tree under its own heading", () => {
    paneWith();
    expect(screen.getByRole("tree", { name: "Collections" })).toBeInTheDocument();
    expect(rowFor("Sets")).toBeInTheDocument();
    expect(rowFor("Warmups")).toBeInTheDocument();
  });

  it("tells a folder, a Collection and a Smart Collection apart", () => {
    paneWith();
    expect(rowFor("Sets")).toHaveAttribute("data-kind", "folder");
    expect(rowFor("Warmups")).toHaveAttribute("data-kind", "collection");
    expect(rowFor("Recent techno")).toHaveAttribute("data-kind", "smart");
  });

  it("counts what a Collection holds, and says nothing for a folder", () => {
    paneWith();
    expect(within(rowFor("Warmups")).getByText("12")).toBeInTheDocument();
    expect(within(rowFor("Sets")).queryByText("0")).not.toBeInTheDocument();
  });

  it("says what a Collection is when there are none", () => {
    paneWith([], []);
    expect(screen.getByText(/A Collection is your own list of tracks/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Create your first Collection/i }),
    ).toBeInTheDocument();
  });

  it("folds the whole section away", async () => {
    paneWith(NODES, [1], { collapsed: true });
    expect(screen.queryByRole("tree", { name: "Collections" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Collections/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("reports a tree it could not read", () => {
    paneWith(NODES, [1], { status: "error", error: "Engine offline" });
    expect(screen.getByRole("alert")).toHaveTextContent("Engine offline");
  });
});

describe("a broken Smart Collection (ORG-06)", () => {
  const broken = [
    node(5, "Peak time", "smart", null, {
      rules: { match: "all", rules: [] },
      broken: true,
      problem: "its rules name a tag that has been deleted",
    }),
  ];

  it("is still a row", () => {
    paneWith(broken, []);
    expect(rowFor("Peak time")).toBeInTheDocument();
  });

  it("is marked, with the reason readable", () => {
    paneWith(broken, []);
    expect(
      screen.getByRole("img", { name: /Broken: its rules name a tag/i }),
    ).toBeInTheDocument();
  });

  it("still opens when it is clicked", () => {
    // Showing someone the rule that broke is more useful than refusing to
    // open the thing that would show it to them.
    const { onSelect } = paneWith(broken, []);
    fireEvent.click(rowFor("Peak time"));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
  });
});

describe("creating", () => {
  it("makes a Collection and puts the cursor in its name", async () => {
    const { onCreate } = paneWith();

    await userEvent.click(screen.getByRole("button", { name: "New Collection" }));

    expect(onCreate).toHaveBeenCalledWith("collection", "New Collection", null);
    // Straight into the name: a row called "New Collection" the user has to
    // find and rename is a worse gesture than one already waiting for a name.
    expect(await screen.findByRole("textbox", { name: /^Rename/ })).toBeInTheDocument();
  });

  it("makes a folder", async () => {
    const { onCreate } = paneWith();

    await userEvent.click(screen.getByRole("button", { name: "New folder" }));

    expect(onCreate).toHaveBeenCalledWith("folder", "New folder", null);
  });

  it("makes it inside the selected folder", async () => {
    const tree = buildCollectionTree(NODES);
    const { onCreate } = paneWith(NODES, [1], { selected: tree[0]! });

    await userEvent.click(screen.getByRole("button", { name: "New Collection" }));

    expect(onCreate).toHaveBeenCalledWith("collection", "New Collection", 1);
  });

  it("says so when it could not", async () => {
    const { onNotify } = paneWith(NODES, [1], {
      onCreate: vi.fn(async () => ({ ok: false, error: "A name that long is refused" })),
    });

    await userEvent.click(screen.getByRole("button", { name: "New Collection" }));

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith("A name that long is refused", "warning"),
    );
  });
});

describe("renaming", () => {
  it("edits in place and commits on Enter", async () => {
    const { onRename } = paneWith();

    await userEvent.click(screen.getByRole("button", { name: "Rename Warmups" }));
    const field = screen.getByRole("textbox", { name: "Rename Warmups" });
    await userEvent.clear(field);
    await userEvent.type(field, "Openers{Enter}");

    expect(onRename).toHaveBeenCalledWith(2, "Openers");
  });

  it("abandons on Escape", async () => {
    const { onRename } = paneWith();

    await userEvent.click(screen.getByRole("button", { name: "Rename Warmups" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Rename Warmups" }), "x{Escape}");

    expect(onRename).not.toHaveBeenCalled();
  });

  it("sends nothing when the name did not change", async () => {
    // Renaming something to what it is called is not a change, and the round
    // trip would redraw the tree for nothing.
    const { onRename } = paneWith();

    await userEvent.click(screen.getByRole("button", { name: "Rename Warmups" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Rename Warmups" }), "{Enter}");

    expect(onRename).not.toHaveBeenCalled();
  });

  it("starts from the keyboard with F2", async () => {
    paneWith();

    fireEvent.keyDown(rowFor("Warmups"), { key: "F2" });

    expect(await screen.findByRole("textbox", { name: "Rename Warmups" })).toBeInTheDocument();
  });

  it("reports a refusal from the engine", async () => {
    const { onNotify } = paneWith(NODES, [1], {
      onRename: vi.fn(async () => ({ ok: false, error: "That name is already taken" })),
    });

    await userEvent.click(screen.getByRole("button", { name: "Rename Warmups" }));
    const field = screen.getByRole("textbox", { name: "Rename Warmups" });
    await userEvent.clear(field);
    await userEvent.type(field, "Peak{Enter}");

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith("That name is already taken", "warning"),
    );
  });
});

describe("moving by drag", () => {
  it("re-files a Collection into a folder", async () => {
    const { onMove } = paneWith();

    fireEvent.drop(rowFor("Peak"), nodeDrag(2));

    await waitFor(() => expect(onMove).toHaveBeenCalledWith(2, 3));
  });

  it("refuses a move into the node's own subtree", async () => {
    // The classic tree bug: drag a folder into its own child and the pair
    // disappears from the tree. ORG-04 refuses it; the cursor refuses it
    // first, so the gesture is never offered.
    const { onMove } = paneWith();

    const event = nodeDrag(1);
    fireEvent.dragOver(rowFor("Peak"), event);
    fireEvent.drop(rowFor("Peak"), event);

    await waitFor(() => expect(onMove).not.toHaveBeenCalled());
  });

  it("refuses a move into a Collection, which holds tracks", async () => {
    const { onMove } = paneWith();

    fireEvent.drop(rowFor("Warmups"), nodeDrag(3));

    await waitFor(() => expect(onMove).not.toHaveBeenCalled());
  });

  it("reports the engine's refusal when one gets through", async () => {
    const { onNotify } = paneWith(NODES, [1], {
      onMove: vi.fn(async () => ({ ok: false, error: "A tree may be at most 5 deep" })),
    });

    fireEvent.drop(rowFor("Peak"), nodeDrag(2));

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith("A tree may be at most 5 deep", "warning"),
    );
  });

  it("makes its own rows draggable and the mirror's not", () => {
    paneWith();
    expect(rowFor("Warmups")).toHaveAttribute("draggable", "true");
  });
});

describe("dropping tracks (the pane's first drop target)", () => {
  it("adds them to a Collection", async () => {
    const { onDropTracks } = paneWith();

    fireEvent.drop(rowFor("Warmups"), trackDrag([7, 8]));

    await waitFor(() => expect(onDropTracks).toHaveBeenCalledWith(2, [7, 8]));
  });

  it("says how many landed and how many were already there", async () => {
    const { onNotify } = paneWith(NODES, [1], {
      onDropTracks: vi.fn(async () => ({ ok: true, added: 2, skipped: 3 })),
    });

    fireEvent.drop(rowFor("Warmups"), trackDrag([7, 8, 9, 10, 11]));

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(
        "Added 2 tracks to Warmups — 3 already there.",
        "info",
      ),
    );
  });

  it("refuses a folder, which holds nodes rather than tracks", async () => {
    const { onDropTracks } = paneWith();

    fireEvent.drop(rowFor("Sets"), trackDrag([7]));

    await waitFor(() => expect(onDropTracks).not.toHaveBeenCalled());
  });

  it("refuses a Smart Collection, which holds a question (DEC-061)", async () => {
    const { onDropTracks } = paneWith();

    fireEvent.drop(rowFor("Recent techno"), trackDrag([7]));

    await waitFor(() => expect(onDropTracks).not.toHaveBeenCalled());
  });

  it("marks the row a drop would land on", () => {
    paneWith();

    fireEvent.dragOver(rowFor("Warmups"), trackDrag([7]));

    expect(rowFor("Warmups").className).toContain("cp-playlist-pane__row--drop");
  });

  it("marks nothing when the drop would be refused", () => {
    paneWith();

    fireEvent.dragOver(rowFor("Sets"), trackDrag([7]));

    expect(rowFor("Sets").className).not.toContain("cp-playlist-pane__row--drop");
  });
});

describe("deleting", () => {
  it("asks first, with the counts the engine gave it", async () => {
    const { onPreviewDelete, onDelete } = paneWith();

    await userEvent.click(screen.getByRole("button", { name: "Delete Sets" }));

    expect(onPreviewDelete).toHaveBeenCalledWith(1);
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      /1 folder and 2 Collections, with 40 track entries/i,
    );
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("promises that no track is deleted", async () => {
    // The thing a user is actually afraid of, said in the dialog rather than
    // in a document nobody reads.
    paneWith();

    await userEvent.click(screen.getByRole("button", { name: "Delete Sets" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(/No tracks are deleted/i);
  });

  it("deletes when the question is answered", async () => {
    const { onDelete } = paneWith();

    await userEvent.click(screen.getByRole("button", { name: "Delete Sets" }));
    await userEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(1));
  });

  it("keeps it when the question is declined", async () => {
    const { onDelete } = paneWith();

    await userEvent.click(screen.getByRole("button", { name: "Delete Sets" }));
    await userEvent.click(await screen.findByRole("button", { name: "Keep it" }));

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("asks anyway when the preview could not be read", async () => {
    // Refusing to let someone delete a Collection because the *preview* failed
    // would be a worse answer than a question with less detail in it.
    paneWith(NODES, [1], { onPreviewDelete: vi.fn(async () => null) });

    await userEvent.click(screen.getByRole("button", { name: "Delete Sets" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      /removes it and everything filed inside it/i,
    );
  });

  it("starts from the keyboard with Delete", async () => {
    paneWith();

    fireEvent.keyDown(rowFor("Warmups"), { key: "Delete" });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("the hook behind it", () => {
  let getCollections: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getCollections = vi.fn(async () => ({
      collections: NODES,
      total: NODES.length,
    }));
    (window as unknown as { cuepoint?: unknown }).cuepoint = {
      getCollections,
      createCollection: vi.fn(async () => ({
        collection: node(9, "New Collection", "collection", null),
      })),
      renameCollection: vi.fn(async () => ({
        collection: node(2, "Openers", "collection", 1),
      })),
      moveCollection: vi.fn(async () => ({ collection: node(2, "Warmups", "collection", 3) })),
      previewCollectionDelete: vi.fn(async () => ({ removes: SUBTREE })),
      deleteCollection: vi.fn(async () => ({ removed: SUBTREE })),
      addTracksToCollection: vi.fn(async () => ({
        added: 2,
        skipped: 0,
        added_track_ids: [7, 8],
        skipped_track_ids: [],
      })),
    };
  });

  it("fetches the tree once", async () => {
    const { result } = renderHook(() => useCollectionTree());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(getCollections).toHaveBeenCalledTimes(1);
    expect(result.current.tree).toHaveLength(2);
  });

  it("says so when the bridge is not there at all", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    const { result } = renderHook(() => useCollectionTree());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });

  it("remembers what was open across a remount", async () => {
    const first = renderHook(() => useCollectionTree());
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    act(() => first.result.current.expand(1, true));
    first.unmount();

    const second = renderHook(() => useCollectionTree());
    await waitFor(() => expect(second.result.current.status).toBe("ready"));
    expect(second.result.current.rows.map((row) => row.node.name)).toContain("Warmups");
  });

  it("remembers what was selected across a remount", async () => {
    const first = renderHook(() => useCollectionTree());
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    act(() => first.result.current.select(NODES[1]!));
    first.unmount();

    const second = renderHook(() => useCollectionTree());
    await waitFor(() => expect(second.result.current.selected?.id).toBe(2));
  });

  it("reveals a selection inside a closed folder", async () => {
    const { result } = renderHook(() => useCollectionTree());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.select(NODES[1]!));

    expect(result.current.rows.map((row) => row.node.name)).toContain("Warmups");
  });

  it("forgets a selection whose node is gone", async () => {
    localStorage.setItem(
      COLLECTIONS_PANE_STORAGE_KEY,
      JSON.stringify({ expandedIds: [], selectedId: 404, collapsed: false }),
    );
    const { result } = renderHook(() => useCollectionTree());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.selected).toBeNull();
  });

  it("re-reads the tree after a write rather than patching it", async () => {
    // Two copies of the rules about depth, order and what a folder may hold
    // is one copy too many, and the renderer's would be the wrong one.
    const { result } = renderHook(() => useCollectionTree());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.rename(2, "Openers");
    });

    await waitFor(() => expect(getCollections).toHaveBeenCalledTimes(2));
  });

  it("turns a refusal into a message rather than throwing", async () => {
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint.renameCollection =
      vi.fn(async () => {
        throw new Error("A collection name cannot be blank");
      });
    const { result } = renderHook(() => useCollectionTree());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const outcome = await result.current.rename(2, "   ");

    expect(outcome).toEqual({ ok: false, error: "A collection name cannot be blank" });
  });

  it("says a build with no bridge cannot edit, rather than failing oddly", async () => {
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint = {
      getCollections,
    };
    const { result } = renderHook(() => useCollectionTree());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(await result.current.create("folder", "Sets", null)).toEqual({
      ok: false,
      error: "This build cannot edit Collections.",
    });
  });

  it("adds dropped tracks and reports both counts", async () => {
    const { result } = renderHook(() => useCollectionTree());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const outcome = await result.current.addTracks(2, [7, 8]);

    expect(outcome).toEqual({ ok: true, added: 2, skipped: 0 });
  });
});

describe("at the size a real library reaches (ORG-09's DoD)", () => {
  /** Twenty folders of nine Collections each, which is 200 nodes. */
  const MANY: CollectionNode[] = Array.from({ length: 20 }, (_, folder) => [
    node(1000 + folder, `Folder ${folder}`, "folder", null),
    ...Array.from({ length: 9 }, (_, child) =>
      node(2000 + folder * 10 + child, `Set ${folder}-${child}`, "collection", 1000 + folder, {
        entry_count: child * 3,
        track_count: child * 3,
      }),
    ),
  ]).flat();

  it("holds two hundred nodes", () => {
    expect(MANY).toHaveLength(200);
  });

  it("draws only what is open, so a closed tree is twenty rows", () => {
    // The reason a two-hundred-node tree is not slow: it is never all drawn.
    // A pane that flattened everything would render 200 rows to show 20.
    paneWith(MANY, []);
    expect(screen.getAllByRole("treeitem")).toHaveLength(20);
  });

  it("draws a folder's children when it opens, and no more", () => {
    paneWith(MANY, [1003]);
    expect(screen.getAllByRole("treeitem")).toHaveLength(29);
  });

  it("renders the whole tree quickly enough to be uninteresting", () => {
    // Not a benchmark: a guard against an accidental O(n²), which is what a
    // tree built by scanning the list once per node would be. Two hundred
    // nodes fully expanded, in a jsdom that is far slower than a browser.
    const expanded = MANY.filter((n) => n.kind === "folder").map((n) => n.id);
    const started = performance.now();
    paneWith(MANY, expanded);
    const elapsed = performance.now() - started;

    expect(screen.getAllByRole("treeitem")).toHaveLength(200);
    expect(elapsed).toBeLessThan(4000);
  });

  it("selects a row without walking every other one", async () => {
    const { onSelect } = paneWith(MANY, [1019]);

    fireEvent.click(rowFor("Set 19-8"));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: "Set 19-8" }));
  });
});
