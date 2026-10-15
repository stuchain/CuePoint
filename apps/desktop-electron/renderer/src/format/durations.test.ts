import { describe, expect, it } from "vitest";
import { formatLength, formatTotal } from "./durations";

describe("formatLength", () => {
  it("writes minutes and seconds, then hours", () => {
    expect(formatLength(225)).toBe("3:45");
    expect(formatLength(3825)).toBe("1:03:45");
    expect(formatLength(0)).toBe("0:00");
  });
  it("floors the seconds and never writes 2:60", () => {
    expect(formatLength(179.9)).toBe("2:59");
    expect(formatLength(119.6)).toBe("1:59");
  });
  it("shows a dash for an unknown length", () => {
    expect(formatLength(null)).toBe("—");
    expect(formatLength(undefined)).toBe("—");
    expect(formatLength(Number.NaN)).toBe("—");
    expect(formatLength(-1)).toBe("—");
  });
});

describe("formatTotal", () => {
  it("writes hours and minutes", () => {
    expect(formatTotal(33 * 3600 + 11 * 60 + 59, "en-US")).toBe("33 h 11 min");
    expect(formatTotal(2 * 3600, "en-US")).toBe("2 h");
    expect(formatTotal(45 * 60 + 30)).toBe("45 min");
  });
  it("handles very short and unknown totals", () => {
    expect(formatTotal(20)).toBe("Under a minute");
    expect(formatTotal(null)).toBe("—");
  });
});
