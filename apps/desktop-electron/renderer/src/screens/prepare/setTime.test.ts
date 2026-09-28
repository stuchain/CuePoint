/**
 * The renderer writes a planned time exactly as the engine does (PREP-03).
 *
 * `setWarnings.fixture.json` carries times written by the engine's
 * `core/set_timing.format_time`; `formatTime` must write every one the same.
 */
import { describe, expect, it } from "vitest";

import fixture from "./setWarnings.fixture.json";
import { formatTime } from "./setTime";

const TIMES = fixture.times as [number, string][];

describe("formatTime", () => {
  it("covers both forms and the longest time", () => {
    const texts = TIMES.map(([, text]) => text);
    expect(texts).toContain("0:00");
    expect(texts).toContain("1:00:00");
    expect(texts).toContain("99:59:59");
  });

  it.each(TIMES)("writes %i seconds as the engine does: %s", (seconds, text) => {
    expect(formatTime(seconds)).toBe(text);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("refuses %s", (value) => {
    expect(() => formatTime(value)).toThrow(RangeError);
  });
});
