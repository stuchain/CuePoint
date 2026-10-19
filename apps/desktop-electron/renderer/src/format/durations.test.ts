import { describe, expect, it } from "vitest";
import { aboutDuration, formatLength, formatSetLength, formatTotal } from "./durations";

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

describe("formatSetLength (C173)", () => {
  it("always writes hours, minutes and seconds, like a clock", () => {
    expect(formatSetLength(5025)).toBe("1:23:45");
    expect(formatSetLength(754)).toBe("0:12:34");
    expect(formatSetLength(0)).toBe("0:00:00");
  });
  it("is a dash for an unknown length", () => {
    expect(formatSetLength(null)).toBe("—");
    expect(formatSetLength(-1)).toBe("—");
  });
});

describe("aboutDuration (C173)", () => {
  it("writes a long total in hours and minutes", () => {
    expect(aboutDuration(33 * 3600 + 11 * 60 + 5, "en-US")).toBe("33 h 11 min");
    expect(aboutDuration(2 * 3600)).toBe("2 h");
  });
  it("writes a short wait in minutes and a very short one as under a minute", () => {
    expect(aboutDuration(5 * 60 + 30)).toBe("5 min");
    expect(aboutDuration(20)).toBe("Under a minute");
    expect(aboutDuration(undefined)).toBe("—");
  });
});
