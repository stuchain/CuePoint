/**
 * The tree's labelled buttons and the bar under it (FLW-10, PAGES-05C).
 *
 * "New Collection", "New Set" and "New folder" say their names over the tree.
 * Under it, a bar for the selected node is shown while a node is selected (DEC-245):
 * Rename, Duplicate, Delete and Export to Rekordbox… on every node (folders too,
 * DEC-087), and for a Set also Open in Prepare and Save set list…. With nothing
 * selected there is no bar. Hover icons and the
 * right-click menu keep working; Freeze, "Copy set list" and "New Set from…"
 * stay on the right-click menu only.
 */
import { render, screen, within } from "@testing-library/react";
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

describe("the labelled buttons over the tree", () => {
  it("say New Collection, New Set and New folder: the word New once, then a short word each", () => {
    paneWith(null);
    const group = screen.getByRole("group", { name: "Make something new" });
    expect(group).toHaveTextContent("New");
    for (const [name, word] of [
      ["New Collection", "Collection"],
      ["New Set", "Set"],
      ["New folder", "Folder"],
    ] as const) {
      // Visible text, not only an icon, under the button's full name.
      expect(screen.getByRole("button", { name })).toHaveTextContent(word);
    }
  });

  it("make a node in the selected folder, as before", async () => {
    const props = paneWith(GIGS);
    await userEvent.click(screen.getByRole("button", { name: "New folder" }));
    expect(props.onCreate).toHaveBeenCalledWith("folder", "New folder", GIGS.id);
  });

  it("leave New Set out where a Set cannot be made", () => {
    paneWith(null, { canMakeSets: false });
    expect(screen.queryByRole("button", { name: "New Set" })).toBeNull();
    expect(screen.getByRole("button", { name: "New Collection" })).toBeInTheDocument();
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

describe("what stays on the right-click menu only", () => {
  it("keeps Freeze, Copy set list and New Set from… out of the bar", () => {
    paneWith(SMART);
    const names = within(bar()).getAllByRole("button").map((button) => button.textContent);
    for (const left of ["Freeze", "Copy set list", "New Set from…"]) {
      expect(names.some((name) => name?.includes(left))).toBe(false);
    }
  });
});
