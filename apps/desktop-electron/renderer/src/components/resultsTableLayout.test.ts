import { describe, expect, it } from "vitest";
import {
  buildGridTemplateColumns,
  clampColumnWidths,
  clampFrameWidth,
  defaultColumnWidths,
  getFrameMaxWidth,
  stickyLeftOffset,
  totalTableWidth,
} from "./resultsTableLayout";

describe("resultsTableLayout", () => {
  it("builds pixel grid template from widths", () => {
    expect(buildGridTemplateColumns([80, 100, 120])).toBe("80px 100px 120px");
  });

  it("defaults to 14 scaled columns", () => {
    const widths = defaultColumnWidths(2);
    expect(widths).toHaveLength(14);
    expect(widths[1]).toBe(96); // Index: 48px * 2
    expect(widths[2]).toBeGreaterThanOrEqual(280); // Original Title wider default
  });

  it("clamps each column to its own minimum width", () => {
    expect(clampColumnWidths([20, 20, 200], 2)).toEqual([72, 96, 200]);
  });

  it("computes sticky offset from prior sticky column widths", () => {
    const widths = [80, 96, 140];
    expect(stickyLeftOffset(widths, 0)).toBe(0);
    expect(stickyLeftOffset(widths, 1)).toBe(80);
    expect(stickyLeftOffset(widths, 2)).toBe(176);
  });

  it("sums total table width", () => {
    expect(totalTableWidth([80, 80, 120])).toBe(280);
  });

  it("caps frame width at 80% of viewport", () => {
    expect(getFrameMaxWidth(1000)).toBe(800);
    expect(clampFrameWidth(900, 1000)).toBe(800);
    expect(clampFrameWidth(500, 1000)).toBe(500);
  });
});
