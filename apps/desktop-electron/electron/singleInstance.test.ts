import { describe, expect, it, vi } from "vitest";

import { enforceSingleInstance, onlyIfFirst, type SingleInstanceApp, type SingleInstanceWindow } from "./singleInstance";

/**
 * One copy of CuePoint at a time (DIST-06, Phase 16 fact 8).
 *
 * A second copy, started while the first installs an update, would hold the
 * files the installer replaces and run a second engine on the same library.
 */

function fakeApp(lock: boolean) {
  const listeners = new Map<string, () => void>();
  const app = {
    requestSingleInstanceLock: vi.fn(() => lock),
    exit: vi.fn(),
    on: vi.fn((event: "second-instance", listener: () => void) => {
      listeners.set(event, listener);
    }),
  } satisfies SingleInstanceApp;
  return { app, listeners };
}

function fakeWindow(minimized: boolean): SingleInstanceWindow & {
  restore: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
} {
  return {
    isMinimized: () => minimized,
    restore: vi.fn(),
    focus: vi.fn(),
    show: vi.fn(),
    isDestroyed: () => false,
  } as never;
}

describe("a second instance", () => {
  it("exits at once, without running quit handlers, and says the caller must not start anything", () => {
    const { app } = fakeApp(false);
    expect(enforceSingleInstance(app, () => null)).toBe(false);
    expect(app.exit).toHaveBeenCalledWith(0);
    expect(app.exit).toHaveBeenCalledTimes(1);
    expect(app.on).not.toHaveBeenCalled();
  });
});

describe("the first instance", () => {
  it("carries on and does not quit", () => {
    const { app } = fakeApp(true);
    expect(enforceSingleInstance(app, () => null)).toBe(true);
    expect(app.exit).not.toHaveBeenCalled();
  });

  it("restores a minimized window and focuses it when a second copy starts", () => {
    const { app, listeners } = fakeApp(true);
    const win = fakeWindow(true);
    enforceSingleInstance(app, () => win);
    listeners.get("second-instance")!();
    expect(win.restore).toHaveBeenCalledTimes(1);
    expect(win.focus).toHaveBeenCalledTimes(1);
  });

  it("only focuses a window that is not minimized", () => {
    const { app, listeners } = fakeApp(true);
    const win = fakeWindow(false);
    enforceSingleInstance(app, () => win);
    listeners.get("second-instance")!();
    expect(win.restore).not.toHaveBeenCalled();
    expect(win.focus).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is no window yet", () => {
    const { app, listeners } = fakeApp(true);
    enforceSingleInstance(app, () => null);
    expect(() => listeners.get("second-instance")!()).not.toThrow();
  });
});

describe("work that starts things", () => {
  it("runs in the first instance", () => {
    const work = vi.fn();
    onlyIfFirst(true, work)("a", 1);
    expect(work).toHaveBeenCalledWith("a", 1);
  });

  it("does nothing in a second instance, however often it is called", () => {
    const { app } = fakeApp(false);
    const first = enforceSingleInstance(app, () => null);
    const createWindow = vi.fn();
    const guarded = onlyIfFirst(first, createWindow);
    guarded();
    guarded();
    expect(createWindow).not.toHaveBeenCalled();
  });
});
