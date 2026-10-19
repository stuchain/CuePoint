import { describe, expect, it } from "vitest";

import { barPercent, countsByCode, keysListRows } from "./keysCounts";

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

describe("the counts list's rows (C258)", () => {
  it("ends the list with one more row for the tracks with no key, clickable like the others", () => {
    const rows = keysListRows(
      [
        { code: "8A", count: 12 },
        { code: "9A", count: 3 },
      ],
      47,
    );
    expect(rows.map((row) => row.kind)).toEqual(["key", "key", "none"]);
    expect(rows.at(-1)).toMatchObject({ kind: "none", count: 47, code: null });
  });

  it("measures every bar, the no-key row's too, against the biggest of all of them", () => {
    const rows = keysListRows([{ code: "8A", count: 10 }], 40);
    expect(rows[0]!.percent).toBe(25);
    expect(rows[1]!.percent).toBe(100);
  });

  it("keeps the no-key row at 0, so the list never changes shape", () => {
    const rows = keysListRows([{ code: "8A", count: 10 }], 0);
    expect(rows.at(-1)).toMatchObject({ kind: "none", count: 0, percent: 0 });
  });
});
