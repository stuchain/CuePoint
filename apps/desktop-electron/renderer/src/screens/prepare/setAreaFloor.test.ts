import { describe, expect, it } from "vitest";

import { ROWS_KEPT, setAreaFloor } from "./setAreaFloor";

/**
 * The Set keeps two whole rows under the lanes and the strip (WAVE-07): the
 * area's floor is what sits above the rows, the table's header and two rows.
 */
describe("setAreaFloor", () => {
  it("is nothing with nothing above the rows: DEC-112's floor stands alone", () => {
    expect(setAreaFloor([], 66, 36)).toBeNull();
  });

  it("is what is above, the table's header and edges, and two rows", () => {
    expect(ROWS_KEPT).toBe(2);
    // The strip at scale 2: three rows of 36 and its edge; the table's header.
    // (The chrome is the header, its borders and a scrollbar; 66 here.)
    expect(setAreaFloor([114], 66, 36)).toBe(114 + 66 + 72);
    // The lanes and the strip together.
    expect(setAreaFloor([80, 114], 66, 36)).toBe(80 + 114 + 66 + 72);
  });

  it("rounds up to a whole pixel, and reads a negative height as none", () => {
    expect(setAreaFloor([113.2], 66.5, 36)).toBe(252);
    expect(setAreaFloor([-5], -1, 36)).toBe(72);
  });
});
