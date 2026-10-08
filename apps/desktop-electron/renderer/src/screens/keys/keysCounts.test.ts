import { describe, expect, it } from "vitest";

import { barPercent, countsByCode } from "./keysCounts";

describe("the Keys page's counts (PAGES-16)", () => {
  it("maps each code to its count", () => {
    const map = countsByCode([
      { code: "8A", count: 12 },
      { code: "9A", count: 3 },
    ]);
    expect(map.get("8A")).toBe(12);
    expect(map.get("1B")).toBeUndefined();
  });

  it("draws the biggest count as a full bar and the rest in proportion, never empty", () => {
    expect(barPercent(12, 12)).toBe(100);
    expect(barPercent(6, 12)).toBe(50);
    expect(barPercent(1, 1000)).toBeGreaterThan(0);
    expect(barPercent(0, 12)).toBe(0);
    expect(barPercent(3, 0)).toBe(0);
  });
});
