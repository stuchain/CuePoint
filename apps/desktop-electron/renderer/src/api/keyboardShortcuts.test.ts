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
