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
  it("heads the page's own entries with a label-style group title, not a greyed entry", () => {
    const items = reviewMenuItems({ count: 2, canTick: true, canLeaveOut: false }, handlers);
    expect(items.some((item) => item.label === "This page")).toBe(false);
    const first = items.find((item) => item.id === "tick");
    expect(first?.groupTitle).toBe("This page");
    expect(items.filter((item) => item.groupTitle)).toHaveLength(1);
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

  it("starts with the same Play entries as every track menu, then a rule before Copy", () => {
    const items = reviewMenuItems({ count: 1, canTick: true, canLeaveOut: true }, handlers);
    expect(items.slice(0, 3).map((item) => item.label)).toEqual(["Play", "Play next", "Add to queue"]);
    expect(items.find((item) => item.label === "Copy")?.separatorBefore).toBe(true);
  });

  it("names Choose a match without an ellipsis: it opens a panel, not a dialog", () => {
    const items = reviewMenuItems({ count: 1, canTick: true, canLeaveOut: true }, handlers);
    expect(items.find((item) => item.id === "choose")?.label).toBe("Choose a match");
  });
});
