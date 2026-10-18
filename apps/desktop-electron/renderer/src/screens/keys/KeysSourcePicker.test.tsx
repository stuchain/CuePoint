/** The Keys page's Sources box: the Library tree's rows with a tick box in front (Q18, Q20). */
import rawCss from "./keys.css?raw";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
]);

const COLLECTION = {
  id: 7,
  parent_id: null,
  name: "Ideas",
  kind: "collection",
  entry_count: 5,
  position: 0,
} as unknown as CollectionNode;

function renderPicker(extra: Partial<React.ComponentProps<typeof KeysSourcePicker>> = {}) {
  const onToggle = vi.fn();
  render(
    <KeysSourcePicker
      playlists={PLAYLISTS}
      collections={buildCollectionTree([COLLECTION])}
      picked={[]}
      onToggle={onToggle}
      onClear={vi.fn()}
      {...extra}
    />,
  );
  return { onToggle };
}

describe("KeysSourcePicker", () => {
  it("draws the Library tree's rows: tick box, icon, name and a right-hand count", () => {
    renderPicker({ libraryTrackCount: 300 });
    const panel = screen.getByRole("group", { name: "Sources" });
    const sunset = within(panel).getByRole("checkbox", { name: "Sunset" });
    const row = sunset.closest("label")!;
    expect(row).toHaveClass("cp-playlist-pane__row");
    const name = within(row).getByText("Sunset");
    // The tick box comes before the name (and its icon).
    expect(sunset.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(row).getByText("28")).toHaveClass("cp-playlist-pane__count");
    expect(within(panel).getByText("300")).toHaveClass("cp-playlist-pane__count");
    expect(within(panel).getByText("5")).toBeInTheDocument();
  });

  it("indents each level by the Library tree's step and marks folders", () => {
    renderPicker();
    const folder = screen.getByRole("checkbox", { name: "Gigs 2026" }).closest("label")!;
    const child = screen.getByRole("checkbox", { name: "Sunset" }).closest("label")!;
    expect(folder).toHaveAttribute("data-kind", "folder");
    expect(child.style.paddingLeft).toBe("calc(var(--space-sm) + 1 * var(--tree-step))");
    expect(child.querySelectorAll(".cp-playlist-pane__guide")).toHaveLength(1);
  });

  it("still ticks a source", () => {
    const { onToggle } = renderPicker();
    fireEvent.click(screen.getByRole("checkbox", { name: "Sunset" }));
    expect(onToggle).toHaveBeenCalledWith({ kind: "playlist", id: 2 });
  });

  it("hints its search box 'Search sources…' while it fits (the field shortens it to 'Search…' when it does not)", () => {
    renderPicker();
    const search = screen.getByRole("searchbox", { name: "Search sources" });
    expect(search).toHaveAttribute("placeholder", "Search sources…");
  });

  it("is as tall as the wheel, its rows scrolling inside", () => {
    const start = css.indexOf(".keys-sources__body {");
    const body = css.slice(start, css.indexOf("}", start));
    expect(body).toContain("height: var(--keys-wheel)");
    expect(body).not.toContain("max-height");
  });

  it("holds a folder-only row's missing tick box at the checkbox's size, not the tree step (N6)", () => {
    const start = css.indexOf(".keys-sources__no-box {\n  width");
    const body = css.slice(start, css.indexOf("}", start));
    expect(body).toContain("width: var(--font-size-sm)");
    expect(body).toContain("height: var(--font-size-sm)");
    expect(body).not.toContain("--tree-step");
  });
});
