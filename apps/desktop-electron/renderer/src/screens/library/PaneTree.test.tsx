/** The tree both Library sections share: nesting, folders, and names that never run under counts (Q1, Q2). */
import rawCss from "./PlaylistPane.css?raw";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PaneTree, type PaneTreeRow } from "./PaneTree";

// A Windows checkout reads the stylesheet with CRLF line ends.
const css = rawCss.replace(/\r\n/g, "\n");

function rule(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start, `${selector} has a rule`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

const ROWS: PaneTreeRow[] = [
  { key: "gigs", name: "Gigs 2026", icon: "folder", depth: 0, expanded: true, hasChildren: true, kind: "folder" },
  { key: "summer", name: "Summer", icon: "folder", depth: 1, expanded: true, hasChildren: true, kind: "folder" },
  {
    key: "closing",
    name: "Closing set for the long Saturday night",
    icon: "playlist",
    depth: 2,
    expanded: false,
    hasChildren: false,
    kind: "playlist",
    count: 25,
  },
];

function renderTree() {
  return render(
    <PaneTree label="Playlists" rows={ROWS} selectedKey={null} onSelect={vi.fn()} onExpand={vi.fn()} />,
  );
}

describe("PaneTree nesting", () => {
  it("steps each level in by the fold arrow and its gap; a twisty is the fold arrow's width (Q5b)", () => {
    renderTree();
    const rows = screen.getAllByRole("treeitem");
    expect(rows[1]!.style.paddingLeft).toBe("calc(var(--space-sm) + var(--pane-edge, 0px) + 1 * var(--tree-step))");
    expect(rows[2]!.style.paddingLeft).toBe("calc(var(--space-sm) + var(--pane-edge, 0px) + 2 * var(--tree-step))");
    // Q5b: was a 20 px twisty slot on every row, so names started past the section titles.
    expect(rule(".cp-playlist-pane,\n.cp-playlist-pane__tree")).toContain("--tree-twisty: var(--icon-size-sm)");
    expect(rule(".cp-playlist-pane,\n.cp-playlist-pane__tree")).toContain(
      "--tree-step: calc(var(--tree-twisty) + var(--space-xs))",
    );
    expect(rule(".cp-playlist-pane__twisty")).toContain("width: var(--tree-twisty)");
  });

  it("draws one guide line per open ancestor, and none on a root", () => {
    renderTree();
    const guides = (name: string) =>
      screen.getByRole("treeitem", { name: new RegExp(name) }).querySelectorAll(".cp-playlist-pane__guide");
    expect(guides("Gigs 2026")).toHaveLength(0);
    expect(guides("Summer")).toHaveLength(1);
    expect(guides("Closing set")).toHaveLength(2);
  });

  it("makes folder names brighter and bold", () => {
    const folder = rule('.cp-playlist-pane__row[data-kind="folder"] .cp-playlist-pane__name');
    expect(folder).toContain("font-weight: var(--font-weight-bold)");
    expect(folder).toContain("color: var(--fg-primary)");
    renderTree();
    expect(screen.getByRole("treeitem", { name: /Summer/ })).toHaveAttribute("data-kind", "folder");
  });
});

describe("a long name never runs under its count (Q2)", () => {
  it("wraps the name in a hover hint that is not inline, so it can shrink", () => {
    renderTree();
    const name = screen.getByText("Closing set for the long Saturday night");
    const wrapper = name.parentElement!;
    expect(wrapper).toHaveClass("cp-hint");
    // The old `inline` wrapper was display: inline, which a flex row cannot shrink or ellipsise.
    expect(wrapper).not.toHaveClass("cp-hint--inline");
    expect(rule(".cp-playlist-pane__row > .cp-hint")).toMatch(/min-width: 0/);
    const nameRule = rule(".cp-playlist-pane__name");
    expect(nameRule).toContain("min-width: 0");
    expect(nameRule).toContain("text-overflow: ellipsis");
  });

  it("puts the count in a right-hand column, after the name", () => {
    renderTree();
    const row = screen.getByRole("treeitem", { name: /Closing set/ });
    const count = screen.getByText("25");
    expect(count).toHaveClass("cp-playlist-pane__count");
    expect(row.lastElementChild).toBe(count);
    expect(rule(".cp-playlist-pane__count")).toContain("margin-left: auto");
  });
});

describe("a narrow pane", () => {
  // Regression: with Track details open the pane is ~180px, and a 20px step per level left a
  // nested playlist only "D…" of its name.
  it("steps each level in by the chevron's width, not a whole twisty", () => {
    // Moved for M83: the width is in the pane's own text size (20em), not 260 CSS px.
    expect(css).toMatch(/@container library-pane \(max-width: 20em\)\s*\{[^}]*--tree-step: calc\(12px \* var\(--scale\)\)/);
  });
});
