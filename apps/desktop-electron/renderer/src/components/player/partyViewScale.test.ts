import { describe, expect, it } from "vitest";

import { partyScale } from "./partyViewScale";

describe("the Party view's scale", () => {
  it("takes the largest whole multiple that fits both ways", () => {
    // 1000 x 700 at 1x: width allows 4 (928), height allows 5 (650): 4.
    expect(partyScale(1000, 700, 1)).toEqual({ multiple: 4, width: 928, height: 520 });
    // A short stage: height limits it. 600 / 130 = 4.6 -> 4 -> no overflow.
    expect(partyScale(1200, 300, 1)).toEqual({ multiple: 2, width: 464, height: 260 });
  });

  it("lands on whole device pixels at a fractional ratio", () => {
    const scale = partyScale(1000, 700, 1.5)!;
    // 1000 * 1.5 / 232 = 6.46 -> 6; width 6 * 232 / 1.5 = 928 CSS px = 1392 device px.
    expect(scale.multiple).toBe(6);
    expect(scale.width * 1.5).toBe(1392);
    expect(scale.height * 1.5).toBe(780);
    expect(scale.height).toBeLessThanOrEqual(700);
  });

  it("never exceeds the stage, and shrinks to fit when even 1x does not", () => {
    const scale = partyScale(200, 100, 1)!;
    expect(scale.multiple).toBe(0);
    expect(scale.width).toBeLessThanOrEqual(200);
    expect(scale.height).toBeLessThanOrEqual(100);
    expect(scale.width / scale.height).toBeCloseTo(232 / 130);
  });

  it("returns null when nothing is measured, and treats a bad ratio as 1", () => {
    expect(partyScale(0, 500, 1)).toBeNull();
    expect(partyScale(500, Number.NaN, 1)).toBeNull();
    expect(partyScale(500, 500, 0)).toEqual(partyScale(500, 500, 1));
  });
});
