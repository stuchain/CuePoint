import { describe, expect, it } from "vitest";
import { DEFAULT_SORT_COLUMN, RESULTS_COLUMNS } from "./resultsColumns";

describe("resultsColumns", () => {
  it("defines 14 Qt-aligned columns", () => {
    expect(RESULTS_COLUMNS).toHaveLength(14);
    expect(RESULTS_COLUMNS.map((c) => c.colIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it("defaults sort to Index column", () => {
    expect(DEFAULT_SORT_COLUMN).toBe(1);
    expect(RESULTS_COLUMNS.find((c) => c.colIndex === DEFAULT_SORT_COLUMN)?.label).toBe("Index");
  });

  it("marks Write and Index as sticky", () => {
    const sticky = RESULTS_COLUMNS.filter((c) => c.sticky).map((c) => c.id);
    expect(sticky).toEqual(["write", "index"]);
  });
});
