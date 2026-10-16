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
});
