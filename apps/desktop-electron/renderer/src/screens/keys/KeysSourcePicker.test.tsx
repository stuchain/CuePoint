/** The Keys page's Sources box: the Library tree's rows with a tick box in front (Q18, Q20). */
import rawCss from "./keys.css?raw";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { CollectionNode } from "../../api/cuepointBridge.types";
import { buildCollectionTree } from "../library/collectionTree";
import { buildTree } from "../library/playlistTree";
import { KeysSourcePicker } from "./KeysSourcePicker";

// A Windows checkout reads the stylesheet with CRLF line ends.
const css = rawCss.replace(/\r\n/g, "\n");

const PLAYLISTS = buildTree([
  { id: 1, parent_id: null, name: "Gigs 2026", kind: "folder", depth: 0, position: 0, path: "Gigs 2026", track_count: 0 },
  { id: 2, parent_id: 1, name: "Sunset", kind: "playlist", depth: 1, position: 0, path: "Gigs 2026/Sunset", track_count: 28 },
  { id: 3, parent_id: 1, name: "Closing", kind: "playlist", depth: 1, position: 1, path: "Gigs 2026/Closing", track_count: 12 },
]);

const node = (fields: Partial<CollectionNode>) =>
  ({ entry_count: 5, position: 0, parent_id: null, depth: fields.parent_id ? 1 : 0, ...fields }) as unknown as CollectionNode;

const COLLECTIONS = [
  node({ id: 7, name: "Ideas", kind: "collection" }),
  node({ id: 20, name: "Crates", kind: "folder", position: 1 }),
  node({ id: 21, name: "Warm", kind: "collection", parent_id: 20 }),
  node({ id: 22, name: "Late", kind: "collection", parent_id: 20, position: 1 }),
  node({ id: 30, name: "Sets folder", kind: "folder", position: 2 }),
  node({ id: 31, name: "Friday", kind: "set", parent_id: 30 }),
];

function renderPicker(extra: Partial<React.ComponentProps<typeof KeysSourcePicker>> = {}) {
  const onToggle = vi.fn();
  const onToggleMany = vi.fn();
  const onClear = vi.fn();
  render(
    <KeysSourcePicker
      playlists={PLAYLISTS}
      collections={buildCollectionTree(COLLECTIONS)}
      picked={[]}
      onToggle={onToggle}
      onToggleMany={onToggleMany}
      onClear={onClear}
      {...extra}
    />,
  );
  return { onToggle, onToggleMany, onClear };
}

describe("KeysSourcePicker", () => {
  it("draws the Library tree's rows: tick box, icon, name and a right-hand count", () => {
    renderPicker();
    const panel = screen.getByRole("group", { name: "Sources" });
    const sunset = within(panel).getByRole("checkbox", { name: "Sunset" });
    const row = sunset.closest("label")!;
    expect(row).toHaveClass("cp-playlist-pane__row");
    const name = within(row).getByText("Sunset");
    // The tick box comes before the name (and its icon).
    expect(sunset.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(row).getByText("28")).toHaveClass("cp-playlist-pane__count");
    expect(within(panel).getByText("Ideas").closest("label")).toBeTruthy();
  });

  it("indents each level by the one tree indent (C40) and marks folders", () => {
    renderPicker();
    const folder = screen.getByRole("checkbox", { name: "Gigs 2026" }).closest("label")!;
    const child = screen.getByRole("checkbox", { name: "Sunset" }).closest("label")!;
    expect(folder).toHaveAttribute("data-kind", "folder");
    expect(child.style.paddingLeft).toBe("calc(var(--space-sm) + 1 * var(--tree-indent))");
    expect(child.querySelectorAll(".cp-playlist-pane__guide")).toHaveLength(1);
  });

  it("indents Sets as deep as the Collections and Playlists (C40)", () => {
    renderPicker();
    const friday = screen.getByRole("checkbox", { name: "Friday" }).closest("label")!;
    const warm = screen.getByRole("checkbox", { name: "Warm" }).closest("label")!;
    expect(friday.style.paddingLeft).toBe(warm.style.paddingLeft);
    expect(friday.style.paddingLeft).toContain("--tree-indent");
  });

  it("still ticks a source", () => {
    const { onToggle } = renderPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: "Sunset" }));
    expect(onToggle).toHaveBeenCalledWith({ kind: "playlist", id: 2 });
  });

  it("has a box on a Collections folder and ticks everything under it (C40)", () => {
    const { onToggleMany } = renderPicker();
    const folder = screen.getByRole("checkbox", { name: "Crates" });
    expect(folder).not.toBeChecked();
    fireEvent.click(folder);
    expect(onToggleMany).toHaveBeenCalledWith(
      [
        { kind: "collection", id: 21 },
        { kind: "collection", id: 22 },
      ],
      true,
    );
  });

  it("has a box on a Sets folder too", () => {
    const { onToggleMany } = renderPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: "Sets folder" }));
    expect(onToggleMany).toHaveBeenCalledWith([{ kind: "set", id: 31 }], true);
  });

  it("shows a folder ticked, dashed or empty by how much under it is ticked (tri-state)", () => {
    renderPicker({ picked: [{ kind: "collection", id: 21 }] });
    const some = screen.getByRole("checkbox", { name: "Crates" }) as HTMLInputElement;
    expect(some.indeterminate).toBe(true);
    expect(some).not.toBeChecked();
  });

  it("ticks the folder when everything under it is ticked, and a click unticks them all", () => {
    const { onToggleMany } = renderPicker({
      picked: [
        { kind: "collection", id: 21 },
        { kind: "collection", id: 22 },
      ],
    });
    const folder = screen.getByRole("checkbox", { name: "Crates" }) as HTMLInputElement;
    expect(folder).toBeChecked();
    expect(folder.indeterminate).toBe(false);
    fireEvent.click(folder);
    expect(onToggleMany).toHaveBeenCalledWith(
      [
        { kind: "collection", id: 21 },
        { kind: "collection", id: 22 },
      ],
      false,
    );
  });

  it("dashes a Rekordbox folder when only some of its playlists are ticked", () => {
    renderPicker({ picked: [{ kind: "playlist", id: 2 }] });
    expect((screen.getByRole("checkbox", { name: "Gigs 2026" }) as HTMLInputElement).indeterminate).toBe(true);
  });

  it("dashes a Rekordbox folder whose playlists are all ticked but not the folder itself", () => {
    renderPicker({
      picked: [
        { kind: "playlist", id: 2 },
        { kind: "playlist", id: 3 },
      ],
    });
    const folder = screen.getByRole("checkbox", { name: "Gigs 2026" }) as HTMLInputElement;
    expect(folder.indeterminate).toBe(true);
    expect(folder).not.toBeChecked();
  });

  it("has no Which tracks select: the checklist is the one scope, and Clear lets go of the ticks (D19, M172)", () => {
    const { onClear } = renderPicker();
    expect(screen.queryByRole("combobox")).toBeNull();
    // Nothing ticked: nothing to clear.
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
    cleanup();
    const again = renderPicker({ picked: [{ kind: "playlist", id: 2 }] });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(again.onClear).toHaveBeenCalledTimes(1);
    expect(onClear).not.toHaveBeenCalled();
  });

  it("heads the pane 'Sources', like the wheel's and the tracks' heads (D19)", () => {
    renderPicker();
    expect(screen.getByRole("heading", { level: 2, name: "Sources" }).closest(".keys-head")).not.toBeNull();
  });

  it("hints its search box with what it searches, in words the person uses (M418)", () => {
    renderPicker();
    const search = screen.getByRole("searchbox", { name: "Search playlists and Collections" });
    expect(search).toHaveAttribute("placeholder", "Search playlists and Collections…");
  });

  it("goes to its search box on Ctrl+F (C189)", () => {
    renderPicker();
    fireEvent.keyDown(window, { key: "f", ctrlKey: true });
    expect(screen.getByRole("searchbox", { name: "Search playlists and Collections" })).toHaveFocus();
  });

  it("folds each group from the Library's fold head, and a search opens them all (M171)", () => {
    renderPicker();
    const fold = screen.getByRole("button", { name: "Collections" });
    expect(fold).toHaveClass("cp-playlist-pane__fold");
    expect(fold).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(fold);
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("checkbox", { name: "Ideas", hidden: true }).closest("ul")).toHaveAttribute("hidden");
    // The other groups stay open.
    expect(screen.getByRole("button", { name: "Playlists" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search playlists and Collections" }), { target: { value: "ideas" } });
    expect(screen.getByRole("button", { name: "Collections" })).toHaveAttribute("aria-expanded", "true");
  });

  it("starts every group's top rows on one left edge, however deep the tree begins (M164)", () => {
    const nested = buildTree([
      { id: 9, parent_id: null, name: "Root", kind: "folder", depth: 0, position: 0, path: "Root", track_count: 0 },
      { id: 10, parent_id: 9, name: "Flat one", kind: "playlist", depth: 1, position: 0, path: "Root/Flat one", track_count: 4 },
    ]);
    renderPicker({ playlists: nested });
    expect(screen.getByRole("checkbox", { name: "Root" }).closest("label")!.style.paddingLeft).toBe(
      "calc(var(--space-sm) + 0 * var(--tree-indent))",
    );
  });

  it("is as tall as the wheel's pane (it stretches with the row, P7), its rows scrolling inside", () => {
    const start = css.indexOf(".keys-sources__body {");
    const body = css.slice(start, css.indexOf("}", start));
    expect(body).toContain("flex: 1 1 0");
    expect(body).toContain("min-height: 0");
    expect(body).not.toContain("max-height");
  });

  it("holds a folder-only row's missing tick box at the checkbox's size, not the tree step (N6)", () => {
    const start = css.indexOf(".keys-sources__no-box {\n  width");
    const body = css.slice(start, css.indexOf("}", start));
    expect(body).toContain("width: var(--font-size-sm)");
    expect(body).toContain("height: var(--font-size-sm)");
    expect(body).not.toContain("--tree-step");
  });

  it("does not bold its whole-library row, or any selected one (C82)", () => {
    expect(css).not.toMatch(/keys-sources__row--whole/);
  });
});
