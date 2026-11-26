import { describe, expect, it } from "vitest";

import { partyScale } from "./partyViewScale";

describe("the Party view's scale", () => {
  it("fills the stage both ways: whole-pixel scale, club as big as the stage at that scale", () => {
    // 1000 x 700 at 1x: width allows 4x (232 * 4 = 928), height 5x: 4x. 1000 / 4 = 250 across, 700 / 4 = 175 down.
    expect(partyScale(1000, 700, 1)).toEqual({ multiple: 4, logicalWidth: 250, logicalHeight: 175, width: 1000, height: 700 });
    // A wide stage: height sets 5x (650 px) with 330 across and 140 down.
    expect(partyScale(1650, 700, 1)).toEqual({ multiple: 5, logicalWidth: 330, logicalHeight: 140, width: 1650, height: 700 });
    // A short wide stage: 2x, a wide floor.
    expect(partyScale(1200, 300, 1)).toEqual({ multiple: 2, logicalWidth: 600, logicalHeight: 150, width: 1200, height: 300 });
  });

  it("leaves no bars: the box covers the stage but for under one logical pixel in each direction", () => {
    for (const [w, h, dpr] of [[1013, 677, 1], [1650, 702, 1.5], [1280, 800, 2], [911, 777, 1.25]] as const) {
      const s = partyScale(w, h, dpr)!;
      const unit = s.multiple / dpr;
      expect(s.width).toBeLessThanOrEqual(w + 1e-9);
      expect(s.height).toBeLessThanOrEqual(h + 1e-9);
      expect(w - s.width).toBeLessThan(unit);
      expect(h - s.height).toBeLessThan(unit);
    }
  });

  it("is never smaller than 232 x 130 and never bigger than 640 x 360 logical pixels", () => {
    const small = partyScale(300, 900, 1)!;
    expect(small.logicalWidth).toBeGreaterThanOrEqual(232);
    expect(small.logicalHeight).toBeGreaterThanOrEqual(130);
    const wide = partyScale(3000, 300, 1)!;
    expect(wide.logicalWidth).toBe(640);
    expect(wide.width).toBe(1280);
    expect(partyScale(700, 2000, 1)!.logicalHeight).toBe(360);
  });

  it("lands on whole device pixels at a fractional ratio: css size is logical * scale / dpr", () => {
    const scale = partyScale(1000, 700, 1.5)!;
    // 1000 * 1.5 / 232 = 6.46 -> 6x.
    expect(scale.multiple).toBe(6);
    expect(scale.width * 1.5).toBeCloseTo(scale.logicalWidth * 6, 9);
    expect(scale.height * 1.5).toBeCloseTo(scale.logicalHeight * 6, 9);
    expect(Number.isInteger(Math.round(scale.width * 1.5 * 1e6) / 1e6)).toBe(true);
    expect(scale.width).toBeLessThanOrEqual(1000);
    expect(scale.height).toBeLessThanOrEqual(700);
  });

  it("never exceeds the stage, and shrinks to fit when even 1x does not", () => {
    const scale = partyScale(200, 100, 1)!;
    expect(scale.multiple).toBe(0);
    expect(scale.width).toBeLessThanOrEqual(200);
    expect(scale.height).toBeLessThanOrEqual(100);
    expect(scale.width / scale.height).toBeCloseTo(scale.logicalWidth / scale.logicalHeight);
  });

  it("returns null when nothing is measured, and treats a bad ratio as 1", () => {
    expect(partyScale(0, 500, 1)).toBeNull();
    expect(partyScale(500, Number.NaN, 1)).toBeNull();
    expect(partyScale(500, 500, 0)).toEqual(partyScale(500, 500, 1));
  });
});
