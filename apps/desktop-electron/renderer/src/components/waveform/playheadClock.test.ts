import { describe, expect, it } from "vitest";

import { BLEND_MS, JUMP_MS, createPlayheadClock } from "./playheadClock";

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
});
