import { describe, expect, it } from "vitest";

import type { BeatGridMarker } from "../../api/cuepointBridge.types";
import { beatAt } from "./beatClock";

/** 120 BPM is 500 ms a beat. */
function marker(startMs: number, bpm: number, beat: number | null = 1): BeatGridMarker {
  return { start_ms: startMs, bpm, meter: "4/4", beat };
}

describe("beatAt", () => {
  it("counts beats from the marker at or before the position", () => {
    const grid = [marker(1000, 120)];
    const at = beatAt(2.25, grid, null);
    expect(at.beat).toBe(2);
    expect(at.phase).toBeCloseTo(0.5, 5);
  });

  it("is on the downbeat exactly at the marker", () => {
    const at = beatAt(1, [marker(1000, 120)], null);
    expect(at.beat).toBe(0);
    expect(at.phase).toBeCloseTo(0, 5);
  });

  it("uses the later marker between two markers", () => {
    const grid = [marker(0, 120), marker(4000, 60)];
    // 4000 ms is beat 8 of the first marker; the second is 1000 ms a beat.
    const at = beatAt(5.5, grid, 120);
    expect(at.beat).toBe(9);
    expect(at.phase).toBeCloseTo(0.5, 5);
  });

  it("stays on the first marker while before the second", () => {
    const grid = [marker(0, 120), marker(4000, 60)];
    const at = beatAt(3.75, grid, null);
    expect(at.beat).toBe(7);
    expect(at.phase).toBeCloseTo(0.5, 5);
  });

  it("extrapolates backwards before the first marker", () => {
    const at = beatAt(0.25, [marker(1000, 120)], null);
    expect(at.beat).toBe(-2);
    expect(at.phase).toBeCloseTo(0.5, 5);
  });

  it("follows a tempo change at a marker", () => {
    const grid = [marker(0, 120), marker(2000, 240)];
    // Four beats before the change, then 250 ms beats.
    expect(beatAt(2.0, grid, null).beat).toBe(4);
    const at = beatAt(2.625, grid, null);
    expect(at.beat).toBe(6);
    expect(at.phase).toBeCloseTo(0.5, 5);
  });

  it("counts the marker's own beat of the bar", () => {
    const at = beatAt(1, [marker(1000, 120, 3)], null);
    expect(at.beat).toBe(2);
  });

  it("sorts an unsorted grid", () => {
    const grid = [marker(4000, 60), marker(0, 120)];
    expect(beatAt(5.5, grid, null).beat).toBe(9);
  });

  it("uses the track BPM without a grid", () => {
    const at = beatAt(1.25, [], 120);
    expect(at.beat).toBe(2);
    expect(at.phase).toBeCloseTo(0.5, 5);
    expect(beatAt(1.25, null, 60).beat).toBe(1);
  });

  it("uses 120 BPM with neither a grid nor a BPM", () => {
    expect(beatAt(1.25, [], null).beat).toBe(2);
    expect(beatAt(1.25, [], 0).beat).toBe(2);
    expect(beatAt(1.25, undefined, undefined).phase).toBeCloseTo(0.5, 5);
  });

  it("falls back when a marker has no usable tempo", () => {
    expect(beatAt(1.25, [marker(0, 0)], 120).beat).toBe(2);
  });

  it("keeps the phase in 0 to 1 for a negative position", () => {
    const at = beatAt(-0.25, [], 120);
    expect(at.beat).toBe(-1);
    expect(at.phase).toBeCloseTo(0.5, 5);
  });

  it("snaps each marker to its beat of the bar", () => {
    // 4000 ms is 8 beats in, but the marker says it is beat 2 of the bar: the count goes to 9.
    const grid = [marker(0, 120), marker(4000, 120, 2)];
    const at = beatAt(4.0, grid, null);
    expect(at.beat % 4).toBe(1);
    expect(at.beat).toBe(9);
    // Later beats follow from the snapped marker.
    expect(beatAt(4.5, grid, null).beat).toBe(10);
  });

  it("reports one beat's length in ms", () => {
    expect(beatAt(1, [marker(0, 120)], null).beatMs).toBeCloseTo(500, 5);
    expect(beatAt(2.5, [marker(0, 120), marker(2000, 240)], null).beatMs).toBeCloseTo(250, 5);
    expect(beatAt(1, [], 60).beatMs).toBeCloseTo(1000, 5);
    expect(beatAt(1, [], null).beatMs).toBeCloseTo(500, 5);
  });

  it("answers the same for the same grid array asked again", () => {
    const grid = [marker(0, 120), marker(4000, 60)];
    const first = beatAt(5.5, grid, null);
    expect(beatAt(5.5, grid, null)).toEqual(first);
    expect(beatAt(0.2, grid, null).beat).toBe(0);
  });
});
