import { describe, expect, it, vi } from "vitest";

import { reviewMenuItems } from "./reviewMenu";

const handlers = {
  onPlay: vi.fn(),
  onPlayNext: vi.fn(),
  onAddToQueue: vi.fn(),
  onCopy: vi.fn(),
  onReveal: null,
  onTick: vi.fn(),
  onLeaveOut: vi.fn(),
  onChoose: vi.fn(),
};

describe("the review menu", () => {
  it("sets the page's own entries off with a line, under no group title", () => {
    const items = reviewMenuItems({ count: 2, canTick: true, canLeaveOut: false }, handlers);
    expect(items.some((item) => item.label === "This page")).toBe(false);
    const first = items.find((item) => item.id === "tick");
    // Moved for M410: the "This page" heading named nothing to act on; only the separator is left.
    expect(first?.separatorBefore).toBe(true);
    expect(items.filter((item) => item.groupTitle)).toHaveLength(0);
  });

  it("gives a reason for each greyed entry", () => {
    const items = reviewMenuItems({ count: 2, canTick: false, canLeaveOut: false }, handlers);
    for (const id of ["tick", "leave-out", "choose"]) {
      const item = items.find((entry) => entry.id === id);
      expect(item?.disabled).toBe(true);
      expect(item?.reason).toBeTruthy();
    }
  });

  it("enables Tick to sync exactly when the selection bar offers it (C185)", () => {
    const on = reviewMenuItems({ count: 1, canTick: true, canLeaveOut: false }, handlers);
    const off = reviewMenuItems({ count: 1, canTick: false, canLeaveOut: true }, handlers);
    expect(on.find((item) => item.id === "tick")?.disabled).toBeFalsy();
    expect(off.find((item) => item.id === "tick")?.disabled).toBe(true);
    expect(off.find((item) => item.id === "leave-out")?.disabled).toBeFalsy();
  });

  it("is ordered as every track menu is: Play, the page's own block, then the More submenu with Copy", () => {
    const items = reviewMenuItems({ count: 1, canTick: true, canLeaveOut: true }, handlers);
    expect(items.slice(0, 3).map((item) => item.label)).toEqual(["Play", "Play next", "Add to queue"]);
    const ids = items.map((item) => item.id);
    expect(ids.indexOf("tick")).toBeGreaterThan(2);
    expect(ids.indexOf("tick")).toBeLessThan(ids.indexOf("choose"));
    const last = items[items.length - 1]!;
    expect(last.label).toBe("More");
    expect(last.items?.some((item) => item.label === "Copy as text")).toBe(true);
  });

  it("names Check the match without an ellipsis: it opens a panel, not a dialog", () => {
    const items = reviewMenuItems({ count: 1, canTick: true, canLeaveOut: true }, handlers);
    expect(items.find((item) => item.id === "choose")?.label).toBe("Check the match");
  });
});
