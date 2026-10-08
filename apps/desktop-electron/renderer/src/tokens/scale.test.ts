import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SCALE, SCALE_OPTIONS, getStoredScale, hasStoredScale } from "./scale";

const KEY = "cuepoint-ui-lab-scale";

afterEach(() => localStorage.clear());

describe("the stored scale", () => {
  it("offers 1, 1.5, 2 and 3, and opens at 1.5", () => {
    expect([...SCALE_OPTIONS]).toEqual([1, 1.5, 2, 3]);
    expect(DEFAULT_SCALE).toBe(1.5);
  });

  it("is 1.5 with nothing stored", () => {
    expect(getStoredScale()).toBe(1.5);
  });

  it("reads a stored 1.5 as 1.5, not 1", () => {
    localStorage.setItem(KEY, "1.5");
    expect(getStoredScale()).toBe(1.5);
  });

  it.each(["1", "2", "3"])("keeps a stored %s", (value) => {
    localStorage.setItem(KEY, value);
    expect(getStoredScale()).toBe(Number(value));
  });

  it.each(["2.5", "abc", "", "0", "-1"])("reads %j as the default", (value) => {
    localStorage.setItem(KEY, value);
    expect(getStoredScale()).toBe(1.5);
  });
});

describe("whether a size was ever chosen (DEC-207)", () => {
  it("is false with nothing stored, and true once a size is stored", () => {
    expect(hasStoredScale()).toBe(false);
    localStorage.setItem(KEY, "2");
    expect(hasStoredScale()).toBe(true);
  });

  it("counts a stored 1.5 as chosen: it was picked, not left alone", () => {
    localStorage.setItem(KEY, "1.5");
    expect(hasStoredScale()).toBe(true);
  });

  it("is false when storage throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    expect(hasStoredScale()).toBe(false);
    spy.mockRestore();
  });
});
