import { describe, expect, it } from "vitest";
import { filterShortcuts, KEYBOARD_SHORTCUTS } from "./keyboardShortcuts";

describe("keyboardShortcuts", () => {
  it("filters by action name", () => {
    const rows = filterShortcuts(KEYBOARD_SHORTCUTS, "export");
    expect(rows.some((r) => r.action.includes("Export"))).toBe(true);
  });

  it("returns all when query empty", () => {
    expect(filterShortcuts(KEYBOARD_SHORTCUTS, "")).toHaveLength(KEYBOARD_SHORTCUTS.length);
  });
});

describe("the Library's shortcuts (LIBUI-10)", () => {
  it("documents the two the page binds", () => {
    const library = KEYBOARD_SHORTCUTS.filter((row) => row.context === "Library");

    expect(library.map((row) => row.shortcut).sort()).toEqual(["Ctrl+A", "Ctrl+F"]);
  });

  it("means the same thing by Ctrl+F as the Results screen does", () => {
    // Two contexts, one gesture: put the cursor where the narrowing happens.
    // If these ever diverged, the shortcuts dialog would list one key twice
    // with two different sentences.
    const focus = KEYBOARD_SHORTCUTS.filter((row) => row.shortcut === "Ctrl+F");

    expect(focus.map((row) => row.context).sort()).toEqual(["Library", "Results"]);
    expect(new Set(focus.map((row) => row.action)).size).toBe(1);
  });
});
