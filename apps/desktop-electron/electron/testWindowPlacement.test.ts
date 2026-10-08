import { describe, expect, it } from "vitest";

import {
  displayChoice,
  testWindowOptions,
  testWindowPlacement,
  type DisplayLike,
} from "./testWindowPlacement";

/**
 * Where an end-to-end run puts the window: the display it names, centred, and
 * nothing at all unless it is asked.
 */

const display = (x: number, y: number, width: number, height: number): DisplayLike => ({
  workArea: { x, y, width, height },
});

// A 1080p monitor left of a primary 1440p one, its top lower down.
const LEFT = display(-1920, 200, 1920, 1040);
const PRIMARY = display(0, 0, 2560, 1400);
const SIZE = { width: 1280, height: 800 };

describe("displayChoice", () => {
  it("reads left, right and primary, in any case", () => {
    expect(displayChoice("left")).toBe("left");
    expect(displayChoice(" Right ")).toBe("right");
    expect(displayChoice("PRIMARY")).toBe("primary");
  });

  it("is nothing when unset or not understood", () => {
    expect(displayChoice(undefined)).toBeNull();
    expect(displayChoice("")).toBeNull();
    expect(displayChoice("2")).toBeNull();
  });
});

describe("testWindowPlacement", () => {
  it("centres the window on the leftmost display", () => {
    expect(testWindowPlacement("left", [PRIMARY, LEFT], PRIMARY, SIZE)).toEqual({
      x: -1920 + 320,
      y: 200 + 120,
    });
  });

  it("centres it on the rightmost or the primary display", () => {
    expect(testWindowPlacement("right", [PRIMARY, LEFT], PRIMARY, SIZE)).toEqual({ x: 640, y: 300 });
    expect(testWindowPlacement("primary", [PRIMARY, LEFT], PRIMARY, SIZE)).toEqual({ x: 640, y: 300 });
  });

  it("puts it at the corner of a display too small for it", () => {
    const small = display(-1024, 0, 1024, 768);
    expect(testWindowPlacement("left", [PRIMARY, small], PRIMARY, SIZE)).toEqual({ x: -1024, y: 0 });
  });

  it("uses the primary display when it is the only one", () => {
    expect(testWindowPlacement("left", [PRIMARY], PRIMARY, SIZE)).toEqual({ x: 640, y: 300 });
    expect(testWindowPlacement("left", [], PRIMARY, SIZE)).toEqual({ x: 640, y: 300 });
  });
});

describe("testWindowOptions", () => {
  it("shows the window later and keeps its size on a screen smaller than it", () => {
    // Regression: a CI Mac's 1024x768 screen shrank the window to 1024x677.
    expect(testWindowOptions({ x: 0, y: 0 })).toEqual({
      x: 0,
      y: 0,
      show: false,
      enableLargerThanScreen: true,
    });
  });
});
