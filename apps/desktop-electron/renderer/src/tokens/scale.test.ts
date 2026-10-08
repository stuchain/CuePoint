import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_SCALE, SCALE_OPTIONS, getStoredScale } from "./scale";

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
