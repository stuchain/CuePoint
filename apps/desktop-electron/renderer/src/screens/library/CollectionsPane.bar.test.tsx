/**
 * The "+ New" menu and the selected row's "•••" menu (FLW-10, PAGES-05C, K14, C15, C227).
 *
 * One "+ New" menu button over the tree makes a Collection, a Set or a Folder. The selected row
 * (and only that row) has a "•••" button at its right end that opens its actions, the same list
 * the right-click menu shows: Rename, Duplicate (a Smart Collection or a Set), Delete… and Export
 * to Rekordbox… on every node (folders too, DEC-087); for a Smart Collection also Freeze…, and for
 * a Set also Open in Prepare and Save set list…. The bar at the foot of the pane is gone: it was a
 * screen away from the row it acted on.
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

  it("is a menu button: the word, then the small chevron, on one line", () => {
    paneWith(null);
    const button = screen.getByRole("button", { name: "+ New" });
    expect(button).toHaveClass("cp-collections__new");
    expect(button).toHaveClass("cp-btn--menu");
    expect(button.querySelector(".cp-btn__menu .cp-pixel-icon")).not.toBeNull();
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

/** Opens the selected row's "•••" menu and returns the menu. */
async function openRowMenu() {
  await userEvent.click(screen.getByRole("button", { name: /^Actions for / }));
  return screen.getByRole("menu");
}

async function pickAction(name: string) {
  const menu = await openRowMenu();
  await userEvent.click(within(menu).getByRole("menuitem", { name }));
}

async function rowActions(): Promise<string[]> {
  const menu = await openRowMenu();
  const names = within(menu)
    .getAllByRole("menuitem")
    .map((item) => item.textContent ?? "");
  await userEvent.keyboard("{Escape}");
  return names;
}

describe("a folder click (C197)", () => {
  it("opens or closes the folder and does not select it", async () => {
    const props = paneWith(WARMUP);
    await userEvent.click(screen.getByText(GIGS.name));
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onExpand).toHaveBeenCalledTimes(1);
    expect((props.onExpand as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe(GIGS.id);
  });

  it("moves the \"•••\" to the folder without moving the selected look", async () => {
    paneWith(WARMUP);
    expect(screen.getAllByRole("button", { name: /^Actions for / })).toHaveLength(1);
    expect(screen.getByRole("button", { name: `Actions for ${WARMUP.name}` })).toBeInTheDocument();

    await userEvent.click(screen.getByText(GIGS.name));

    // One menu button, on the folder just clicked; the Collection is still the selected one.
    const buttons = screen.getAllByRole("button", { name: /^Actions for / });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName(`Actions for ${GIGS.name}`);
    const rows = screen.getAllByRole("treeitem");
    const selectedRows = rows.filter((item) => item.getAttribute("aria-selected") === "true");
    expect(selectedRows).toHaveLength(1);
    expect(selectedRows[0]).toHaveTextContent(WARMUP.name);
    const gigs = rows.find((item) => within(item).queryByText(GIGS.name))!;
    expect(gigs).toHaveAttribute("aria-selected", "false");
  });

  it("gives a folder its Rename and Delete from that menu", async () => {
    paneWith(WARMUP);
    await userEvent.click(screen.getByText(GIGS.name));
    const menu = await openRowMenu();
    const names = within(menu).getAllByRole("menuitem").map((item) => item.textContent);
    expect(names).toContain("Rename");
    expect(names).toContain("Delete…");
  });

  it("makes a new node inside the folder last clicked", async () => {
    const props = paneWith(WARMUP);
    await userEvent.click(screen.getByText(GIGS.name));
    await chooseNew("Collection");
    expect(props.onCreate).toHaveBeenCalledWith("collection", expect.any(String), GIGS.id);
  });
});

describe("the selected row's actions menu", () => {
  it("has no bar at the foot of the pane any more", () => {
    paneWith(WARMUP);
    expect(screen.queryByRole("toolbar", { name: "Selected Collection or Set" })).toBeNull();
    expect(document.querySelector(".cp-collections__bar")).toBeNull();
  });

  it("is drawn on the selected row only, as the three-dot icon with the row's name", () => {
    paneWith(WARMUP);
    const buttons = screen.getAllByRole("button", { name: /^Actions for / });
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAttribute("aria-label", `Actions for ${WARMUP.name}`);
    expect(buttons[0]).toHaveTextContent("");
    expect(buttons[0]!.querySelector('[data-icon="more"]')).not.toBeNull();
    expect(buttons[0]).toHaveAttribute("aria-haspopup", "menu");
  });

  it("is not drawn while nothing is selected", () => {
    paneWith(null);
    expect(screen.queryByRole("button", { name: /^Actions for / })).toBeNull();
  });

  it("offers New Set from…, Rename, Export to Rekordbox… and Delete… on a Collection, and no Duplicate", async () => {
    paneWith(WARMUP);
    expect(await rowActions()).toEqual(["New Set from…", "Rename", "Export to Rekordbox…", "Delete…"]);
  });

  it("puts Delete… last, after a divider, and not as a button of its own", async () => {
    paneWith(WARMUP);
    const menu = await openRowMenu();
    const items = within(menu).getAllByRole("menuitem");
    expect(items[items.length - 1]).toHaveTextContent("Delete…");
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("renames the selected node in its row", async () => {
    paneWith(WARMUP);
    await pickAction("Rename");
    expect(screen.getByRole("textbox")).toHaveValue(WARMUP.name);
  });

  it("draws no '•••' on a row while it is being renamed", async () => {
    paneWith(WARMUP);
    await pickAction("Rename");
    expect(screen.queryByRole("button", { name: /^Actions for / })).toBeNull();
  });

  it("deletes after the confirmation, which names the thing and what kind it is", async () => {
    const props = paneWith(WARMUP);
    await pickAction("Delete…");
    const dialog = await screen.findByRole("dialog", { name: `Delete “${WARMUP.name}”?` });
    expect(dialog).toHaveTextContent("This cannot be undone.");
    expect(props.onDelete).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete Collection" }));
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
    await pickAction("Delete…");
    const dialog = await screen.findByRole("dialog", { name: `Delete “${WARMUP.name}”?` });
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete Collection" }));
    expect(props.onDelete).toHaveBeenCalledWith(WARMUP.id);

    // The parent deselects the deleted node, so the row's menu goes with the selection.
    rerender(<CollectionsPane {...props} selected={null} />);
    expect(screen.queryByRole("button", { name: `Actions for ${WARMUP.name}` })).toBeNull();
    const stop = document.querySelector<HTMLElement>('[role="treeitem"][tabindex="0"]');
    expect(stop).not.toBeNull();
    expect(stop).toHaveFocus();
  });

  it("exports any node, a folder included (DEC-087)", async () => {
    const props = paneWith(GIGS);
    await pickAction("Export to Rekordbox…");
    expect(props.onExport).toHaveBeenCalledWith(expect.objectContaining({ id: GIGS.id }));
  });

  it("does not select the row, or press its key handlers, when the button is used", async () => {
    const props = paneWith(WARMUP);
    await userEvent.click(screen.getByRole("button", { name: `Actions for ${WARMUP.name}` }));
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("duplicates a Smart Collection, and a Set", async () => {
    const smart = paneWith(SMART);
    await pickAction("Duplicate");
    expect(smart.onDuplicateSmart).toHaveBeenCalledWith(SMART.id);
  });

  it("duplicates a Set with its plan", async () => {
    const props = paneWith(FRIDAY);
    await pickAction("Duplicate");
    expect(props.onDuplicateSet).toHaveBeenCalledWith(FRIDAY.id);
  });

  it("does not offer a duplicate the engine would refuse", async () => {
    paneWith(WARMUP);
    expect(await rowActions()).not.toContain("Duplicate");
  });

  it("adds Open in Prepare and Save set list… for a Set", async () => {
    const props = paneWith(FRIDAY);
    await pickAction("Open in Prepare");
    expect(props.onOpenInPrepare).toHaveBeenCalledWith(expect.objectContaining({ id: FRIDAY.id }));
    await pickAction("Save set list…");
    expect(props.onSaveSetList).toHaveBeenCalledWith(expect.objectContaining({ id: FRIDAY.id }));
  });

  it("does not offer the Set's entries for a Collection", async () => {
    paneWith(WARMUP);
    const names = await rowActions();
    expect(names).not.toContain("Open in Prepare");
    expect(names).not.toContain("Save set list…");
  });

  it("closes on the next click of the same button, and on Escape", async () => {
    paneWith(WARMUP);
    const button = screen.getByRole("button", { name: `Actions for ${WARMUP.name}` });
    await userEvent.click(button);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await userEvent.click(button);
    expect(screen.queryByRole("menu")).toBeNull();
    await userEvent.click(button);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("Freeze lives on the row's menu for a Smart Collection (K14)", () => {
  it("is drawn for a Smart Collection and asks before it freezes", async () => {
    const props = paneWith(SMART);
    await pickAction("Save as a Collection…");
    expect(props.onFreezeSmart).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Freeze it" }));
    expect(props.onFreezeSmart).toHaveBeenCalledWith(SMART.id);
  });

  it("is not drawn for a Collection, a Set or a folder", async () => {
    for (const node of [WARMUP, FRIDAY, GIGS]) {
      paneWith(node);
      expect(await rowActions()).not.toContain("Save as a Collection…");
      cleanup();
    }
  });
});

describe("one list for both menus", () => {
  it("shows a Smart Collection's New Set from… in the '•••' menu as in the right-click menu", async () => {
    paneWith(SMART);
    expect(await rowActions()).toContain("New Set from…");
  });

  it("shows a Set's Copy set list in the '•••' menu as in the right-click menu", async () => {
    paneWith(FRIDAY);
    expect(await rowActions()).toContain("Copy set list");
  });
});
