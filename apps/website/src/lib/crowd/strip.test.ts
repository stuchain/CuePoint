import { afterEach, describe, expect, it, vi } from "vitest";
import { fits, layoutFor, mountStrip, readScale, STRIP_HEIGHT, STRIP_ROWS } from "./strip";

describe("the strip's size", () => {
  it("reads the scale CSS gives it, a whole number, 3 when it cannot", () => {
    expect(readScale("4")).toBe(4);
    expect(readScale(" 3 ")).toBe(3);
    expect(readScale("")).toBe(3);
    expect(readScale("2.5")).toBe(3);
    expect(readScale("0")).toBe(3);
  });

  it("has a logical canvas that covers the width in whole pixels, and a CSS size that is a whole multiple of it", () => {
    for (const [width, scale] of [[390, 3], [1440, 4], [320, 3]] as const) {
      const l = layoutFor(width, String(scale));
      expect(l).not.toBeNull();
      expect(l!.w * scale).toBeGreaterThanOrEqual(width);
      expect((l!.w - 1) * scale).toBeLessThan(width);
      expect(l!.h).toBe(STRIP_HEIGHT);
      expect(l!.cssWidth).toBe(l!.w * scale);
      expect(l!.cssHeight).toBe(STRIP_HEIGHT * scale);
    }
  });

  it("has no layout for a box with no width", () => {
    expect(layoutFor(0, "3")).toBeNull();
  });

  it("has three rows of dancers", () => {
    expect(STRIP_ROWS).toBe(3);
  });
});

describe("where the strip may stand", () => {
  it("fits only wholly below the copy", () => {
    expect(fits({ top: 600 }, { bottom: 500 })).toBe(true);
    expect(fits({ top: 600 }, { bottom: 600 })).toBe(true);
    expect(fits({ top: 600 }, { bottom: 601 })).toBe(false);
    expect(fits({ top: 600 }, null)).toBe(true);
  });
});

/** A page just real enough for mountStrip: a canvas that records, and the browser's signals. */
function world(opts: { reduced?: boolean; saveData?: boolean; hidden?: boolean; width?: number; scale?: string; copyBottom?: number } = {}) {
  const draws: number[] = [];
  const raf: Array<(t: number) => void> = [];
  let width = opts.width ?? 390;
  let scale = opts.scale ?? "3";
  const mq = { matches: opts.reduced ?? false, listeners: [] as Array<() => void> };
  const resize: Array<() => void> = [];
  const ctx = { fillStyle: "", clearRect: () => undefined, fillRect: () => void draws.push(0) };
  const attrs: Record<string, string> = {};
  const host = {
    clientWidth: width,
    getBoundingClientRect: () => ({ top: 600 }),
    getAttribute: (k: string) => attrs[k] ?? null,
    setAttribute: (k: string, v: string) => void (attrs[k] = v),
  };
  const canvas = {
    width: 1,
    height: 1,
    style: {} as Record<string, string>,
    parentElement: host,
    getContext: () => ctx,
  };
  vi.stubGlobal("getComputedStyle", () => ({ getPropertyValue: () => scale }));
  vi.stubGlobal("matchMedia", () => ({ get matches() { return mq.matches; }, addEventListener: (_: string, f: () => void) => void mq.listeners.push(f) }));
  vi.stubGlobal("navigator", { connection: { saveData: opts.saveData ?? false } });
  vi.stubGlobal("document", {
    visibilityState: opts.hidden ? "hidden" : "visible",
    addEventListener: () => undefined,
    querySelector: () => (opts.copyBottom === undefined ? null : { getBoundingClientRect: () => ({ bottom: opts.copyBottom }) }),
  });
  vi.stubGlobal("addEventListener", () => undefined);
  vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => raf.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  vi.stubGlobal("ResizeObserver", class { constructor(f: () => void) { resize.push(f); } observe() {} });
  vi.stubGlobal("IntersectionObserver", class { observe() {} });
  return {
    canvas: canvas as unknown as HTMLCanvasElement,
    host,
    draws,
    raf,
    mq,
    resize: () => resize.forEach((f) => f()),
    setWidth: (w: number) => void (width = host.clientWidth = w),
    setScale: (s: string) => void (scale = s),
    state: () => attrs["data-state"],
    cleanup: () => undefined,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("mounting the strip", () => {
  it("runs a loop on a normal page", () => {
    const w = world();
    expect(mountStrip(w.canvas)).not.toBeNull();
    expect(w.raf.length).toBe(1);
    expect(w.state()).toBe("running");
  });

  it("passes reduced motion to the loop: one frame, none scheduled", () => {
    const w = world({ reduced: true });
    mountStrip(w.canvas);
    expect(w.raf.length).toBe(0);
    expect(w.draws.length).toBeGreaterThan(0);
    expect(w.state()).toBe("still");
  });

  it("passes saveData to the loop: one frame, none scheduled", () => {
    const w = world({ saveData: true });
    mountStrip(w.canvas);
    expect(w.raf.length).toBe(0);
    expect(w.draws.length).toBeGreaterThan(0);
  });

  it("passes a hidden tab to the loop: nothing scheduled", () => {
    const w = world({ hidden: true });
    mountStrip(w.canvas);
    expect(w.raf.length).toBe(0);
  });

  it("stops at once when reduced motion turns on, with one still frame", () => {
    const w = world();
    mountStrip(w.canvas);
    const before = w.draws.length;
    w.mq.matches = true;
    w.mq.listeners.forEach((f) => f());
    expect(w.draws.length).toBeGreaterThan(before);
    expect(w.state()).toBe("still");
    const frames = w.draws.length;
    w.raf.splice(0).forEach((cb) => cb(100));
    expect(w.draws.length).toBe(frames);
  });

  it("sizes the canvas in whole pixels: CSS width is the logical width times the scale", () => {
    const w = world({ width: 390 });
    mountStrip(w.canvas);
    expect(w.canvas.width).toBe(130);
    expect(w.canvas.style["width"]).toBe("390px");
    expect(w.canvas.style["height"]).toBe(`${STRIP_HEIGHT * 3}px`);
  });

  it("rebuilds when the scale changes (a window crossing 40rem), even at the same width", () => {
    const w = world({ width: 400, scale: "3" });
    mountStrip(w.canvas);
    expect(w.canvas.width).toBe(134);
    w.setScale("4");
    w.resize();
    expect(w.canvas.width).toBe(100);
    expect(w.canvas.style["width"]).toBe("400px");
    expect(w.canvas.style["height"]).toBe(`${STRIP_HEIGHT * 4}px`);
  });

  it("rebuilds when the width changes", () => {
    const w = world({ width: 390 });
    mountStrip(w.canvas);
    w.setWidth(600);
    w.resize();
    expect(w.canvas.width).toBe(200);
  });

  it("does nothing for a box with no width, and starts when it has one", () => {
    const w = world({ width: 0 });
    mountStrip(w.canvas);
    expect(w.canvas.width).toBe(1);
    w.setWidth(390);
    w.resize();
    expect(w.canvas.width).toBe(130);
  });

  it("hides the strip and stops the loop where it would sit on the copy", () => {
    const w = world({ copyBottom: 700 });
    mountStrip(w.canvas);
    expect(w.state()).toBe("hidden");
    expect(w.raf.length).toBe(0);
  });
});
