import { describe, expect, it } from "vitest";
import { formatChartAxis, formatDay, formatDayTime, formatRange, formatTimeOfDay } from "./dates";

const now = new Date(2026, 9, 15, 12, 0);
const us = { now, locale: "en-US" };

describe("formatDay", () => {
  it("says Today and Yesterday", () => {
    expect(formatDay(new Date(2026, 9, 15, 1, 0), us)).toBe("Today");
    expect(formatDay(new Date(2026, 9, 14, 23, 0), us)).toBe("Yesterday");
  });
  it("leaves out the year this year and keeps it otherwise", () => {
    expect(formatDay(new Date(2026, 4, 3), us)).toBe("May 3");
    expect(formatDay(new Date(2025, 9, 15), us)).toBe("Oct 15, 2025");
  });
  it("follows the locale", () => {
    expect(formatDay(new Date(2026, 4, 3), { now, locale: "de-DE" })).toContain("3.");
  });
  it("reads ISO text and refuses what is not a date", () => {
    expect(formatDay(new Date(2025, 0, 5, 12).toISOString(), us)).toBe("Jan 5, 2025");
    expect(formatDay("nonsense", us)).toBe("");
    expect(formatDay(null, us)).toBe("");
  });
});

describe("formatDayTime", () => {
  it("writes day and time on a 12-hour clock", () => {
    expect(formatDayTime(new Date(2026, 9, 15, 17, 35), us)).toBe("Oct 15, 5:35 PM");
  });
  it("adds the year from another year", () => {
    expect(formatDayTime(new Date(2025, 9, 15, 9, 5), us)).toBe("Oct 15, 2025, 9:05 AM");
  });
  it("uses a 24-hour clock where the locale does", () => {
    expect(formatDayTime(new Date(2026, 9, 15, 17, 35), { now, locale: "en-GB" })).toContain("17:35");
  });
});

describe("formatTimeOfDay", () => {
  it("writes the time alone", () => {
    expect(formatTimeOfDay(new Date(2026, 9, 15, 17, 35), us)).toBe("5:35 PM");
  });
});

describe("formatRange", () => {
  it("joins two days with an en dash", () => {
    expect(formatRange(new Date(2026, 8, 15), new Date(2026, 9, 15), us)).toBe("Sep 15 – Oct 15");
  });
  it("shows both years when either is not this year", () => {
    expect(formatRange(new Date(2025, 11, 20), new Date(2026, 0, 3), us)).toBe(
      "Dec 20, 2025 – Jan 3, 2026",
    );
  });
});

describe("formatChartAxis", () => {
  it("writes month and year", () => {
    expect(formatChartAxis(new Date(2019, 4, 1), us)).toBe("May 2019");
  });
});
