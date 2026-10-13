import { describe, expect, it } from "vitest";

import { BLEND_MS, GLIDE_MS, JUMP_MS, PAUSE_BLEND_MS, createPlayheadClock } from "./playheadClock";

/**
 * The playhead between the player's snapshots (T4): main pushes the position
 * four times a second, and the strip draws sixty. Everything is told the time,
 * so a fake clock drives it.
 */

describe("createPlayheadClock", () => {
  it("knows no position before a snapshot", () => {
    expect(createPlayheadClock().positionMs(0)).toBeNull();
  });

  it("extrapolates at normal speed while playing", () => {
    const clock = createPlayheadClock();
    clock.snapshot(10, true, 1_000);
    expect(clock.positionMs(1_000)).toBe(10_000);
    expect(clock.positionMs(1_100)).toBe(10_100);
    expect(clock.positionMs(1_250)).toBe(10_250);
  });

  it("holds still while paused", () => {
    const clock = createPlayheadClock();
    clock.snapshot(10, false, 1_000);
    expect(clock.positionMs(5_000)).toBe(10_000);
  });

  it("stops where it was when playback pauses", () => {
    const clock = createPlayheadClock();
    clock.snapshot(10, true, 1_000);
    clock.snapshot(10.2, false, 1_200);
    expect(clock.positionMs(9_000)).toBe(10_200);
  });

  it("blends a snapshot a little off the prediction instead of jumping", () => {
    const clock = createPlayheadClock();
    clock.snapshot(10, true, 0);
    // Predicted 10.250 s; the engine says 10.220 s: 30 ms behind.
    clock.snapshot(10.22, true, 250);
    expect(clock.positionMs(250)).toBeCloseTo(10_250, 5);
    expect(clock.positionMs(250 + BLEND_MS / 2)).toBeCloseTo(10_220 + BLEND_MS / 2 + 15, 5);
    expect(clock.positionMs(250 + BLEND_MS)).toBeCloseTo(10_220 + BLEND_MS, 5);
    expect(clock.positionMs(1_250)).toBeCloseTo(11_220, 5);
  });

  it("jumps for a seek or a new track", () => {
    const clock = createPlayheadClock();
    clock.snapshot(10, true, 0);
    clock.snapshot(10.25 + (JUMP_MS + 1) / 1000, true, 250);
    expect(clock.positionMs(250)).toBeCloseTo(10_250 + JUMP_MS + 1, 5);
    clock.snapshot(90, true, 500);
    expect(clock.positionMs(500)).toBe(90_000);
  });

  it("starts from the snapshot when playback resumes", () => {
    const clock = createPlayheadClock();
    clock.snapshot(10, false, 0);
    clock.snapshot(10, true, 5_000);
    expect(clock.positionMs(5_100)).toBe(10_100);
  });

  it("freezes while hidden, and carries on true when shown", () => {
    const clock = createPlayheadClock();
    clock.snapshot(10, true, 0);
    clock.setHidden(true, 500);
    expect(clock.positionMs(2_000)).toBe(10_500);
    clock.setHidden(false, 2_000);
    expect(clock.positionMs(2_000)).toBe(12_000);
  });

  it("forgets everything for a snapshot of no position", () => {
    const clock = createPlayheadClock();
    clock.snapshot(10, true, 0);
    clock.snapshot(null, false, 100);
    expect(clock.positionMs(200)).toBeNull();
  });

  describe("pause and resume", () => {
    it("glides from the drawn spot to the stop instead of snapping back", () => {
      const clock = createPlayheadClock();
      clock.snapshot(10, true, 0);
      clock.snapshot(10.15, false, 250);
      expect(clock.positionMs(250)).toBeCloseTo(10_250, 5);
      expect(clock.positionMs(250 + PAUSE_BLEND_MS / 2)).toBeCloseTo(10_200, 5);
      expect(clock.positionMs(250 + PAUSE_BLEND_MS)).toBeCloseTo(10_150, 5);
      expect(clock.positionMs(9_000)).toBeCloseTo(10_150, 5);
    });

    it("folds the late settle into the same glide, with no step", () => {
      const clock = createPlayheadClock();
      clock.snapshot(10, true, 0);
      clock.snapshot(10.15, false, 250);
      // The engine's settled position lands about 250 ms after the pause.
      const samples: number[] = [];
      for (let at = 250; at < 500; at += 4) samples.push(clock.positionMs(at) as number);
      clock.snapshot(10.17, false, 500);
      expect(clock.settling(500)).toBe(true);
      for (let at = 500; at <= 900; at += 4) samples.push(clock.positionMs(at) as number);
      for (let i = 1; i < samples.length; i += 1) {
        expect(Math.abs(samples[i]! - samples[i - 1]!)).toBeLessThan(4);
      }
      expect(clock.positionMs(500 + BLEND_MS)).toBeCloseTo(10_170, 5);
      expect(clock.positionMs(5_000)).toBeCloseTo(10_170, 5);
      expect(clock.settling(500 + BLEND_MS)).toBe(false);
    });

    it("jumps for a paused seek", () => {
      const clock = createPlayheadClock();
      clock.snapshot(10, true, 0);
      clock.snapshot(10.15, false, 250);
      clock.snapshot(30, false, 500);
      expect(clock.positionMs(500)).toBe(30_000);
      expect(30_000 - 10_150).toBeGreaterThan(GLIDE_MS);
    });

    it("glides the first playing snapshot after a start that ran late", () => {
      const clock = createPlayheadClock();
      clock.snapshot(10, false, 0);
      clock.snapshot(10, true, 5_000);
      clock.snapshot(10.4, true, 5_250);
      expect(clock.positionMs(5_250)).toBeCloseTo(10_250, 5);
      expect(clock.positionMs(5_250 + 300)).toBeCloseTo(10_700, 5);
    });

    it("never runs backwards when the start was late by most of a glide", () => {
      const clock = createPlayheadClock();
      clock.snapshot(10, false, 0);
      clock.snapshot(10, true, 5_000);
      // The true position lags what is drawn by 150 ms.
      clock.snapshot(10.1, true, 5_250);
      let last = clock.positionMs(5_250) as number;
      for (let at = 5_254; at <= 5_800; at += 4) {
        const here = clock.positionMs(at) as number;
        expect(here).toBeGreaterThanOrEqual(last);
        last = here;
      }
    });

    it("draws the truth when asked for no glide", () => {
      const clock = createPlayheadClock();
      clock.snapshot(10, true, 0, false);
      clock.snapshot(10.15, false, 250, false);
      expect(clock.positionMs(250)).toBe(10_150);
      expect(clock.settling(250)).toBe(false);
    });

    it("reports a glide in progress", () => {
      const clock = createPlayheadClock();
      expect(clock.settling(0)).toBe(false);
      clock.snapshot(10, true, 0);
      clock.snapshot(10.15, false, 250);
      expect(clock.settling(250)).toBe(true);
      expect(clock.settling(250 + PAUSE_BLEND_MS - 1)).toBe(true);
      expect(clock.settling(250 + PAUSE_BLEND_MS)).toBe(false);
    });
  });
});
