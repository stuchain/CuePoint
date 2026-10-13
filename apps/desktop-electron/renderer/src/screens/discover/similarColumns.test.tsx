/**
 * Similar's column order and its one-time move (DEC-NEW-K1).
 */
import { describe, expect, it } from "vitest";

import { reconcileLayout } from "../../components/table/columnLayout";
import { SIMILAR_COLUMNS, SIMILAR_PREVIOUS_DEFAULT_ORDER } from "./similarColumns";

describe("the previous order", () => {
  it("names exactly the columns there are now", () => {
    expect([...SIMILAR_PREVIOUS_DEFAULT_ORDER].sort()).toEqual(
      SIMILAR_COLUMNS.map((column) => column.id).sort(),
    );
  });

  it("moves a layout saved in it to the current order, keeping widths", () => {
    const saved = SIMILAR_PREVIOUS_DEFAULT_ORDER.map((id) => ({ id, width: 130, hidden: false }));
    const moved = reconcileLayout(saved, SIMILAR_COLUMNS, 1, SIMILAR_PREVIOUS_DEFAULT_ORDER);
    expect(moved.map((entry) => entry.id)).toEqual(SIMILAR_COLUMNS.map((column) => column.id));
  });
});
