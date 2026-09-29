/**
 * Sets in the CuePoint tree (PREP-09, DEC-102, DEC-104), over the tree a real
 * engine sent (`librarySets.fixture.json`).
 *
 * - **Drawn as a Set**: Prepare's flag and its entry count, repeats counted.
 * - **Made as a node is**: "New Set" beside "New Collection", in the selected
 *   folder, straight into its name — offered only where a Set can be made.
 * - **Its own menu**: "Open in Prepare" (once there is a Prepare), "Duplicate",
 *   the set list and the export; "New Set from…" on a Collection and a Smart
 *   Collection, and on a Rekordbox playlist beside it.
 * - **It holds tracks**, so a drop lands on it.
 * - **The hook** makes, copies and duplicates Sets through the Sets bridge,
 *   answering a refusal as a message and re-reading a tree a Set left.
 */
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CollectionsPane } from "./CollectionsPane";
import { TRACK_IDS_MIME } from "./collectionDrag";
import { buildCollectionTree, collectionRows } from "./collectionTree";
import {
  CREATED,
  CREATED_FROM_PLAYLIST,
  DUPLICATED,
  FRIDAY,
  GIGS,
  IDS,
  SET_GONE,
  SMART,
  TREE,
  WARMUP,
  answered,
  refused,
} from "./librarySets.testFixture";
import { PlaylistPane } from "./PlaylistPane";
import { NewSetFromDialog } from "./NewSetFromDialog";
import { NO_SETS_BRIDGE, useCollectionTree } from "./useCollectionTree";

function paneWith(overrides: Partial<React.ComponentProps<typeof CollectionsPane>> = {}) {
  const tree = buildCollectionTree(TREE);
  const handlers = {
    onSelect: vi.fn(),
    onExpand: vi.fn(),
    onCreate: vi.fn(async () => ({ ok: true, node: FRIDAY })),
    onRename: vi.fn(async () => ({ ok: true })),
    onMove: vi.fn(async () => ({ ok: true })),
    onPreviewDelete: vi.fn(async () => null),
    onDelete: vi.fn(async () => ({ ok: true })),
    onDuplicateSmart: vi.fn(async () => ({ ok: true })),
    onFreezeSmart: vi.fn(async () => ({ ok: true, frozen: 2 })),
    onDropTracks: vi.fn(async () => ({ ok: true, added: 1, skipped: 1 })),
    onNotify: vi.fn(),
    onExport: vi.fn(),
    onDuplicateSet: vi.fn(async () => ({ ok: true })),
    onSaveSetList: vi.fn(),
    onCopySetList: vi.fn(),
    onNewSetFrom: vi.fn(),
    canMakeSets: true,
  };
  const props = { ...handlers, ...overrides };
  render(
    <CollectionsPane
      tree={tree}
      rows={collectionRows(tree, [GIGS.id])}
      selected={null}
      {...props}
    />,
  );
  return props;
}

function rowFor(name: string, kind?: string): HTMLElement {
  return screen
    .getAllByRole("treeitem")
    .find(
      (item) =>
        within(item).queryByText(name) !== null &&
        (!kind || item.getAttribute("data-kind") === kind),
    )!;
}

const menu = () => screen.getByRole("menu");
const entries = () => within(menu()).getAllByRole("menuitem").map((item) => item.textContent);

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

describe("a Set in the tree", () => {
  it("is drawn as a Set, with its entries counted, repeats included", () => {
    paneWith();
    const friday = rowFor("Friday", "set");
    expect(friday).toHaveAttribute("data-kind", "set");
    // Six entries, five tracks: the count is what it plays.
    expect(within(friday).getByText("6")).toBeInTheDocument();
    expect(friday.querySelector("[data-icon='prepare']")).not.toBeNull();
    expect(rowFor("Warm-up", "collection").querySelector("[data-icon='collections']")).not.toBeNull();
  });

  it("is filed in its folder", () => {
    paneWith();
    // Levels count from the "All tracks" row above both sections.
    expect(rowFor("Friday", "set")).toHaveAttribute("aria-level", "3");
    expect(rowFor("Empty", "set")).toHaveAttribute("aria-level", "2");
  });

  it("takes dropped tracks, as a Collection does", async () => {
    const { onDropTracks, onNotify } = paneWith();
    const drag = {
      dataTransfer: {
        types: [TRACK_IDS_MIME],
        getData: (format: string) => (format === TRACK_IDS_MIME ? JSON.stringify([4, 5]) : ""),
        setData: vi.fn(),
        dropEffect: "",
        effectAllowed: "",
      },
    };
    fireEvent.dragOver(rowFor("Friday", "set"), drag);
    fireEvent.drop(rowFor("Friday", "set"), drag);
    await waitFor(() => expect(onDropTracks).toHaveBeenCalledWith(FRIDAY.id, { ids: [4, 5] }));
    expect(onNotify).toHaveBeenCalledWith("Added 1 track to Friday — 1 already there.", "info");
  });
});

describe("making a Set", () => {
  it("sits beside New Collection and goes straight into its name", async () => {
    const { onCreate } = paneWith();
    await userEvent.click(screen.getByRole("button", { name: "New Set" }));
    expect(onCreate).toHaveBeenCalledWith("set", "New Set", null);
    expect(await screen.findByRole("textbox")).toHaveValue("Friday");
  });

  it("files it in the selected folder", async () => {
    const tree = buildCollectionTree(TREE);
    const onCreate = vi.fn(async () => ({ ok: true, node: FRIDAY }));
    render(
      <CollectionsPane
        tree={tree}
        rows={collectionRows(tree, [GIGS.id])}
        selected={tree.find((node) => node.id === GIGS.id)!}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        onCreate={onCreate}
        onRename={vi.fn()}
        onMove={vi.fn()}
        onPreviewDelete={vi.fn()}
        onDelete={vi.fn()}
        onDropTracks={vi.fn()}
        canMakeSets
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "New Set" }));
    expect(onCreate).toHaveBeenCalledWith("set", "New Set", GIGS.id);
  });

  it("is not offered by a shell that cannot make one", () => {
    paneWith({ canMakeSets: false });
    expect(screen.queryByRole("button", { name: "New Set" })).toBeNull();
    expect(screen.getByRole("button", { name: "New Collection" })).toBeInTheDocument();
  });

  it("is offered beside the first Collection in an empty tree", async () => {
    const onCreate = vi.fn(async () => ({ ok: true }));
    render(
      <CollectionsPane
        tree={[]}
        rows={[]}
        selected={null}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        onCreate={onCreate}
        onRename={vi.fn()}
        onMove={vi.fn()}
        onPreviewDelete={vi.fn()}
        onDelete={vi.fn()}
        onDropTracks={vi.fn()}
        canMakeSets
      />,
    );
    expect(screen.getByText(/A Set is a running order you are preparing to play/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create your first Set" }));
    expect(onCreate).toHaveBeenCalledWith("set", "New Set", null);
  });
});

describe("a Set's menu", () => {
  it("is a Set's: duplicate, the set list and the export, with no crate's entries", () => {
    paneWith();
    fireEvent.contextMenu(rowFor("Friday", "set"));
    expect(entries()).toEqual([
      "Duplicate",
      "Rename",
      "Delete…",
      "Save set list…",
      "Copy set list",
      "Export to Rekordbox…",
    ]);
  });

  it("opens the Set in Prepare first, once there is a Prepare to open", async () => {
    const onOpenInPrepare = vi.fn();
    paneWith({ onOpenInPrepare });
    fireEvent.contextMenu(rowFor("Friday", "set"));
    expect(entries()[0]).toBe("Open in Prepare");
    await userEvent.click(within(menu()).getByRole("menuitem", { name: "Open in Prepare" }));
    expect(onOpenInPrepare).toHaveBeenCalledWith(expect.objectContaining({ id: FRIDAY.id }));
  });

  it("duplicates it through the Set's own copy, and says the two are separate", async () => {
    const { onDuplicateSet, onDuplicateSmart, onNotify } = paneWith();
    fireEvent.contextMenu(rowFor("Friday", "set"));
    await userEvent.click(within(menu()).getByRole("menuitem", { name: "Duplicate" }));
    expect(onDuplicateSet).toHaveBeenCalledWith(FRIDAY.id);
    expect(onDuplicateSmart).not.toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith(
      "Copied Friday. The two are separate from now on.",
      "info",
    );
  });

  it("saves and copies its set list", async () => {
    const { onSaveSetList, onCopySetList } = paneWith();
    fireEvent.contextMenu(rowFor("Friday", "set"));
    await userEvent.click(within(menu()).getByRole("menuitem", { name: "Save set list…" }));
    expect(onSaveSetList).toHaveBeenCalledWith(expect.objectContaining({ id: FRIDAY.id }));
    fireEvent.contextMenu(rowFor("Friday", "set"));
    await userEvent.click(within(menu()).getByRole("menuitem", { name: "Copy set list" }));
    expect(onCopySetList).toHaveBeenCalledWith(expect.objectContaining({ id: FRIDAY.id }));
  });

  it("exports it with it ticked", async () => {
    const { onExport } = paneWith();
    fireEvent.contextMenu(rowFor("Friday", "set"));
    await userEvent.click(within(menu()).getByRole("menuitem", { name: "Export to Rekordbox…" }));
    expect(onExport).toHaveBeenCalledWith(expect.objectContaining({ id: FRIDAY.id }));
  });

  it("offers only what a page passed", () => {
    paneWith({
      onDuplicateSet: undefined,
      onSaveSetList: undefined,
      onCopySetList: undefined,
      onExport: undefined,
    });
    fireEvent.contextMenu(rowFor("Friday", "set"));
    expect(entries()).toEqual(["Rename", "Delete…"]);
  });
});

describe("New Set from… in the tree", () => {
  it("is on a Collection and a Smart Collection, and not on a folder or a Set", async () => {
    const { onNewSetFrom } = paneWith();
    fireEvent.contextMenu(rowFor("Warm-up", "collection"));
    expect(entries()).toContain("New Set from…");
    await userEvent.click(within(menu()).getByRole("menuitem", { name: "New Set from…" }));
    expect(onNewSetFrom).toHaveBeenCalledWith(expect.objectContaining({ id: WARMUP.id }));

    fireEvent.contextMenu(rowFor("Ada", "smart"));
    expect(entries()).toEqual([
      "Duplicate",
      "Freeze to a Collection…",
      "New Set from…",
      "Rename",
      "Delete…",
      "Export to Rekordbox…",
    ]);
    await userEvent.click(within(menu()).getByRole("menuitem", { name: "New Set from…" }));
    expect(onNewSetFrom).toHaveBeenLastCalledWith(expect.objectContaining({ id: SMART.id }));

    fireEvent.contextMenu(rowFor("Gigs", "folder"));
    expect(entries()).not.toContain("New Set from…");
    await userEvent.keyboard("{Escape}");
    fireEvent.contextMenu(rowFor("Friday", "set"));
    expect(entries()).not.toContain("New Set from…");
  });

  it("is on a Rekordbox playlist and not on its folder, when the page offers it", async () => {
    const onNewSetFrom = vi.fn();
    const folder = {
      id: 1,
      parent_id: null,
      name: "SETS",
      kind: "folder" as const,
      depth: 0,
      position: 0,
      path: "SETS",
      track_count: 0,
      children: [],
    };
    const sunday = { ...folder, id: 2, parent_id: 1, name: "Sunday", kind: "playlist" as const, depth: 1, path: "SETS/Sunday", track_count: 3 };
    render(
      <PlaylistPane
        rows={[
          { node: { ...folder, children: [sunday] }, depth: 0, expanded: true, hasChildren: true },
          { node: sunday, depth: 1, expanded: false, hasChildren: false },
        ]}
        selected={null}
        libraryTrackCount={5}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        onNewSetFrom={onNewSetFrom}
      />,
    );
    fireEvent.contextMenu(rowFor("SETS"));
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.contextMenu(rowFor("Sunday"));
    expect(entries()).toEqual(["New Set from…"]);
    await userEvent.click(within(menu()).getByRole("menuitem", { name: "New Set from…" }));
    expect(onNewSetFrom).toHaveBeenCalledWith(expect.objectContaining({ id: 2, path: "SETS/Sunday" }));
  });

  it("leaves a playlist without a menu when the page does not offer it (DEC-031)", () => {
    const sunday = {
      id: 2,
      parent_id: null,
      name: "Sunday",
      kind: "playlist" as const,
      depth: 0,
      position: 0,
      path: "Sunday",
      track_count: 3,
      children: [],
    };
    render(
      <PlaylistPane
        rows={[{ node: sunday, depth: 0, expanded: false, hasChildren: false }]}
        selected={null}
        libraryTrackCount={5}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
      />,
    );
    fireEvent.contextMenu(rowFor("Sunday"));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("the New Set from… dialog", () => {
  const folders = [{ id: GIGS.id, name: "Gigs", depth: 0 }];

  it("says what a copy means, names it after its source and files it beside it", async () => {
    const onCreate = vi.fn();
    render(
      <NewSetFromDialog
        source={{ kind: "collection", id: WARMUP.id, name: "Warm-up", parentId: GIGS.id }}
        folders={folders}
        onCreate={onCreate}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "New Set from “Warm-up”" });
    expect(within(dialog).getByText(/It is a copy: “Warm-up” stays as it is/)).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Name" })).toHaveValue("Warm-up");
    expect(within(dialog).getByRole("combobox", { name: "In" })).toHaveValue(String(GIGS.id));
    await userEvent.click(within(dialog).getByRole("button", { name: "Make the Set" }));
    expect(onCreate).toHaveBeenCalledWith("Warm-up", GIGS.id);
  });

  it("takes a new name and the top level, and makes it on Enter", async () => {
    const onCreate = vi.fn();
    render(
      <NewSetFromDialog
        source={{ kind: "playlist", id: 2, name: "Sunday", parentId: null }}
        folders={folders}
        onCreate={onCreate}
        onClose={vi.fn()}
      />,
    );
    const name = screen.getByRole("textbox", { name: "Name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Sunday session{Enter}");
    expect(onCreate).toHaveBeenCalledWith("Sunday session", null);
  });

  it("refuses a blank name before asking the engine", async () => {
    const onCreate = vi.fn();
    render(
      <NewSetFromDialog
        source={{ kind: "smart", id: SMART.id, name: "Ada", parentId: null }}
        folders={folders}
        onCreate={onCreate}
        onClose={vi.fn()}
      />,
    );
    await userEvent.clear(screen.getByRole("textbox", { name: "Name" }));
    await userEvent.click(screen.getByRole("button", { name: "Make the Set" }));
    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Give it a name");
  });

  it("shows the engine's refusal, and is closed with no source", () => {
    const { rerender } = render(
      <NewSetFromDialog
        source={{ kind: "collection", id: WARMUP.id, name: "Warm-up", parentId: null }}
        folders={folders}
        error="'Warm-up' holds 990 entries, and adding 20 would make 1,010: a Set holds at most 1,000"
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/a Set holds at most 1,000/);
    rerender(
      <NewSetFromDialog source={null} folders={folders} onCreate={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("the hook's Set writes", () => {
  let sets: {
    create: ReturnType<typeof vi.fn>;
    createFrom: ReturnType<typeof vi.fn>;
    duplicate: ReturnType<typeof vi.fn>;
  };
  let getCollections: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    getCollections = vi.fn(async () => ({ collections: TREE, total: TREE.length }));
    sets = {
      create: vi.fn(async () => answered(CREATED)),
      createFrom: vi.fn(async () => answered(CREATED_FROM_PLAYLIST)),
      duplicate: vi.fn(async () => answered(DUPLICATED)),
    };
    (window as unknown as { cuepoint?: unknown }).cuepoint = {
      getCollections,
      createCollection: vi.fn(),
      sets,
    };
  });

  async function ready() {
    const view = renderHook(() => useCollectionTree());
    await waitFor(() => expect(view.result.current.status).toBe("ready"));
    return view.result;
  }

  it("makes a Set through the Sets route, and re-reads the tree", async () => {
    const result = await ready();
    let made: Awaited<ReturnType<typeof result.current.create>> | undefined;
    await act(async () => {
      made = await result.current.create("set", "Friday", GIGS.id);
    });
    expect(sets.create).toHaveBeenCalledWith({ name: "Friday", parent_id: GIGS.id });
    expect(made).toEqual({ ok: true, node: CREATED.set });
    await waitFor(() => expect(getCollections).toHaveBeenCalledTimes(2));
  });

  it("copies a source into a new Set and carries back how many entries it got", async () => {
    const result = await ready();
    let made: Awaited<ReturnType<typeof result.current.createSetFrom>> | undefined;
    await act(async () => {
      made = await result.current.createSetFrom({ kind: "playlist", id: 2 }, null, null);
    });
    expect(sets.createFrom).toHaveBeenCalledWith({
      source: { kind: "playlist", id: 2 },
      name: null,
      parent_id: null,
    });
    expect(made).toEqual({ ok: true, node: CREATED_FROM_PLAYLIST.set, trackCount: 3 });
  });

  it("duplicates a Set", async () => {
    const result = await ready();
    let made: Awaited<ReturnType<typeof result.current.duplicateSet>> | undefined;
    await act(async () => {
      made = await result.current.duplicateSet(IDS.friday);
    });
    expect(sets.duplicate).toHaveBeenCalledWith({ set_id: IDS.friday, name: null });
    expect(made).toEqual({ ok: true, node: DUPLICATED.set });
  });

  it("answers a refusal as the engine's sentence, and re-reads a tree a Set has left", async () => {
    sets.duplicate.mockResolvedValue(refused(SET_GONE));
    const result = await ready();
    let made: Awaited<ReturnType<typeof result.current.duplicateSet>> | undefined;
    await act(async () => {
      made = await result.current.duplicateSet(999_999);
    });
    expect(made).toEqual({ ok: false, error: "There is no Set 999999" });
    await waitFor(() => expect(getCollections).toHaveBeenCalledTimes(2));
  });

  it("does not re-read the tree for a refusal that changed nothing", async () => {
    sets.createFrom.mockResolvedValue(
      refused({ code: "INVALID_REQUEST", message: "'Gigs' is a folder", reason: null, path: null }),
    );
    const result = await ready();
    let made: Awaited<ReturnType<typeof result.current.createSetFrom>> | undefined;
    await act(async () => {
      made = await result.current.createSetFrom({ kind: "collection", id: GIGS.id }, null, null);
    });
    expect(made).toEqual({ ok: false, error: "'Gigs' is a folder" });
    expect(getCollections).toHaveBeenCalledTimes(1);
  });

  it("turns a thrown failure into a message", async () => {
    sets.create.mockRejectedValue(new Error("The engine is not running"));
    const result = await ready();
    let made: Awaited<ReturnType<typeof result.current.create>> | undefined;
    await act(async () => {
      made = await result.current.create("set", "Friday", null);
    });
    expect(made).toEqual({ ok: false, error: "The engine is not running" });
  });

  it("says a shell without the Sets bridge cannot make Sets", async () => {
    (window as unknown as { cuepoint?: Record<string, unknown> }).cuepoint = { getCollections };
    const result = await ready();
    for (const run of [
      () => result.current.create("set", "Friday", null),
      () => result.current.createSetFrom({ kind: "playlist", id: 2 }, null, null),
      () => result.current.duplicateSet(IDS.friday),
    ]) {
      let made: { ok: boolean; error?: string } | undefined;
      await act(async () => {
        made = await run();
      });
      expect(made).toEqual({ ok: false, error: NO_SETS_BRIDGE });
    }
  });
});
