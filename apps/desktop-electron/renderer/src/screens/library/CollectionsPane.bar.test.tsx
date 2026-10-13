/**
 * The "+ New" menu and the bar under the tree (FLW-10, PAGES-05C, K14).
 *
 * One "+ New" menu button over the tree makes a Collection, a Set or a Folder.
 * Under it, a bar for the selected node is shown while a node is selected (DEC-245):
 * Rename, Duplicate, Delete and Export to Rekordbox… on every node (folders too,
 * DEC-087), for a Smart Collection also Freeze…, and for a Set also Open in Prepare
 * and Save set list…. With nothing selected there is no bar. Rows carry no icons of
 * their own (K14); the right-click menu keeps working, and "Copy set list" and
 * "New Set from…" stay on it only.
 */
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CollectionNode } from "../../api/cuepointBridge.types";
import { CollectionsPane } from "./CollectionsPane";
import { buildCollectionTree, collectionRows, findCollection } from "./collectionTree";
import { FRIDAY, GIGS, SMART, TREE, WARMUP } from "./librarySets.testFixture";

function paneWith(
  selected: CollectionNode | null,
  overrides: Partial<React.ComponentProps<typeof CollectionsPane>> = {},
) {
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
    onDropTracks: vi.fn(async () => ({ ok: true, added: 1, skipped: 0 })),
    onNotify: vi.fn(),
    onExport: vi.fn(),
    onOpenInPrepare: vi.fn(),
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
      selected={selected ? (findCollection(tree, selected.id) ?? null) : null}
      {...props}
    />,
  );
  return props;
}

const bar = () => screen.getByRole("toolbar", { name: "Selected Collection or Set" });

async function chooseNew(item: "Collection" | "Set" | "Folder") {
  await userEvent.click(screen.getByRole("button", { name: "+ New" }));
  await userEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: item }));
}

describe("the + New menu over the tree", () => {
  it("is one button, '+ New', over the tree", () => {
    paneWith(null);
    const group = screen.getByRole("group", { name: "Make something new" });
    expect(within(group).getAllByRole("button")).toHaveLength(1);
    expect(within(group).getByRole("button", { name: "+ New" })).toHaveAttribute(
      "aria-haspopup",
      "menu",
    );
  });

  it("makes a node in the selected folder, as before", async () => {
    const props = paneWith(GIGS);
    await chooseNew("Folder");
    expect(props.onCreate).toHaveBeenCalledWith("folder", "New folder", GIGS.id);
  });

  it("leaves Set out of the menu where a Set cannot be made", async () => {
    paneWith(null, { canMakeSets: false });
    await userEvent.click(screen.getByRole("button", { name: "+ New" }));
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Collection", "Folder"]);
  });
});

describe("the bar under the tree", () => {
  it("is not drawn while nothing is selected", () => {
    paneWith(null);
    expect(screen.queryByRole("toolbar", { name: "Selected Collection or Set" })).toBeNull();
  });

  it("appears when a node is selected, with Rename, Duplicate, Delete and Export", () => {
    paneWith(WARMUP);
    for (const name of ["Rename", "Duplicate", "Delete", "Export to Rekordbox…"]) {
      expect(within(bar()).getByRole("button", { name })).toBeInTheDocument();
    }
    // A Set's two are not drawn until a Set is selected.
    expect(within(bar()).queryByRole("button", { name: "Open in Prepare" })).toBeNull();
    expect(within(bar()).queryByRole("button", { name: "Save set list…" })).toBeNull();
  });

  it("renames the selected node in its row", async () => {
    paneWith(WARMUP);
    await userEvent.click(within(bar()).getByRole("button", { name: "Rename" }));
    expect(screen.getByRole("textbox")).toHaveValue(WARMUP.name);
  });

  it("deletes after today's confirmation", async () => {
    const props = paneWith(WARMUP);
    await userEvent.click(within(bar()).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: `Delete ${WARMUP.name}?` });
    expect(props.onDelete).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledWith(WARMUP.id);
  });

  it("moves focus to the tree once the deleted node is deselected", async () => {
    const tree = buildCollectionTree(TREE);
    const rows = collectionRows(tree, [GIGS.id]);
    const props = {
      tree,
      rows,
      onSelect: vi.fn(),
      onExpand: vi.fn(),
      onCreate: vi.fn(async () => ({ ok: true })),
      onRename: vi.fn(async () => ({ ok: true })),
      onMove: vi.fn(async () => ({ ok: true })),
      onPreviewDelete: vi.fn(async () => null),
      onDelete: vi.fn(async () => ({ ok: true })),
      onDropTracks: vi.fn(async () => ({ ok: true, added: 0, skipped: 0 })),
      canMakeSets: true,
    };
    const { rerender } = render(
      <CollectionsPane {...props} selected={findCollection(tree, WARMUP.id) ?? null} />,
    );
    await userEvent.click(within(bar()).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog", { name: `Delete ${WARMUP.name}?` });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(props.onDelete).toHaveBeenCalledWith(WARMUP.id);

    // The parent deselects the deleted node, so the bar unmounts.
    rerender(<CollectionsPane {...props} selected={null} />);
    expect(screen.queryByRole("toolbar", { name: "Selected Collection or Set" })).toBeNull();
    const stop = document.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]');
    expect(stop).not.toBeNull();
    expect(stop).toHaveFocus();
  });

  it("does nothing when a refused button is pressed", async () => {
    const props = paneWith(WARMUP);
    await userEvent.click(within(bar()).getByRole("button", { name: "Duplicate" }));
    expect(props.onDuplicateSet).not.toHaveBeenCalled();
    expect(props.onDuplicateSmart).not.toHaveBeenCalled();
  });

  it("exports any node, a folder included (DEC-087)", async () => {
    const props = paneWith(GIGS);
    await userEvent.click(within(bar()).getByRole("button", { name: "Export to Rekordbox…" }));
    expect(props.onExport).toHaveBeenCalledWith(expect.objectContaining({ id: GIGS.id }));
  });

  it("duplicates a Smart Collection, and a Set", async () => {
    const smart = paneWith(SMART);
    await userEvent.click(within(bar()).getByRole("button", { name: "Duplicate" }));
    expect(smart.onDuplicateSmart).toHaveBeenCalledWith(SMART.id);
  });

  it("duplicates a Set with its plan", async () => {
    const props = paneWith(FRIDAY);
    await userEvent.click(within(bar()).getByRole("button", { name: "Duplicate" }));
    expect(props.onDuplicateSet).toHaveBeenCalledWith(FRIDAY.id);
  });

  it("does not offer a duplicate the engine would refuse", () => {
    paneWith(WARMUP);
    const duplicate = within(bar()).getByRole("button", { name: "Duplicate" });
    expect(duplicate).toHaveAttribute("aria-disabled", "true");
    expect(duplicate).toHaveAttribute("title", "Only a Smart Collection or a Set can be duplicated");
  });

  it("adds Open in Prepare and Save set list… for a Set", async () => {
    const props = paneWith(FRIDAY);
    await userEvent.click(within(bar()).getByRole("button", { name: "Open in Prepare" }));
    expect(props.onOpenInPrepare).toHaveBeenCalledWith(expect.objectContaining({ id: FRIDAY.id }));
    await userEvent.click(within(bar()).getByRole("button", { name: "Save set list…" }));
    expect(props.onSaveSetList).toHaveBeenCalledWith(expect.objectContaining({ id: FRIDAY.id }));
  });

  it("does not draw the Set's buttons for a Collection", () => {
    paneWith(WARMUP);
    expect(within(bar()).queryByRole("button", { name: "Open in Prepare" })).toBeNull();
    expect(within(bar()).queryByRole("button", { name: "Save set list…" })).toBeNull();
  });

  it("is a toolbar: one Tab stop, the arrows move", async () => {
    paneWith(FRIDAY);
    const buttons = within(bar()).getAllByRole("button");
    expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1);
    buttons[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(buttons[1]).toHaveFocus();
  });
});

describe("Freeze lives on the bar for a Smart Collection (K14)", () => {
  it("is drawn for a Smart Collection and asks before it freezes", async () => {
    const props = paneWith(SMART);
    await userEvent.click(within(bar()).getByRole("button", { name: "Freeze to a Collection…" }));
    expect(props.onFreezeSmart).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Freeze it" }));
    expect(props.onFreezeSmart).toHaveBeenCalledWith(SMART.id);
  });

  it("is not drawn for a Collection, a Set or a folder", () => {
    for (const node of [WARMUP, FRIDAY, GIGS]) {

      paneWith(node);
      expect(
        within(bar()).queryByRole("button", { name: "Freeze to a Collection…" }),
      ).toBeNull();
      cleanup();
    }
  });
});

describe("what stays on the right-click menu only", () => {
  it("keeps Copy set list and New Set from… out of the bar", () => {
    paneWith(SMART);
    const names = within(bar()).getAllByRole("button").map((button) => button.textContent);
    for (const left of ["Copy set list", "New Set from…"]) {
      expect(names.some((name) => name?.includes(left))).toBe(false);
    }
  });
});
