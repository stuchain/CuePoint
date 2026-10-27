/**
 * Inspector layout state (DEC-018).
 *
 * The clamping is the substance here. A width is stored in 1× units (R2-4,
 * DEC-273) but the window it was chosen in does not scale, so the interesting cases are all about a
 * stored value meeting a window that cannot honor it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { NAV_DESTINATIONS } from "./navRegistry";
import {
  INSPECTOR_DEFAULT_STATE,
  INSPECTOR_DEFAULT_WIDTH,
  INSPECTOR_STORAGE_KEY,
  inspectorMaxWidth,
  inspectorVisible,
  withInspectorChoice,
  inspectorWidthPx,
  loadInspectorState,
  saveInspectorState,
} from "./inspectorState";

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("inspectorWidthPx (R2-4)", () => {
  it("draws the default as 213 at 1×, 320 at 1.5× and 426 at 2×", () => {
    expect(inspectorWidthPx(INSPECTOR_DEFAULT_WIDTH, 1, 2560)).toBe(213);
    expect(inspectorWidthPx(INSPECTOR_DEFAULT_WIDTH, 1.5, 2560)).toBe(320);
    expect(inspectorWidthPx(INSPECTOR_DEFAULT_WIDTH, 2, 2560)).toBe(426);
  });

  it("raises a width below the minimum, at each size", () => {
    expect(inspectorWidthPx(10, 1, 2560)).toBe(147);
    expect(inspectorWidthPx(10, 1.5, 2560)).toBe(Math.round(147 * 1.5));
    expect(inspectorWidthPx(10, 2, 2560)).toBe(294);
    expect(inspectorWidthPx(10, 3, 2560)).toBe(441);
  });

  it("caps a width at half the window, in real pixels", () => {
    for (const scale of [1, 1.5, 2, 3]) {
      expect(inspectorWidthPx(5000, scale, 1280)).toBe(640);
    }
  });

  it("keeps the minimum when the window is too narrow for it", () => {
    expect(inspectorMaxWidth(200, 1)).toBe(147);
    expect(inspectorMaxWidth(300, 2)).toBe(294);
    expect(inspectorWidthPx(213, 2, 300)).toBe(294);
  });

  it("leaves the page's table its room: a reserve caps the width to what is left, never below the minimum (M71, D11)", () => {
    // 1280 wide, 840 reserved for the sidebar and the table: 440 for the panel.
    expect(inspectorWidthPx(5000, 1.5, 1280, 840)).toBe(440);
    // A reserve bigger than the window still leaves the panel its minimum.
    expect(inspectorWidthPx(213, 1.5, 1000, 900)).toBe(221);
    // No reserve, no change.
    expect(inspectorWidthPx(213, 1.5, 1280)).toBe(320);
  });

  it("rounds a fractional width", () => {
    expect(inspectorWidthPx(213.4, 1, 2560)).toBe(213);
  });

  it("falls back to the default for a value that is not a number", () => {
    expect(inspectorWidthPx(Number.NaN, 2, 2560)).toBe(426);
  });
});

describe("loadInspectorState", () => {
  it("returns defaults, marked 1×, when nothing is stored", () => {
    expect(loadInspectorState(1.5)).toEqual(INSPECTOR_DEFAULT_STATE);
    expect(INSPECTOR_DEFAULT_STATE.unit).toBe("1x");
  });

  it("round-trips a saved state", () => {
    saveInspectorState({ width: 400, choice: { library: "closed" }, unit: "1x" });
    expect(loadInspectorState(2)).toEqual({ width: 400, choice: { library: "closed" }, unit: "1x" });
  });

  it("does not clamp on read, so a width returns when there is room again", () => {
    saveInspectorState({ width: 1200, choice: {}, unit: "1x" });
    expect(loadInspectorState(1.5).width).toBe(1200);
  });

  it("divides a legacy pixel width by the current scale once and saves it marked", () => {
    localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({ width: 480, visible: true }));
    expect(loadInspectorState(1.5)).toEqual({ width: 320, choice: {}, unit: "1x" });
    expect(JSON.parse(localStorage.getItem(INSPECTOR_STORAGE_KEY) ?? "{}")).toEqual({
      width: 320,
      choice: {},
      unit: "1x",
    });
    // A second load, at another size, does not divide again.
    expect(loadInspectorState(3).width).toBe(320);
  });

  it("treats a legacy 320 as the old default, so it follows the scale", () => {
    localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({ width: 320, visible: true }));
    const state = loadInspectorState(2);
    expect(state.width).toBe(INSPECTOR_DEFAULT_WIDTH);
    expect(inspectorWidthPx(state.width, 2, 2560)).toBe(426);
  });

  it("divides a legacy 400 at 2x to 200", () => {
    localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({ width: 400, visible: true }));
    expect(loadInspectorState(2).width).toBe(200);
  });

  it("survives malformed JSON", () => {
    localStorage.setItem(INSPECTOR_STORAGE_KEY, "{not json");
    expect(loadInspectorState(1.5)).toEqual(INSPECTOR_DEFAULT_STATE);
  });

  it("survives a stored value of the wrong shape", () => {
    localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({ width: "wide" }));
    expect(loadInspectorState(1.5).width).toBe(INSPECTOR_DEFAULT_WIDTH);
  });

  describe("visibility is a per-page choice (K1, DEC-280)", () => {
    const pageIds = NAV_DESTINATIONS.map((destination) => destination.id);

    it("turns a stored hidden panel into a closed choice on every page", () => {
      localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({ visible: false, unit: "1x" }));
      const { choice } = loadInspectorState(1.5);
      expect(Object.keys(choice).sort()).toEqual([...pageIds].sort());
      expect(Object.values(choice).every((value) => value === "closed")).toBe(true);
    });

    it("turns a stored visible panel, or none, into no choice at all", () => {
      localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({ visible: true, unit: "1x" }));
      expect(loadInspectorState(1.5).choice).toEqual({});
      localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({ width: 300, unit: "1x" }));
      expect(loadInspectorState(1.5).choice).toEqual({});
    });

    it("saves the migrated state without a visible flag", () => {
      localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({ width: 480, visible: false }));
      loadInspectorState(1.5);
      const saved = JSON.parse(localStorage.getItem(INSPECTOR_STORAGE_KEY) ?? "{}");
      expect(saved.visible).toBeUndefined();
      expect(saved.choice.library).toBe("closed");
    });

    it("keeps a stored choice map, dropping entries that are not open or closed", () => {
      localStorage.setItem(
        INSPECTOR_STORAGE_KEY,
        JSON.stringify({ unit: "1x", choice: { library: "open", clean: "closed", keys: "maybe", prepare: 3 } }),
      );
      expect(loadInspectorState(1.5).choice).toEqual({ library: "open", clean: "closed" });
    });

    it.each([["nope"], [["open"]], [null], [7]])("reads a corrupt choice map (%j) as empty", (choice) => {
      localStorage.setItem(INSPECTOR_STORAGE_KEY, JSON.stringify({ unit: "1x", choice }));
      expect(loadInspectorState(1.5).choice).toEqual({});
    });

    it("follows the selection when the page has made no choice", () => {
      const state = INSPECTOR_DEFAULT_STATE;
      expect(inspectorVisible(state, "library", true, true)).toBe(true);
      expect(inspectorVisible(state, "library", false, true)).toBe(false);
    });

    it("never opens by itself on a page that does not allow it", () => {
      expect(inspectorVisible(INSPECTOR_DEFAULT_STATE, "discover", true, false)).toBe(false);
    });

    it("lets a stored choice win over the selection, either way", () => {
      const closed = withInspectorChoice(INSPECTOR_DEFAULT_STATE, "library", false);
      const open = withInspectorChoice(INSPECTOR_DEFAULT_STATE, "library", true);
      expect(inspectorVisible(closed, "library", true, true)).toBe(false);
      expect(inspectorVisible(open, "library", false, true)).toBe(true);
      expect(inspectorVisible(open, "discover", true, false)).toBe(false);
    });

    it("keeps one page's choice from reaching another", () => {
      const state = withInspectorChoice(INSPECTOR_DEFAULT_STATE, "library", false);
      expect(state.choice).toEqual({ library: "closed" });
      expect(inspectorVisible(state, "clean", true, true)).toBe(true);
    });
  });

  it("survives storage that throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });

    expect(loadInspectorState(1.5)).toEqual(INSPECTOR_DEFAULT_STATE);
    expect(() => saveInspectorState({ width: 300, choice: {}, unit: "1x" })).not.toThrow();
  });
});
