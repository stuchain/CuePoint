/**
 * The renderer writes a planned time exactly as the engine does (PREP-03).
 *
 * `setWarnings.fixture.json` carries times written by the engine's
 * `core/set_timing.format_time`; the shared `formatLength` must write every one the same.
 */
import { describe, expect, it } from "vitest";

import fixture from "./setWarnings.fixture.json";
import { formatLength } from "../../format/durations";

const TIMES = fixture.times as [number, string][];

describe("formatLength against the engine's times", () => {
  it("covers both forms and the longest time", () => {
    const texts = TIMES.map(([, text]) => text);
    expect(texts).toContain("0:00");
    expect(texts).toContain("1:00:00");
    expect(texts).toContain("99:59:59");
  });

  it.each(TIMES)("writes %i seconds as the engine does: %s", (seconds, text) => {
    expect(formatLength(seconds)).toBe(text);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])("writes %s as no length", (value) => {
    expect(formatLength(value)).toBe("—");
  });

  it("floors a part second, so it never reads 2:60", () => {
    expect(formatLength(179.9)).toBe("2:59");
  });
});
