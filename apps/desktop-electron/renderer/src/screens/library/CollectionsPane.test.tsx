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
    // Wired as the page wires them (ORG-13): a pane given neither offers
    // neither, which is its own test below.
    onDuplicateSmart: vi.fn(async () => ({ ok: true })),
    onFreezeSmart: vi.fn(async () => ({ ok: true, frozen: 12 })),
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

    // The payload rather than a bare list: a selection may be a query, and
    // one reader for both is what stops a target handling one and dropping
    // the other (ORG-11, DEC-045).
    await waitFor(() => expect(onDropTracks).toHaveBeenCalledWith(2, { ids: [7, 8] }));
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
      duplicateSmartCollection: vi.fn(async () => ({
        collection: node(6, "Recent techno copy", "smart", null),
      })),
      freezeSmartCollection: vi.fn(async () => ({
        collection: node(7, "Recent techno (frozen)", "collection", null),
        source_id: 5,
        source_name: "Recent techno",
        track_count: 412,
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

  it("lets the engine name a duplicate rather than naming it here", async () => {
    // `_suffixed_name` trims to the column's limit, so a Collection already at
    // the limit duplicates instead of failing with a message about a name the
    // user never typed. A renderer that appended " copy" itself would hit that.
    const { result } = renderHook(() => useCollectionTree());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.duplicateSmart(5);
    });

    const bridge = (window as unknown as { cuepoint: Record<string, ReturnType<typeof vi.fn>> })
      .cuepoint;
    expect(bridge.duplicateSmartCollection).toHaveBeenCalledWith({ id: 5, name: null });
  });

  it("carries the engine's frozen count back to the caller", async () => {
    const { result } = renderHook(() => useCollectionTree());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const outcome = await result.current.freezeSmart(5);

    expect(outcome.ok).toBe(true);
    expect(outcome.frozen).toBe(412);
  });

  it("re-reads the tree after a freeze, which adds a row to it", async () => {
    const { result } = renderHook(() => useCollectionTree());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.freezeSmart(5);
    });

    await waitFor(() => expect(getCollections).toHaveBeenCalledTimes(2));
  });

  it("re-reads the tree after a duplicate too", async () => {
    const { result } = renderHook(() => useCollectionTree());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    await act(async () => {
      await result.current.duplicateSmart(5);
    });

    await waitFor(() => expect(getCollections).toHaveBeenCalledTimes(2));
  });

  it("says a build without the routes cannot do either", async () => {
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint = {
      getCollections,
    };
    const { result } = renderHook(() => useCollectionTree());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(await result.current.duplicateSmart(5)).toEqual({
      ok: false,
      error: "This build cannot edit Collections.",
    });
    expect(await result.current.freezeSmart(5)).toEqual({
      ok: false,
      error: "This build cannot edit Collections.",
    });
  });

  it("turns a refused freeze into a message", async () => {
    // DEC-060: a Smart Collection whose tag was deleted cannot be frozen,
    // because storing "no tracks" would record an answer it never gave.
    (window as unknown as { cuepoint: Record<string, unknown> }).cuepoint
      .freezeSmartCollection = vi.fn(async () => {
      throw new Error("Its rules name a tag that no longer exists");
    });
    const { result } = renderHook(() => useCollectionTree());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(await result.current.freezeSmart(5)).toEqual({
      ok: false,
      error: "Its rules name a tag that no longer exists",
    });
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

/**
 * Being asked for (ORG-13, DEC-062).
 *
 * The Collections nav destination resolves to the Library page "with the
 * Collections tree focused". Focus is an act, so it arrives as a token that
 * changed rather than a flag that is true — and a flag is exactly what these
 * tests rule out: it would pull the caret back on every render, out of
 * whatever the user had gone on to do.
 */
describe("when something asks to be put in the tree", () => {
  it("does nothing on its own", () => {
    // Zero is "nobody has asked". A pane that grabbed focus on mount would
    // take it from the page every time the Library opened.
    paneWith();
    expect(document.body.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(document.body);
  });

  it("focuses the tree's tab stop when asked", () => {
    paneWith(NODES, [1], { focusToken: 1 });

    expect(document.activeElement).toHaveAttribute("role", "treeitem");
    expect(document.activeElement).toHaveTextContent("Sets");
  });

  it("does not ask again for the same token", () => {
    const { view, tree } = paneWith(NODES, [1], { focusToken: 1 });
    expect(document.activeElement).toHaveAttribute("role", "treeitem");

    // Somewhere else entirely, then an unrelated re-render. The page hands a
    // fresh `onToggleSection` on every render — which is what makes this the
    // real case rather than one React would skip anyway.
    const elsewhere = document.createElement("button");
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    view.rerender(
      <CollectionsPane
        tree={tree}
        rows={collectionRows(tree, [1])}
        selected={null}
        focusToken={1}
        onToggleSection={vi.fn()}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        onCreate={vi.fn(async () => ({ ok: true }))}
        onRename={vi.fn(async () => ({ ok: true }))}
        onMove={vi.fn(async () => ({ ok: true }))}
        onPreviewDelete={vi.fn(async () => SUBTREE)}
        onDelete={vi.fn(async () => ({ ok: true }))}
        onDropTracks={vi.fn(async () => ({ ok: true }))}
      />,
    );

    expect(document.activeElement).toBe(elsewhere);
  });

  it("answers a second ask", () => {
    // Clicking Collections again, having wandered off, must work.
    const { view, tree } = paneWith(NODES, [1], { focusToken: 1 });
    const elsewhere = document.createElement("button");
    document.body.appendChild(elsewhere);
    elsewhere.focus();

    view.rerender(
      <CollectionsPane
        tree={tree}
        rows={collectionRows(tree, [1])}
        selected={null}
        focusToken={2}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        onCreate={vi.fn(async () => ({ ok: true }))}
        onRename={vi.fn(async () => ({ ok: true }))}
        onMove={vi.fn(async () => ({ ok: true }))}
        onPreviewDelete={vi.fn(async () => SUBTREE)}
        onDelete={vi.fn(async () => ({ ok: true }))}
        onDropTracks={vi.fn(async () => ({ ok: true }))}
      />,
    );

    expect(document.activeElement).toHaveAttribute("role", "treeitem");
  });

  it("opens the section first when it was folded away", () => {
    // A collapsed section has nothing to focus, and silently focusing nothing
    // would be a nav entry that appears to do nothing at all.
    const onToggleSection = vi.fn();
    paneWith(NODES, [1], { collapsed: true, focusToken: 1, onToggleSection });

    expect(onToggleSection).toHaveBeenCalledWith(false);
  });

  it("focuses once the section it opened is open", () => {
    const { view, tree } = paneWith(NODES, [1], { collapsed: true, focusToken: 1 });
    expect(document.activeElement).toBe(document.body);

    view.rerender(
      <CollectionsPane
        tree={tree}
        rows={collectionRows(tree, [1])}
        selected={null}
        collapsed={false}
        focusToken={1}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        onCreate={vi.fn(async () => ({ ok: true }))}
        onRename={vi.fn(async () => ({ ok: true }))}
        onMove={vi.fn(async () => ({ ok: true }))}
        onPreviewDelete={vi.fn(async () => SUBTREE)}
        onDelete={vi.fn(async () => ({ ok: true }))}
        onDropTracks={vi.fn(async () => ({ ok: true }))}
      />,
    );

    expect(document.activeElement).toHaveAttribute("role", "treeitem");
  });

  it("lands on the invitation when there are no Collections", () => {
    // An empty tree has no row to focus, and the one useful thing in the
    // section is the button that makes the first one.
    paneWith([], [], { focusToken: 1 });

    expect(document.activeElement).toHaveTextContent("Create your first Collection");
  });
});

/**
 * Duplicating and freezing a Smart Collection (ORG-13, DEC-061).
 *
 * ORG-08 built both routes and carried them through all six contract files;
 * ORG-12 built the bar that saves the rules. Nothing offered either gesture,
 * so the phase-level acceptance sentence — "duplicates independently, and
 * freezes into a static Collection" — had no way in. These are that way in.
 *
 * The two are deliberately unalike. A duplicate is cheap and reversible: it
 * makes a second saved question, and deleting it costs nothing. A freeze is
 * neither — it stores an answer that will silently stop being true — so it
 * says what it is about to do first.
 */
describe("a Smart Collection's own gestures", () => {
  it("offers duplicate and freeze on a Smart Collection", () => {
    paneWith();
    expect(
      screen.getByRole("button", { name: "Duplicate Recent techno" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Freeze Recent techno" }),
    ).toBeInTheDocument();
  });

  it("offers neither on a folder or a plain Collection", () => {
    // The engine refuses both for anything that is not a saved question, so
    // offering them would be drawing a control that can only fail — the same
    // rule the drop targets follow.
    paneWith();
    for (const name of ["Sets", "Warmups", "Peak"]) {
      expect(screen.queryByRole("button", { name: `Duplicate ${name}` })).toBeNull();
      expect(screen.queryByRole("button", { name: `Freeze ${name}` })).toBeNull();
    }
  });

  it("duplicates on one click, because a copy costs nothing", async () => {
    const onDuplicateSmart = vi.fn(async () => ({ ok: true }));
    paneWith(NODES, [1], { onDuplicateSmart });

    await userEvent.click(screen.getByRole("button", { name: "Duplicate Recent techno" }));

    expect(onDuplicateSmart).toHaveBeenCalledWith(5);
  });

  it("says the copy is separate from now on", async () => {
    // The one thing a user could reasonably get wrong: that the two stay in
    // step. They do not, and that is the reason to duplicate.
    const onNotify = vi.fn();
    paneWith(NODES, [1], { onDuplicateSmart: vi.fn(async () => ({ ok: true })), onNotify });

    await userEvent.click(screen.getByRole("button", { name: "Duplicate Recent techno" }));

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(
        expect.stringMatching(/separate from now on/),
        "info",
      ),
    );
  });

  it("says what the engine said when a duplicate is refused", async () => {
    const onNotify = vi.fn();
    paneWith(NODES, [1], {
      onDuplicateSmart: vi.fn(async () => ({ ok: false, error: "That name is taken" })),
      onNotify,
    });

    await userEvent.click(screen.getByRole("button", { name: "Duplicate Recent techno" }));

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith("That name is taken", "warning"),
    );
  });

  it("does not freeze on the click that asks for it", async () => {
    const onFreezeSmart = vi.fn(async () => ({ ok: true, frozen: 12 }));
    paneWith(NODES, [1], { onFreezeSmart });

    await userEvent.click(screen.getByRole("button", { name: "Freeze Recent techno" }));

    expect(onFreezeSmart).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent(/Freeze Recent techno\?/);
  });

  it("says the copy stops changing, which is the whole point", async () => {
    paneWith(NODES, [1], { onFreezeSmart: vi.fn(async () => ({ ok: true })) });

    await userEvent.click(screen.getByRole("button", { name: "Freeze Recent techno" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(/matches right now/);
    expect(dialog).toHaveTextContent(/starts matching tomorrow/);
    // And that the Smart Collection itself survives, which is the fear that
    // would otherwise stop someone using it.
    expect(dialog).toHaveTextContent(/left exactly as it is/);
  });

  it("freezes once confirmed", async () => {
    const onFreezeSmart = vi.fn(async () => ({ ok: true, frozen: 412 }));
    paneWith(NODES, [1], { onFreezeSmart });

    await userEvent.click(screen.getByRole("button", { name: "Freeze Recent techno" }));
    await userEvent.click(screen.getByRole("button", { name: "Freeze it" }));

    await waitFor(() => expect(onFreezeSmart).toHaveBeenCalledWith(5));
  });

  it("reports the engine's count rather than the tree's", async () => {
    // The row it makes shows a number too, and the two are computed by
    // different code; this one is what actually got written.
    const onNotify = vi.fn();
    paneWith(NODES, [1], {
      onFreezeSmart: vi.fn(async () => ({ ok: true, frozen: 412 })),
      onNotify,
    });

    await userEvent.click(screen.getByRole("button", { name: "Freeze Recent techno" }));
    await userEvent.click(screen.getByRole("button", { name: "Freeze it" }));

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith(
        expect.stringMatching(/Froze 412 tracks from Recent techno/),
        "info",
      ),
    );
  });

  it("does nothing when the answer is no", async () => {
    const onFreezeSmart = vi.fn(async () => ({ ok: true }));
    paneWith(NODES, [1], { onFreezeSmart });

    await userEvent.click(screen.getByRole("button", { name: "Freeze Recent techno" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onFreezeSmart).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says what the engine said when a freeze is refused", async () => {
    // The case the engine names: a Smart Collection whose tag was deleted
    // cannot be frozen, because "no tracks" is not its answer.
    const onNotify = vi.fn();
    paneWith(NODES, [1], {
      onFreezeSmart: vi.fn(async () => ({
        ok: false,
        error: "Its rules cannot be run",
      })),
      onNotify,
    });

    await userEvent.click(screen.getByRole("button", { name: "Freeze Recent techno" }));
    await userEvent.click(screen.getByRole("button", { name: "Freeze it" }));

    await waitFor(() =>
      expect(onNotify).toHaveBeenCalledWith("Its rules cannot be run", "warning"),
    );
  });

  it("offers nothing at all to a build without the routes", () => {
    // Every method added after the bridge existed is optional: the renderer
    // runs in a browser tab, and an older shell exposes none of these.
    paneWith(NODES, [1], { onDuplicateSmart: undefined, onFreezeSmart: undefined });

    expect(screen.queryByRole("button", { name: "Duplicate Recent techno" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Freeze Recent techno" })).toBeNull();
  });
});

describe("a row's context menu (EXPORT-07, DEC-087)", () => {
  const menu = () => screen.getByRole("menu");
  const entries = () => within(menu()).getAllByRole("menuitem").map((item) => item.textContent);

  it("offers export on a Collection, with the row's own actions", () => {
    const onExport = vi.fn();
    paneWith(NODES, [1], { onExport });
    fireEvent.contextMenu(rowFor("Warmups"));

    expect(entries()).toEqual(["Rename", "Delete…", "Export to Rekordbox…"]);
  });

  it("opens the export with that node, and closes", async () => {
    const onExport = vi.fn();
    paneWith(NODES, [1], { onExport });
    fireEvent.contextMenu(rowFor("Warmups"));

    await userEvent.setup().click(within(menu()).getByRole("menuitem", { name: "Export to Rekordbox…" }));

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport.mock.calls[0]![0]).toMatchObject({ id: 2, name: "Warmups" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("offers it on a Smart Collection beside its own gestures", () => {
    const onExport = vi.fn();
    paneWith(NODES, [1], { onExport });
    fireEvent.contextMenu(rowFor("Recent techno"));

    expect(entries()).toEqual([
      "Duplicate",
      "Freeze to a Collection…",
      "Rename",
      "Delete…",
      "Export to Rekordbox…",
    ]);
  });

  it("offers it on a folder, which stands for everything filed under it", async () => {
    const onExport = vi.fn();
    paneWith(NODES, [1], { onExport });
    fireEvent.contextMenu(rowFor("Sets"));

    await userEvent.setup().click(within(menu()).getByRole("menuitem", { name: "Export to Rekordbox…" }));
    expect(onExport.mock.calls[0]![0]).toMatchObject({ id: 1, kind: "folder" });
  });

  it("offers no export when the page cannot export", () => {
    paneWith(NODES, [1]);
    fireEvent.contextMenu(rowFor("Warmups"));
    expect(entries()).not.toContain("Export to Rekordbox…");
  });

  it("opens from the keyboard, with the menu key and with Shift+F10", () => {
    const onExport = vi.fn();
    paneWith(NODES, [1], { onExport });

    fireEvent.keyDown(rowFor("Warmups"), { key: "ContextMenu" });
    expect(entries()).toContain("Export to Rekordbox…");
    fireEvent.keyDown(menu(), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.keyDown(rowFor("Warmups"), { key: "F10", shiftKey: true });
    expect(entries()).toContain("Export to Rekordbox…");
  });

  it("leaves F10 alone without Shift", () => {
    paneWith(NODES, [1], { onExport: vi.fn() });
    fireEvent.keyDown(rowFor("Warmups"), { key: "F10" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("does the row's own actions from the menu too", async () => {
    const user = userEvent.setup();
    const { onPreviewDelete, onFreezeSmart } = paneWith(NODES, [1], { onExport: vi.fn() });

    fireEvent.contextMenu(rowFor("Warmups"));
    await user.click(within(menu()).getByRole("menuitem", { name: "Delete…" }));
    expect(onPreviewDelete).toHaveBeenCalledWith(2);
    expect(await screen.findByRole("dialog", { name: /Delete Warmups/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep it" }));

    fireEvent.contextMenu(rowFor("Recent techno"));
    await user.click(within(menu()).getByRole("menuitem", { name: "Freeze to a Collection…" }));
    await user.click(await screen.findByRole("button", { name: "Freeze it" }));
    expect(onFreezeSmart).toHaveBeenCalledWith(5);

    fireEvent.contextMenu(rowFor("Warmups"));
    await user.click(within(menu()).getByRole("menuitem", { name: "Rename" }));
    expect(screen.getByDisplayValue("Warmups")).toBeInTheDocument();
  });

  it("changes nothing about what is selected", () => {
    const { onSelect } = paneWith(NODES, [1], { onExport: vi.fn() });
    fireEvent.contextMenu(rowFor("Warmups"));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
