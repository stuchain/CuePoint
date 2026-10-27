import { describe, expect, it, vi } from "vitest";

import {
  WINDOW_MIN_SIZE,
  captureWindowState,
  createWindowStateSaver,
  parseWindowState,
  placeWindow,
  type Rect,
  type WindowState,
} from "./windowSize";

describe("the window's smallest size", () => {
  it("is 1024 by 640", () => {
    expect(WINDOW_MIN_SIZE).toEqual({ minWidth: 1024, minHeight: 640 });
  });
});

const PRIMARY: Rect = { x: 0, y: 0, width: 1920, height: 1040 };
const LEFT: Rect = { x: -1920, y: 0, width: 1920, height: 1040 };

const state = (over: Partial<WindowState> = {}): WindowState => ({
  width: 1300,
  height: 850,
  x: 100,
  y: 60,
  maximized: false,
  ...over,
});

describe("the saved window state", () => {
  it("is a size, a place and whether it was maximised", () => {
    expect(parseWindowState({ width: 1300, height: 850, x: 100, y: 60, maximized: true })).toEqual(
      state({ maximized: true }),
    );
  });

  it("rounds to whole pixels", () => {
    expect(parseWindowState({ width: 1300.4, height: 850.6, x: 1.5, y: 2.2 })).toEqual(
      state({ width: 1300, height: 851, x: 2, y: 2 }),
    );
  });

  it("allows a place on a display to the left or above", () => {
    expect(parseWindowState({ width: 1300, height: 850, x: -1900, y: -20 })).toEqual(
      state({ x: -1900, y: -20 }),
    );
  });

  it("drops a place that has only one coordinate, keeping the size", () => {
    expect(parseWindowState({ width: 1300, height: 850, x: 5 })).toEqual(state({ x: null, y: null }));
  });

  it.each([
    null,
    "x",
    [],
    {},
    { width: 1300 },
    { width: 800, height: 850 },
    { width: 1300, height: 500 },
    { width: "1300", height: 850 },
    { width: Number.NaN, height: 850 },
    { width: 1e9, height: 850 },
  ])("is none for %j", (value) => {
    expect(parseWindowState(value)).toBeNull();
  });

  it("takes only a true as maximised", () => {
    expect(parseWindowState({ width: 1300, height: 850, maximized: "yes" })!.maximized).toBe(false);
  });
});

describe("where the window opens", () => {
  it("takes 80% of the work area on a first launch, in the middle", () => {
    expect(placeWindow(null, [PRIMARY], PRIMARY)).toEqual({ width: 1536, height: 832, maximized: false });
  });

  it("never opens under the smallest size on a small screen", () => {
    const small: Rect = { x: 0, y: 0, width: 1024, height: 728 };
    expect(placeWindow(null, [small], small)).toEqual({ width: 1024, height: 640, maximized: false });
  });

  it("goes back where it was, at its size", () => {
    expect(placeWindow(state(), [PRIMARY], PRIMARY)).toEqual({
      width: 1300,
      height: 850,
      x: 100,
      y: 60,
      maximized: false,
    });
  });

  it("goes back maximised when it was", () => {
    expect(placeWindow(state({ maximized: true }), [PRIMARY], PRIMARY).maximized).toBe(true);
  });

  it("goes back to a second display while it is there", () => {
    const placed = placeWindow(state({ x: -1800, y: 40 }), [LEFT, PRIMARY], PRIMARY);
    expect(placed).toMatchObject({ x: -1800, y: 40 });
  });

  it("opens centred on the primary display when its display has gone", () => {
    const placed = placeWindow(state({ x: -1800, y: 40 }), [PRIMARY], PRIMARY);
    expect(placed.x).toBeUndefined();
    expect(placed.y).toBeUndefined();
    expect(placed).toMatchObject({ width: 1300, height: 850 });
  });

  it("does not trust a place whose title bar is off the screen", () => {
    expect(placeWindow(state({ y: -400 }), [PRIMARY], PRIMARY).y).toBeUndefined();
    expect(placeWindow(state({ y: 1030 }), [PRIMARY], PRIMARY).y).toBeUndefined();
    expect(placeWindow(state({ x: 1900 }), [PRIMARY], PRIMARY).x).toBeUndefined();
  });

  it("brings a size bigger than the screen now is inside it", () => {
    const placed = placeWindow(state({ width: 3000, height: 2000, x: 0, y: 0 }), [PRIMARY], PRIMARY);
    expect(placed).toMatchObject({ width: 1920, height: 1040, x: 0, y: 0 });
  });

  it("keeps the smallest size even on a display smaller than it", () => {
    const tiny: Rect = { x: 0, y: 0, width: 800, height: 600 };
    expect(placeWindow(state(), [tiny], tiny)).toMatchObject({ width: 1024, height: 640 });
  });
});

describe("remembering the window", () => {
  const window_ = (over: { maximized?: boolean; bounds?: Rect } = {}) => ({
    getNormalBounds: () => over.bounds ?? { x: 100, y: 60, width: 1300, height: 850 },
    isMaximized: () => over.maximized ?? false,
  });

  it("captures the normal bounds, not the maximised ones", () => {
    expect(captureWindowState(window_({ maximized: true }))).toEqual(state({ maximized: true }));
  });

  it("captures nothing for a window smaller than the smallest", () => {
    expect(captureWindowState(window_({ bounds: { x: 0, y: 0, width: 300, height: 200 } }))).toBeNull();
  });

  it("writes once the window has been still, not on every resize", () => {
    const save = vi.fn();
    const timers: Array<() => void> = [];
    const cleared: unknown[] = [];
    const saver = createWindowStateSaver({
      window: window_(),
      save,
      setTimer: (run) => {
        timers.push(run);
        return timers.length - 1;
      },
      clearTimer: (t) => cleared.push(t),
    });
    saver.schedule();
    saver.schedule();
    saver.schedule();
    expect(save).not.toHaveBeenCalled();
    expect(cleared).toEqual([0, 1]);
    timers[2]!();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(state());
  });

  it("flushes at once on close, and cancels a pending write", () => {
    const save = vi.fn();
    const cleared: unknown[] = [];
    const saver = createWindowStateSaver({
      window: window_(),
      save,
      setTimer: () => 7,
      clearTimer: (t) => cleared.push(t),
    });
    saver.schedule();
    saver.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(cleared).toEqual([7]);
  });

  it("is not failed by a settings file that cannot be written, or a window that is gone", () => {
    const saver = createWindowStateSaver({
      window: window_(),
      save: () => {
        throw new Error("read-only");
      },
    });
    expect(() => saver.flush()).not.toThrow();
    const gone = createWindowStateSaver({
      window: {
        getNormalBounds: () => {
          throw new Error("Object has been destroyed");
        },
        isMaximized: () => false,
      },
      save: vi.fn(),
    });
    expect(() => gone.flush()).not.toThrow();
  });
});
