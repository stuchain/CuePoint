/**
 * The screens order rows the way `TrackTable` does, so the position a callback reports is the
 * position the screen sees (C193).
 */
import { describe, expect, it } from "vitest";

import { compareValues, sortedRows } from "./clientSort";

interface Row {
  name: string;
  bpm: number | null;
  key: string | null;
}

const ROWS: Row[] = [
  { name: "a", bpm: 128, key: "10B" },
  { name: "b", bpm: null, key: "8A" },
  { name: "c", bpm: 124, key: null },
  { name: "d", bpm: 128, key: "9A" },
];
const COLUMNS = [
  { id: "bpm", accessor: (row: Row) => row.bpm },
  { id: "key", accessor: (row: Row) => row.key },
  { id: "name" },
];
const names = (rows: readonly Row[]) => rows.map((row) => row.name).join("");

describe("compareValues", () => {
  it("puts empty values last in either direction", () => {
    expect(compareValues(null, 1, 1)).toBe(1);
    expect(compareValues(null, 1, -1)).toBe(1);
    expect(compareValues("", "a", -1)).toBe(1);
    expect(compareValues(null, undefined, 1)).toBe(0);
  });

  it("reads numbers by value and the numbers in words in order", () => {
    expect(compareValues(9, 10, 1)).toBeLessThan(0);
    expect(compareValues("9A", "10B", 1)).toBeLessThan(0);
    expect(compareValues("9A", "10B", -1)).toBeGreaterThan(0);
  });
});

describe("sortedRows", () => {
  it("orders by the column's accessor, ties in the given order", () => {
    expect(names(sortedRows(ROWS, COLUMNS, { key: "bpm", direction: "asc" }))).toBe("cadb");
    expect(names(sortedRows(ROWS, COLUMNS, { key: "bpm", direction: "desc" }))).toBe("adcb");
  });

  it("orders keys the way a person counts round the wheel's numbers", () => {
    expect(names(sortedRows(ROWS, COLUMNS, { key: "key", direction: "asc" }))).toBe("bdac");
  });

  it("leaves the rows as given with no sort or a column without an accessor", () => {
    expect(names(sortedRows(ROWS, COLUMNS, null))).toBe("abcd");
    expect(names(sortedRows(ROWS, COLUMNS, { key: "name", direction: "desc" }))).toBe("abcd");
  });
});
