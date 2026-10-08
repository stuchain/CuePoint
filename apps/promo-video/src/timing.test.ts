import { describe, expect, it } from "vitest";
import { at, BAR, BEAT, CAPTIONS, DURATION, FRAMES, FPS, KICKS, kickLevel, SHOTS } from "./timing";

describe("the promo's clock", () => {
  it("is exactly 30 seconds at 30 fps", () => {
    expect(DURATION).toBeCloseTo(30, 9);
    expect(FRAMES).toBe(900);
    expect(FPS).toBe(30);
  });

  it("has shots that cover the whole video with no gap or overlap", () => {
    expect(SHOTS[0]!.from).toBe(0);
    for (let i = 1; i < SHOTS.length; i++) expect(SHOTS[i]!.from).toBe(SHOTS[i - 1]!.to);
    expect(at(SHOTS[SHOTS.length - 1]!.to)).toBeCloseTo(DURATION, 9);
  });

  it("shows each caption long enough to read and inside the video", () => {
    for (const c of CAPTIONS) {
      expect(c.from).toBeGreaterThanOrEqual(0);
      expect(c.to).toBeLessThanOrEqual(DURATION);
      // about 3 words a second, and never under one bar
      const words = c.text.split(/\s+/).length;
      expect(c.to - c.from).toBeGreaterThanOrEqual(Math.max(BAR * 0.9, words / 3));
    }
  });

  it("never shows two captions at once", () => {
    const sorted = [...CAPTIONS].sort((a, b) => a.from - b.from);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.from).toBeGreaterThanOrEqual(sorted[i - 1]!.to - 1e-9);
  });

  it("pulses only where the music has a kick", () => {
    expect(kickLevel(0)).toBe(0); // bar 0 is the arpeggio alone
    expect(kickLevel(at(1))).toBeCloseTo(1, 9);
    expect(kickLevel(at(1) + 0.3)).toBeLessThan(0.1);
    expect(kickLevel(at(4, 2) + 0.05)).toBeLessThan(0.15); // the riser: no kick
    expect(kickLevel(at(5))).toBeCloseTo(1, 9);
    expect(kickLevel(DURATION)).toBe(0);
  });

  it("puts every kick on the beat grid", () => {
    for (const k of KICKS) expect((k / BEAT) % 1).toBeCloseTo(0, 6);
  });
});
