/**
 * The keys a track table answers, as pure decisions (keyboard row selection).
 *
 * The table reads a key press through `rowKeyCommand` and the scroll it owes the
 * cursor through `revealOffset`; neither touches the DOM, so both are held here.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { pageSizeFor, revealOffset, rowKeyCommand } from "./trackTableKeys";

function key(name: string, mods: Partial<Record<"shiftKey" | "ctrlKey" | "metaKey" | "altKey", boolean>> = {}) {
  return { key: name, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods };
}

const BASE = { cursor: 5, total: 100, pageSize: 10, canSelectAll: false };

afterEach(() => vi.restoreAllMocks());

describe("rowKeyCommand", () => {
  it("moves one row with Up and Down, selecting alone", () => {
    expect(rowKeyCommand(key("ArrowDown"), BASE)).toEqual({ kind: "move", to: 6, extend: false });
    expect(rowKeyCommand(key("ArrowUp"), BASE)).toEqual({ kind: "move", to: 4, extend: false });
  });

  it("extends with Shift", () => {
    expect(rowKeyCommand(key("ArrowDown", { shiftKey: true }), BASE)).toEqual({ kind: "move", to: 6, extend: true });
    expect(rowKeyCommand(key("ArrowUp", { shiftKey: true }), BASE)).toEqual({ kind: "move", to: 4, extend: true });
  });

  it("starts at the first row when there is no cursor", () => {
    const none = { ...BASE, cursor: null };
    expect(rowKeyCommand(key("ArrowDown"), none)).toEqual({ kind: "move", to: 0, extend: false });
    expect(rowKeyCommand(key("ArrowUp"), none)).toEqual({ kind: "move", to: 0, extend: false });
  });

  it("clamps at both ends", () => {
    expect(rowKeyCommand(key("ArrowUp"), { ...BASE, cursor: 0 })).toEqual({ kind: "move", to: 0, extend: false });
    expect(rowKeyCommand(key("ArrowDown"), { ...BASE, cursor: 99 })).toEqual({ kind: "move", to: 99, extend: false });
    expect(rowKeyCommand(key("PageDown"), { ...BASE, cursor: 95 })).toEqual({ kind: "move", to: 99, extend: false });
    expect(rowKeyCommand(key("PageUp"), { ...BASE, cursor: 3 })).toEqual({ kind: "move", to: 0, extend: false });
  });

  it("jumps with Home and End, with and without Shift", () => {
    expect(rowKeyCommand(key("Home"), BASE)).toEqual({ kind: "move", to: 0, extend: false });
    expect(rowKeyCommand(key("End"), BASE)).toEqual({ kind: "move", to: 99, extend: false });
    expect(rowKeyCommand(key("Home", { shiftKey: true }), BASE)).toEqual({ kind: "move", to: 0, extend: true });
    expect(rowKeyCommand(key("End", { shiftKey: true }), BASE)).toEqual({ kind: "move", to: 99, extend: true });
  });

  it("pages by the page size", () => {
    expect(rowKeyCommand(key("PageDown"), BASE)).toEqual({ kind: "move", to: 15, extend: false });
    expect(rowKeyCommand(key("PageUp"), { ...BASE, cursor: 50 })).toEqual({ kind: "move", to: 40, extend: false });
    expect(rowKeyCommand(key("PageDown", { shiftKey: true }), BASE)).toEqual({ kind: "move", to: 15, extend: true });
  });

  it("handles nothing on an empty table", () => {
    const empty = { ...BASE, cursor: null, total: 0, canSelectAll: true };
    for (const name of ["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"]) {
      expect(rowKeyCommand(key(name), empty)).toBeNull();
    }
    expect(rowKeyCommand(key("a", { ctrlKey: true }), empty)).toBeNull();
  });

  it("leaves Ctrl and Cmd with the arrows to the player", () => {
    expect(rowKeyCommand(key("ArrowDown", { ctrlKey: true }), BASE)).toBeNull();
    expect(rowKeyCommand(key("ArrowUp", { ctrlKey: true }), BASE)).toBeNull();
    expect(rowKeyCommand(key("ArrowDown", { ctrlKey: true, shiftKey: true }), BASE)).toBeNull();
    expect(rowKeyCommand(key("ArrowDown", { metaKey: true }), BASE)).toBeNull();
  });

  it("leaves Alt with the arrows to reordering", () => {
    expect(rowKeyCommand(key("ArrowDown", { altKey: true }), BASE)).toBeNull();
    expect(rowKeyCommand(key("ArrowUp", { altKey: true }), BASE)).toBeNull();
    expect(rowKeyCommand(key("Home", { altKey: true }), BASE)).toBeNull();
  });

  it("selects all on Ctrl+A only when the table has a way to", () => {
    expect(rowKeyCommand(key("a", { ctrlKey: true }), { ...BASE, canSelectAll: true })).toEqual({ kind: "selectAll" });
    expect(rowKeyCommand(key("A", { ctrlKey: true }), { ...BASE, canSelectAll: true })).toEqual({ kind: "selectAll" });
    expect(rowKeyCommand(key("a", { ctrlKey: true }), BASE)).toBeNull();
    expect(rowKeyCommand(key("a"), { ...BASE, canSelectAll: true })).toBeNull();
  });

  it("leaves Ctrl+Shift+A to the Activity shortcut", () => {
    expect(rowKeyCommand(key("A", { ctrlKey: true, shiftKey: true }), { ...BASE, canSelectAll: true })).toBeNull();
  });

  it("toggles the cursor row on Ctrl+Space, not on plain Space", () => {
    expect(rowKeyCommand(key(" ", { ctrlKey: true }), BASE)).toEqual({ kind: "toggle" });
    expect(rowKeyCommand(key(" "), BASE)).toBeNull();
    expect(rowKeyCommand(key(" ", { ctrlKey: true }), { ...BASE, cursor: null })).toBeNull();
  });

  it("counts Cmd as the shortcut modifier on a Mac only", () => {
    const platform = vi.spyOn(navigator, "platform", "get");
    platform.mockReturnValue("MacIntel");
    expect(rowKeyCommand(key(" ", { metaKey: true }), BASE)).toEqual({ kind: "toggle" });
    expect(rowKeyCommand(key("a", { metaKey: true }), { ...BASE, canSelectAll: true })).toEqual({ kind: "selectAll" });
    platform.mockReturnValue("Linux x86_64");
    expect(rowKeyCommand(key(" ", { metaKey: true }), BASE)).toBeNull();
  });

  it("ignores other keys", () => {
    for (const name of ["ArrowLeft", "ArrowRight", "Escape", "Tab", "x", "Enter"]) {
      expect(rowKeyCommand(key(name), BASE)).toBeNull();
    }
  });
});

describe("pageSizeFor", () => {
  it("is the rows that fit below the header, less one for context", () => {
    expect(pageSizeFor(600, 30, 30)).toBe(18);
  });

  it("is never less than one row", () => {
    expect(pageSizeFor(50, 30, 30)).toBe(1);
    expect(pageSizeFor(0, 30, 30)).toBe(1);
  });
});

describe("revealOffset", () => {
  // 30px rows under a 30px header in a 300px viewport: nine rows are visible.
  const reveal = (index: number, scrollTop: number) => revealOffset(index, 30, 30, scrollTop, 300);

  it("is null for a row fully visible below the header", () => {
    expect(reveal(0, 0)).toBeNull();
    expect(reveal(8, 0)).toBeNull();
  });

  it("scrolls up so a row above the view sits just under the header", () => {
    expect(reveal(2, 300)).toBe(60);
  });

  it("scrolls down by the row's bottom edge, counting the header", () => {
    // Row 20 spans 630..660 in content; the viewport must end at 660.
    expect(reveal(20, 0)).toBe(360);
  });

  it("treats a row hidden under the header as above the view", () => {
    // At scrollTop 40 the header covers content 40..70, and row 1 starts at 60.
    expect(reveal(1, 40)).toBe(30);
  });

  it("treats a row cut off at the bottom as below the view", () => {
    // Row 9 spans 300..330; with scrollTop 0 the viewport ends at 300.
    expect(reveal(9, 0)).toBe(30);
  });

  it("never asks for a negative offset", () => {
    expect(reveal(0, 5)).toBe(0);
  });
});
