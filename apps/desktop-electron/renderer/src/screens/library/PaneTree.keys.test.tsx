/** The tree's keys from the verification round: parent, ends, type-ahead and moving (M466, M481, M462, M465). */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PaneTree, type PaneTreeRow } from "./PaneTree";

const ROWS: PaneTreeRow[] = [
  { key: "gigs", name: "Gigs 2026", icon: "folder", depth: 0, expanded: true, hasChildren: true, kind: "folder" },
  { key: "summer", name: "Summer", icon: "playlist", depth: 1, expanded: false, hasChildren: false, kind: "playlist" },
  { key: "sunday", name: "Sunday", icon: "playlist", depth: 1, expanded: false, hasChildren: false, kind: "playlist" },
  { key: "warmup", name: "Warm-up", icon: "playlist", depth: 0, expanded: false, hasChildren: false, kind: "playlist" },
];

function renderTree(extra: Partial<Parameters<typeof PaneTree>[0]> = {}) {
  const handlers = { onSelect: vi.fn(), onExpand: vi.fn(), onRowMove: vi.fn() };
  render(<PaneTree label="Playlists" rows={ROWS} selectedKey={null} {...handlers} {...extra} />);
  return handlers;
}

const row = (name: RegExp) => screen.getByRole("treeitem", { name });

describe("the tree's keys", () => {
  it("M466: Left on a leaf goes to its parent folder", () => {
    renderTree();
    fireEvent.keyDown(row(/^Sunday/), { key: "ArrowLeft" });
    expect(row(/^Gigs 2026/)).toHaveFocus();
  });

  it("M466: Left on an open folder closes it, and stays", () => {
    const { onExpand } = renderTree();
    fireEvent.keyDown(row(/^Gigs 2026/), { key: "ArrowLeft" });
    expect(onExpand).toHaveBeenCalledWith("gigs", false);
  });

  it("M466: Home and End go to the first and last rows", () => {
    renderTree();
    fireEvent.keyDown(row(/^Summer/), { key: "End" });
    expect(row(/^Warm-up/)).toHaveFocus();
    fireEvent.keyDown(row(/^Warm-up/), { key: "Home" });
    expect(row(/^Gigs 2026/)).toHaveFocus();
  });

  it("M481: a letter moves to the next name that starts with it, and again cycles", () => {
    renderTree();
    fireEvent.keyDown(row(/^Gigs 2026/), { key: "s" });
    expect(row(/^Summer/)).toHaveFocus();
    fireEvent.keyDown(row(/^Summer/), { key: "s" });
    expect(row(/^Sunday/)).toHaveFocus();
  });

  it("M481: letters typed together find the name they spell", () => {
    renderTree();
    fireEvent.keyDown(row(/^Gigs 2026/), { key: "w" });
    fireEvent.keyDown(row(/^Warm-up/), { key: "a" });
    expect(row(/^Warm-up/)).toHaveFocus();
  });

  it("M462: Alt+Up and Alt+Down move the row, not the focus", () => {
    const { onRowMove } = renderTree();
    fireEvent.keyDown(row(/^Sunday/), { key: "ArrowUp", altKey: true });
    expect(onRowMove).toHaveBeenCalledWith("sunday", -1);
    fireEvent.keyDown(row(/^Summer/), { key: "ArrowDown", altKey: true });
    expect(onRowMove).toHaveBeenCalledWith("summer", 1);
  });

  it("M465: Space selects nothing; it is the player's", () => {
    const { onSelect } = renderTree();
    fireEvent.keyDown(row(/^Summer/), { key: " " });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
