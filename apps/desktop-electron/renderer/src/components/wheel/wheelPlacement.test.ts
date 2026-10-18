import { describe, expect, it } from "vitest";

import { placeWheel, type Box } from "./wheelPlacement";

const win = { width: 1200, height: 800 };
const size = { width: 220, height: 300 };
const box = (left: number, top: number, width: number, height: number): Box => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe("where the wheel opens", () => {
  it("opens from the player just above the player bar, its left edge level with the button", () => {
    const bar = box(0, 720, 1200, 80);
    const button = box(400, 750, 30, 20);
    const at = placeWheel({ source: "player", anchor: button, bar, size, win });
    expect(at.left).toBe(400);
    expect(at.top + size.height).toBeLessThanOrEqual(bar.top);
    expect(at.top + size.height).toBeGreaterThanOrEqual(bar.top - 12);
    expect(at.maxHeight).toBeGreaterThanOrEqual(size.height);
  });

  it("is not in the window's top-left corner when the button is at the bottom left (regression)", () => {
    const bar = box(0, 720, 1200, 80);
    const at = placeWheel({ source: "player", anchor: box(300, 750, 30, 20), bar, size, win });
    expect(at.top).toBeGreaterThan(100);
    expect(at.left).toBeGreaterThan(100);
  });

  it("keeps a wheel from the player inside the window on the right", () => {
    const at = placeWheel({ source: "player", anchor: box(1180, 750, 30, 20), bar: box(0, 720, 1200, 80), size, win });
    expect(at.left + size.width).toBeLessThanOrEqual(win.width);
  });

  it("is capped to the room above the bar when the window is short", () => {
    const at = placeWheel({
      source: "player",
      anchor: box(300, 350, 30, 20),
      bar: box(0, 320, 1200, 80),
      size,
      win: { width: 1200, height: 400 },
    });
    expect(at.top).toBeGreaterThanOrEqual(0);
    expect(at.top + at.maxHeight).toBeLessThanOrEqual(320);
  });

  it("opens from Track details beside the key, level with its top, on the side with room", () => {
    const key = box(1000, 200, 30, 20);
    const at = placeWheel({ source: "details", anchor: key, bar: null, size, win });
    expect(at.left + size.width).toBeLessThanOrEqual(key.left);
    expect(at.top).toBe(200);
  });

  it("opens on the key's right when there is no room on its left", () => {
    const at = placeWheel({ source: "details", anchor: box(20, 200, 30, 20), bar: null, size, win });
    expect(at.left).toBeGreaterThanOrEqual(50);
  });

  it("slides up so a wheel from a low key stays in the window", () => {
    const at = placeWheel({ source: "details", anchor: box(1000, 700, 30, 20), bar: null, size, win });
    expect(at.top + size.height).toBeLessThanOrEqual(win.height);
  });

  it("with no opener known, sits at the window's top right", () => {
    const at = placeWheel({ source: "details", anchor: null, bar: null, size, win });
    expect(at.top).toBe(8);
    expect(at.left + size.width).toBeLessThanOrEqual(win.width);
  });
});
