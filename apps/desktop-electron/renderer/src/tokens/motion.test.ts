import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MOTION_DEFAULTS,
  MOTION_GROUPS,
  MOTION_KINDS,
  MOTION_STORAGE_KEY,
  clearStoredMotion,
  readMotion,
  readMotionOverrides,
  writeMotionOverrides,
} from "./motion";

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("the ten kinds", () => {
  it("are in order with stable ids", () => {
    expect(MOTION_KINDS.map((k) => k.id)).toEqual([
      "micro",
      "interaction",
      "state",
      "page",
      "entrance",
      "hover",
      "scroll",
      "loading",
      "shared",
      "feedback",
    ]);
  });

  it("sit in three plain groups, feedback under 'When things change'", () => {
    expect(MOTION_GROUPS.map((g) => [g.title, g.kinds.map((k) => k.id)])).toEqual([
      ["When you act", ["micro", "interaction", "hover"]],
      ["When things change", ["state", "entrance", "page", "shared", "feedback"]],
      ["While you wait or scroll", ["loading", "scroll"]],
    ]);
  });

  it("have plain labels and a description each, with no engine or job", () => {
    const labels = MOTION_KINDS.map((k) => k.label);
    expect(labels).toContain("Button presses");
    expect(labels).toContain("Opening and closing panels and dialogs");
    for (const kind of MOTION_KINDS) {
      expect(kind.description.length).toBeGreaterThan(10);
      expect(`${kind.label} ${kind.description}`).not.toMatch(/\b(engine|job)\b/i);
    }
  });

  it("all default to on", () => {
    expect(Object.keys(MOTION_DEFAULTS)).toHaveLength(10);
    expect(Object.values(MOTION_DEFAULTS).every((v) => v === true)).toBe(true);
  });
});

describe("the stored value", () => {
  it("reads the defaults when nothing is stored", () => {
    expect(readMotion()).toEqual(MOTION_DEFAULTS);
    expect(readMotionOverrides()).toEqual({});
  });

  it("merges a partial value over the defaults", () => {
    localStorage.setItem(MOTION_STORAGE_KEY, JSON.stringify({ hover: false }));
    expect(readMotion()).toEqual({ ...MOTION_DEFAULTS, hover: false });
  });

  it.each([
    ["corrupt JSON", "{nope"],
    ["an array", "[true]"],
    ["null", "null"],
    ["a string", '"x"'],
    ["a number", "4"],
  ])("reads the defaults for %s", (_name, raw) => {
    localStorage.setItem(MOTION_STORAGE_KEY, raw);
    expect(readMotion()).toEqual(MOTION_DEFAULTS);
  });

  it("ignores unknown keys and non-boolean values", () => {
    localStorage.setItem(
      MOTION_STORAGE_KEY,
      JSON.stringify({ bogus: false, micro: "no", page: 0, scroll: false }),
    );
    expect(readMotion()).toEqual({ ...MOTION_DEFAULTS, scroll: false });
    expect(readMotionOverrides()).toEqual({ scroll: false });
  });

  it("writes only what it is given and clears", () => {
    writeMotionOverrides({ page: false });
    expect(JSON.parse(localStorage.getItem(MOTION_STORAGE_KEY)!)).toEqual({ page: false });
    clearStoredMotion();
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBeNull();
  });

  it("starts, and does not throw, when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(readMotion()).toEqual(MOTION_DEFAULTS);
    expect(() => writeMotionOverrides({ page: false })).not.toThrow();
    expect(() => clearStoredMotion()).not.toThrow();
  });
});
