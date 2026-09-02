/**
 * Inspector layout state (DEC-018).
 *
 * The clamping is the substance here. A width is stored in CSS pixels but the
 * window it was chosen in is not, so the interesting cases are all about a
 * stored value meeting a window that cannot honor it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clampInspectorWidth,
  INSPECTOR_DEFAULT_STATE,
  INSPECTOR_DEFAULT_WIDTH,
  INSPECTOR_MAX_FRACTION,
  INSPECTOR_MIN_WIDTH,
  INSPECTOR_STORAGE_KEY,
  inspectorMaxWidth,
  loadInspectorState,
  saveInspectorState,
} from "./inspectorState";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("clampInspectorWidth", () => {
  it("leaves a reasonable width alone", () => {
    expect(clampInspectorWidth(320, 1280)).toBe(320);
  });

  it("raises a width below the minimum", () => {
    expect(clampInspectorWidth(10, 1280)).toBe(INSPECTOR_MIN_WIDTH);
  });

  it("caps a width at half the window", () => {
    expect(clampInspectorWidth(2000, 1280)).toBe(1280 * INSPECTOR_MAX_FRACTION);
  });

  it("clamps a width stored on a wider monitor", () => {
    // The case a user actually hits: sized on a 2560px display, reopened on a
    // 1280px laptop. Without this the content area is pushed off-screen.
    expect(clampInspectorWidth(1200, 1280)).toBe(640);
  });

  it("keeps the minimum when the window is too narrow for it", () => {
    // The bounds cross below ~440px. A maximum that undercut the minimum would
    // collapse the panel to nothing.
    expect(inspectorMaxWidth(300)).toBe(INSPECTOR_MIN_WIDTH);
    expect(clampInspectorWidth(320, 300)).toBe(INSPECTOR_MIN_WIDTH);
  });

  it("rounds a fractional width", () => {
    expect(clampInspectorWidth(320.6, 1280)).toBe(321);
  });

  it("falls back to the default for a value that is not a number", () => {
    expect(clampInspectorWidth(Number.NaN, 1280)).toBe(INSPECTOR_DEFAULT_WIDTH);
    expect(clampInspectorWidth(Number.POSITIVE_INFINITY, 1280)).toBe(
      INSPECTOR_DEFAULT_WIDTH,
    );
  });
});

describe("loadInspectorState", () => {
  it("returns defaults when nothing is stored", () => {
    expect(loadInspectorState()).toEqual(INSPECTOR_DEFAULT_STATE);
  });

  it("round-trips a saved state", () => {
    saveInspectorState({ width: 400, visible: false });
    expect(loadInspectorState()).toEqual({ width: 400, visible: false });
  });

  it("does not clamp on read, so a width returns when there is room again", () => {
    // Storing the clamped value would shrink the panel permanently the first
    // time it was opened on a small screen.
    saveInspectorState({ width: 1200, visible: true });
    expect(loadInspectorState().width).toBe(1200);
  });

  it("survives malformed JSON", () => {
    localStorage.setItem(INSPECTOR_STORAGE_KEY, "{not json");
    expect(loadInspectorState()).toEqual(INSPECTOR_DEFAULT_STATE);
  });

  it("survives a stored value of the wrong shape", () => {
    localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({ width: "wide" }));
    expect(loadInspectorState().width).toBe(INSPECTOR_DEFAULT_WIDTH);
  });

  it("stays visible unless hiding was stored explicitly", () => {
    // A corrupt value should not make a whole region of the app disappear.
    localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({ width: 300 }));
    expect(loadInspectorState().visible).toBe(true);

    localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({ visible: false }));
    expect(loadInspectorState().visible).toBe(false);
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(loadInspectorState()).toEqual(INSPECTOR_DEFAULT_STATE);
    expect(() => saveInspectorState({ width: 300, visible: true })).not.toThrow();
  });
});
