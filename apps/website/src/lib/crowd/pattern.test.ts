import { describe, expect, it } from "vitest";
import { BPM, CALM_BEATS, CYCLE_BEATS, CYCLE_SECONDS, BUILD_BEATS, beatsAt, moveAt, phaseAt, STILL_SECONDS } from "./pattern";

const secondsOfBeat = (beat: number) => (beat * 60) / BPM;

describe("the 124 BPM pattern", () => {
  it("counts beats at 124 per minute", () => {
    expect(BPM).toBe(124);
    expect(beatsAt(60)).toBeCloseTo(124, 6);
    expect(beatsAt(0)).toBe(0);
  });

  it("cycles in whole bars, about 32 seconds", () => {
    expect(CYCLE_BEATS % 4).toBe(0);
    expect(CYCLE_SECONDS).toBeGreaterThan(30);
    expect(CYCLE_SECONDS).toBeLessThan(33);
  });

  it("is calm, then builds, then drops, in that order", () => {
    expect(phaseAt(0)).toBe("calm");
    expect(phaseAt(secondsOfBeat(CALM_BEATS - 0.5))).toBe("calm");
    expect(phaseAt(secondsOfBeat(CALM_BEATS + 0.5))).toBe("build");
    expect(phaseAt(secondsOfBeat(BUILD_BEATS - 0.5))).toBe("build");
    expect(phaseAt(secondsOfBeat(BUILD_BEATS + 0.5))).toBe("drop");
    expect(phaseAt(secondsOfBeat(CYCLE_BEATS - 0.5))).toBe("drop");
  });

  it("starts over after the drop", () => {
    expect(phaseAt(CYCLE_SECONDS + 1)).toBe("calm");
    expect(phaseAt(CYCLE_SECONDS * 3 + secondsOfBeat(BUILD_BEATS + 1))).toBe("drop");
  });

  it("sways when calm, bobs in the build and jumps on the drop", () => {
    expect(moveAt(0)).toBe("sway");
    expect(moveAt(secondsOfBeat(CALM_BEATS + 1))).toBe("bob");
    expect(moveAt(secondsOfBeat(BUILD_BEATS + 1))).toBe("jump");
  });

  it("the still frame is a moment with the crowd moving, not the drop's peak", () => {
    expect(moveAt(STILL_SECONDS)).toBe("bob");
  });
});
