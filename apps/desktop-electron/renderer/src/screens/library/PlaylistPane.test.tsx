/**
 * The playlist pane, and the hook behind it (LIBUI-07, DEC-044).
 *
 * What these protect:
 *
 * **It is read-only** (DEC-031). No rename, no delete, no drag, no new
 * playlist — and it says where the playlists came from, so nobody wonders why.
 * **A keyboard reaches everything.** One tab stop, arrows to move and open,
 * Enter to select: the tree pattern, because a pane a keyboard cannot open is
 * a pane half the collection is behind.
 * **A remembered playlist that is gone falls back and says so**, rather than
 * showing an empty table and leaving the user to wonder what they broke.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import type { LibraryPlaylistNode } from "../../api/cuepointBridge.types";
import { PlaylistPane } from "./PlaylistPane";
import {
  PLAYLIST_PANE_STORAGE_KEY,
  buildTree,
  visibleRows,
  type PlaylistTreeNode,
} from "./playlistTree";
import { usePlaylistTree } from "./usePlaylistTree";

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

const NODES: LibraryPlaylistNode[] = [
  node(1, "SETS", "folder", 0, "SETS", null),
  node(2, "warmup", "playlist", 1, "SETS/warmup", 1, 12),
  node(3, "peak", "folder", 1, "SETS/peak", 1),
  node(4, "COZMO_11/02", "playlist", 2, "SETS/peak/COZMO_11/02", 3, 9),
  node(5, "ONE-OFFS", "playlist", 0, "ONE-OFFS", null, 3),
];

let getLibraryPlaylists: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  getLibraryPlaylists = vi.fn(async () => ({
    playlists: NODES,
    total: NODES.length,
  }));
  (window as unknown as { cuepoint?: unknown }).cuepoint = { getLibraryPlaylists };
});

afterEach(() => {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
  vi.restoreAllMocks();
});

function paneWith(expanded: string[] = ["SETS"], selected: PlaylistTreeNode | null = null) {
  const tree = buildTree(NODES);
  const handlers = { onSelect: vi.fn(), onExpand: vi.fn() };
  render(
    <PlaylistPane
      rows={visibleRows(tree, expanded)}
      selected={selected}
      libraryTrackCount={3880}
      onSelect={handlers.onSelect}
      onExpand={handlers.onExpand}
    />,
  );
  return { tree, ...handlers };
}

function rowFor(name: string): HTMLElement {
  return screen
    .getAllByRole("treeitem")
    .find((item) => within(item).queryByText(name) !== null)!;
}

describe("what the pane shows", () => {
  it("puts the whole library at the top, with its count", () => {
    paneWith();
    const all = rowFor("All tracks");
    expect(all).toBeInTheDocument();
    expect(within(all).getByText("3,880")).toBeInTheDocument();
  });

  it("nests the tree to depth", () => {
    paneWith(["SETS", "SETS/peak"]);
    expect(rowFor("SETS")).toHaveAttribute("aria-level", "2");
    expect(rowFor("warmup")).toHaveAttribute("aria-level", "3");
    expect(rowFor("COZMO_11/02")).toHaveAttribute("aria-level", "4");
  });

  it("shows a name containing a separator as a name", () => {
    paneWith(["SETS", "SETS/peak"]);
    expect(within(rowFor("COZMO_11/02")).getByText("COZMO_11/02")).toBeInTheDocument();
  });

  it("shows the engine's count for a playlist", () => {
    paneWith(["SETS"]);
    expect(within(rowFor("warmup")).getByText("12")).toBeInTheDocument();
  });

  it("shows no count for a folder", () => {
    // A folder's own count is zero; the number that means something is the
    // union of its playlists, which the table reports once it is selected.
    paneWith(["SETS"]);
    expect(within(rowFor("SETS")).queryByText("0")).not.toBeInTheDocument();
  });

  it("says where the playlists came from", () => {
    paneWith();
    expect(screen.getByText("from Rekordbox")).toBeInTheDocument();
  });

  it("says so when the export had no playlists", () => {
    render(
      <PlaylistPane
        rows={[]}
        selected={null}
        libraryTrackCount={0}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
      />,
    );
    expect(screen.getByText(/no playlists/i)).toBeInTheDocument();
  });
});

describe("it is read-only (DEC-031)", () => {
  it("offers no rename, delete, or new playlist", () => {
    paneWith(["SETS", "SETS/peak"]);
    const buttons = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    for (const label of buttons) {
      expect(label ?? "").not.toMatch(/rename|delete|remove|new|add/i);
    }
  });

  it("makes no row draggable", () => {
    paneWith(["SETS"]);
    for (const row of screen.getAllByRole("treeitem")) {
      expect(row).not.toHaveAttribute("draggable", "true");
    }
  });

  it("has no text input to type a name into", () => {
    paneWith(["SETS"]);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("selecting", () => {
  it("reports the node that was clicked", () => {
    const { onSelect } = paneWith(["SETS"]);

    fireEvent.click(rowFor("warmup"));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });

  it("reports the whole library for All tracks", () => {
    const { onSelect } = paneWith(["SETS"]);

    fireEvent.click(rowFor("All tracks"));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("marks what is selected", () => {
    const tree = buildTree(NODES);
    const warmup = tree[0]!.children[0]!;
    render(
      <PlaylistPane
        rows={visibleRows(tree, ["SETS"])}
        selected={warmup}
        libraryTrackCount={10}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
      />,
    );
    expect(rowFor("warmup")).toHaveAttribute("aria-selected", "true");
    expect(rowFor("All tracks")).toHaveAttribute("aria-selected", "false");
  });

  it("says when a remembered playlist has gone", () => {
    render(
      <PlaylistPane
        rows={[]}
        selected={null}
        libraryTrackCount={10}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        selectionFellBack
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/no longer in your collection/i);
  });

  it("says when the playlists could not be read", () => {
    render(
      <PlaylistPane
        rows={[]}
        selected={null}
        libraryTrackCount={0}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
        status="error"
        error="Engine offline"
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Engine offline");
  });
});

describe("expanding", () => {
  it("opens a folder from its twisty", () => {
    const { onExpand } = paneWith([]);

    fireEvent.click(screen.getByRole("button", { name: "Expand SETS" }));

    expect(onExpand).toHaveBeenCalledWith("SETS", true);
  });

  it("closes an open one", () => {
    const { onExpand } = paneWith(["SETS"]);

    fireEvent.click(screen.getByRole("button", { name: "Collapse SETS" }));

    expect(onExpand).toHaveBeenCalledWith("SETS", false);
  });

  it("does not select the folder when the twisty is clicked", () => {
    const { onSelect } = paneWith([]);

    fireEvent.click(screen.getByRole("button", { name: "Expand SETS" }));

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("says whether a folder is open, for a screen reader", () => {
    paneWith(["SETS"]);
    expect(rowFor("SETS")).toHaveAttribute("aria-expanded", "true");
  });

  it("says nothing about expansion for a playlist", () => {
    paneWith(["SETS"]);
    expect(rowFor("warmup")).not.toHaveAttribute("aria-expanded");
  });
});

describe("the keyboard", () => {
  it("is one tab stop, not one per row", () => {
    paneWith(["SETS"]);
    const stops = screen
      .getAllByRole("treeitem")
      .filter((row) => row.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
  });

  it("keeps a way in when the focused row disappears", () => {
    // A folder closing, or a refresh removing a playlist, can take the row
    // holding the tab stop with it — and a tree with no tab stop is a tree a
    // keyboard cannot reach at all.
    const tree = buildTree(NODES);
    const { rerender } = render(
      <PlaylistPane
        rows={visibleRows(tree, ["SETS"])}
        selected={null}
        libraryTrackCount={10}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
      />,
    );
    fireEvent.keyDown(rowFor("All tracks"), { key: "ArrowDown" });
    fireEvent.keyDown(rowFor("SETS"), { key: "ArrowDown" });
    expect(rowFor("warmup")).toHaveFocus();

    rerender(
      <PlaylistPane
        rows={visibleRows(tree, [])}
        selected={null}
        libraryTrackCount={10}
        onSelect={vi.fn()}
        onExpand={vi.fn()}
      />,
    );

    const stops = screen
      .getAllByRole("treeitem")
      .filter((row) => row.getAttribute("tabindex") === "0");
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAttribute("data-tree-key", "__all__");
  });

  it("moves down the visible rows", () => {
    paneWith(["SETS"]);

    fireEvent.keyDown(rowFor("All tracks"), { key: "ArrowDown" });

    expect(rowFor("SETS")).toHaveFocus();
  });

  it("moves back up", () => {
    paneWith(["SETS"]);
    fireEvent.keyDown(rowFor("All tracks"), { key: "ArrowDown" });

    fireEvent.keyDown(rowFor("SETS"), { key: "ArrowUp" });

    expect(rowFor("All tracks")).toHaveFocus();
  });

  it("opens a closed folder with the right arrow", () => {
    const { onExpand } = paneWith([]);

    fireEvent.keyDown(rowFor("SETS"), { key: "ArrowRight" });

    expect(onExpand).toHaveBeenCalledWith("SETS", true);
  });

  it("steps into an open folder with the right arrow", () => {
    const { onExpand } = paneWith(["SETS"]);

    fireEvent.keyDown(rowFor("SETS"), { key: "ArrowRight" });

    expect(onExpand).not.toHaveBeenCalled();
    expect(rowFor("warmup")).toHaveFocus();
  });

  it("closes an open folder with the left arrow", () => {
    const { onExpand } = paneWith(["SETS"]);

    fireEvent.keyDown(rowFor("SETS"), { key: "ArrowLeft" });

    expect(onExpand).toHaveBeenCalledWith("SETS", false);
  });

  it("steps out of a leaf with the left arrow", () => {
    paneWith(["SETS"]);

    fireEvent.keyDown(rowFor("warmup"), { key: "ArrowLeft" });

    expect(rowFor("SETS")).toHaveFocus();
  });

  it("selects with Enter", () => {
    const { onSelect } = paneWith(["SETS"]);

    fireEvent.keyDown(rowFor("warmup"), { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });

  it("selects with Space", () => {
    const { onSelect } = paneWith(["SETS"]);

    fireEvent.keyDown(rowFor("ONE-OFFS"), { key: " " });

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }));
  });

  it("stops at the ends", () => {
    paneWith([]);

    fireEvent.keyDown(rowFor("All tracks"), { key: "ArrowUp" });

    expect(() => rowFor("All tracks")).not.toThrow();
  });
});

describe("the hook behind it", () => {
  it("fetches the tree once", async () => {
    const { result } = renderHook(() => usePlaylistTree());

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(getLibraryPlaylists).toHaveBeenCalledTimes(1);
    expect(result.current.tree).toHaveLength(2);
  });

  it("remembers what was selected", async () => {
    const first = renderHook(() => usePlaylistTree());
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    const warmup = first.result.current.tree[0]!.children[0]!;
    act(() => first.result.current.select(warmup));
    first.unmount();

    const second = renderHook(() => usePlaylistTree());
    await waitFor(() => expect(second.result.current.status).toBe("ready"));

    expect(second.result.current.selected?.name).toBe("warmup");
  });

  it("remembers what was expanded", async () => {
    const first = renderHook(() => usePlaylistTree());
    await waitFor(() => expect(first.result.current.status).toBe("ready"));
    act(() => first.result.current.toggle("SETS"));
    first.unmount();

    const second = renderHook(() => usePlaylistTree());
    await waitFor(() => expect(second.result.current.status).toBe("ready"));

    expect(second.result.current.isExpanded("SETS")).toBe(true);
  });

  it("opens the folders above a selection, so it can be seen", async () => {
    const { result } = renderHook(() => usePlaylistTree());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    const deep = result.current.tree[0]!.children[1]!.children[0]!;

    act(() => result.current.select(deep));

    expect(result.current.isExpanded("SETS")).toBe(true);
    expect(result.current.isExpanded("SETS/peak")).toBe(true);
    expect(result.current.rows.map((row) => row.node.name)).toContain("COZMO_11/02");
  });

  it("falls back when a remembered playlist has gone", async () => {
    localStorage.setItem(
      PLAYLIST_PANE_STORAGE_KEY,
      JSON.stringify({ expandedPaths: ["SETS"], selectedPath: "SETS/deleted" }),
    );

    const { result } = renderHook(() => usePlaylistTree());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.selected).toBeNull();
    expect(result.current.selectionFellBack).toBe(true);
  });

  it("stops saying so once something else is selected", async () => {
    localStorage.setItem(
      PLAYLIST_PANE_STORAGE_KEY,
      JSON.stringify({ expandedPaths: [], selectedPath: "SETS/deleted" }),
    );
    const { result } = renderHook(() => usePlaylistTree());
    await waitFor(() => expect(result.current.selectionFellBack).toBe(true));

    act(() => result.current.select(result.current.tree[1]!));

    expect(result.current.selectionFellBack).toBe(false);
  });

  it("forgets expansion for a folder that has gone", async () => {
    localStorage.setItem(
      PLAYLIST_PANE_STORAGE_KEY,
      JSON.stringify({ expandedPaths: ["SETS", "GONE"], selectedPath: null }),
    );

    const { result } = renderHook(() => usePlaylistTree());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(result.current.isExpanded("SETS")).toBe(true);
    expect(result.current.isExpanded("GONE")).toBe(false);
  });

  it("says when the engine could not be reached", async () => {
    getLibraryPlaylists.mockRejectedValueOnce(new Error("Engine offline"));

    const { result } = renderHook(() => usePlaylistTree());

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toBe("Engine offline");
  });

  it("says when there is no bridge at all", async () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;

    const { result } = renderHook(() => usePlaylistTree());

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });

  it("asks again when told to", async () => {
    const { result } = renderHook(() => usePlaylistTree());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    act(() => result.current.reload());

    await waitFor(() => expect(getLibraryPlaylists).toHaveBeenCalledTimes(2));
  });
});
