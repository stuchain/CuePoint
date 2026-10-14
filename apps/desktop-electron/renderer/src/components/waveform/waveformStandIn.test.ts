import { afterEach, describe, expect, it, vi } from "vitest";

import { reportBreadcrumb } from "../../reporting/reporting";

import { BANDS } from "./waveformLayout";
import { CROSSFADE_MS, crossfadeAlpha, noteStandIn, smoothedPeak } from "./waveformStandIn";

vi.mock("../../reporting/reporting", () => ({ reportBreadcrumb: vi.fn() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(reportBreadcrumb).mockClear();
});

/** Three overview columns of the full band: 0, 100, 200. */
const ramp = new Uint8Array([0, 0, 0, 0, 100, 0, 0, 0, 200, 0, 0, 0]);

describe("smoothedPeak", () => {
  it("is each column's own value at the middle of its time", () => {
    expect(smoothedPeak(ramp, 0, 3, 0.5)).toBe(0);
    expect(smoothedPeak(ramp, 0, 3, 1.5)).toBe(100);
    expect(smoothedPeak(ramp, 0, 3, 2.5)).toBe(200);
  });

  it("slides linearly between two columns instead of stepping", () => {
    expect(smoothedPeak(ramp, 0, 3, 1)).toBe(50);
    expect(smoothedPeak(ramp, 0, 3, 1.25)).toBe(75);
    expect(smoothedPeak(ramp, 0, 3, 2)).toBe(150);
    const walk = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5].map((p) => smoothedPeak(ramp, 0, 3, p));
    expect(new Set(walk).size).toBe(walk.length);
    expect([...walk].sort((a, b) => a - b)).toEqual(walk);
  });

  it("holds the end columns outside the data", () => {
    expect(smoothedPeak(ramp, 0, 3, -5)).toBe(0);
    expect(smoothedPeak(ramp, 0, 3, 0)).toBe(0);
    expect(smoothedPeak(ramp, 0, 3, 3)).toBe(200);
    expect(smoothedPeak(ramp, 0, 3, 99)).toBe(200);
  });

  it("reads the band it is asked for", () => {
    const two = new Uint8Array(2 * BANDS);
    two[BANDS + 2] = 80;
    expect(smoothedPeak(two, 2, 2, 1.5)).toBe(80);
    expect(smoothedPeak(two, 1, 2, 1.5)).toBe(0);
  });

  it("is zero for no data and for a position that is not a number", () => {
    expect(smoothedPeak(new Uint8Array(0), 0, 0, 1)).toBe(0);
    expect(smoothedPeak(ramp, 0, 3, Number.NaN)).toBe(0);
  });
});

describe("crossfadeAlpha", () => {
  it("rises from 0 to 1 over the fade and stays at 1", () => {
    expect(crossfadeAlpha(0, CROSSFADE_MS)).toBe(0);
    expect(crossfadeAlpha(CROSSFADE_MS / 2, CROSSFADE_MS)).toBeCloseTo(0.5, 5);
    expect(crossfadeAlpha(CROSSFADE_MS, CROSSFADE_MS)).toBe(1);
    expect(crossfadeAlpha(10 * CROSSFADE_MS, CROSSFADE_MS)).toBe(1);
  });

  it("starts at 0 for a clock that ran backwards", () => {
    expect(crossfadeAlpha(-40, CROSSFADE_MS)).toBe(0);
  });

  it("is over at once for a fade of no length, as with reduced motion", () => {
    expect(crossfadeAlpha(0, 0)).toBe(1);
  });

  it("is about 150 ms", () => {
    expect(CROSSFADE_MS).toBe(150);
  });
});

describe("noteStandIn", () => {
  it("marks the profiler and leaves a breadcrumb of the time and outcome alone", () => {
    const mark = vi.spyOn(performance, "mark");
    noteStandIn(1834.6, "replaced");
    expect(mark).toHaveBeenCalledWith("cp-waveform:standin:replaced", { detail: { ms: 1835 } });
    expect(reportBreadcrumb).toHaveBeenCalledWith("waveform", "stand-in drawn 1835 ms, replaced");
    noteStandIn(-3, "left");
    expect(reportBreadcrumb).toHaveBeenLastCalledWith("waveform", "stand-in drawn 0 ms, left");
  });

  it("never throws, whatever the profiler does", () => {
    vi.spyOn(performance, "mark").mockImplementation(() => {
      throw new Error("no");
    });
    expect(() => noteStandIn(10, "left")).not.toThrow();
    expect(reportBreadcrumb).toHaveBeenCalledTimes(1);
  });
});
