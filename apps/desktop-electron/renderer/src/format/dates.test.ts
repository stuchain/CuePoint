import { afterEach, describe, expect, it } from "vitest";
import {
  formatAdded,
  formatChartAxis,
  formatDateTime,
  formatDay,
  formatDayInSentence,
  formatDayTimeInSentence,
  formatDayTime,
  formatRange,
  formatTimeOfDay,
  resetSystemLocale,
  systemLocale,
} from "./dates";

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
  // Each date is held together with no-break spaces, so a line never breaks inside one (new L):
  // "Releases from Sep 20 – Oct" left "20" alone on the next line.
  const nb = (text: string) => text.replace(/ /g, "\u00a0");
  it("joins two days with an en dash", () => {
    expect(formatRange(new Date(2026, 8, 15), new Date(2026, 9, 15), us)).toBe(`${nb("Sep 15")} – ${nb("Oct 15")}`);
  });
  it("shows both years when either is not this year", () => {
    expect(formatRange(new Date(2025, 11, 20), new Date(2026, 0, 3), us)).toBe(
      `${nb("Dec 20, 2025")} – ${nb("Jan 3, 2026")}`,
    );
  });
  it("breaks, if it must, only around the dash, never inside a date", () => {
    const text = formatRange(new Date(2026, 8, 20), new Date(2026, 9, 20), us);
    expect(text.split(" ")).toEqual([nb("Sep 20"), "–", nb("Oct 20")]);
  });
});

describe("formatChartAxis", () => {
  it("writes month and year", () => {
    expect(formatChartAxis(new Date(2019, 4, 1), us)).toBe("May 2019");
  });
});

describe("formatDayInSentence (C170)", () => {
  it("lowercases today and yesterday so they sit inside a sentence", () => {
    expect(formatDayInSentence(new Date(2026, 9, 15, 1, 0), us)).toBe("today");
    expect(formatDayInSentence(new Date(2026, 9, 14, 23, 0), us)).toBe("yesterday");
  });
  it("leaves a date as formatDay writes it", () => {
    expect(formatDayInSentence(new Date(2026, 8, 3), us)).toBe("Sep 3");
    expect(formatDayInSentence("not a date", us)).toBe("");
  });
});

describe("formatDayTimeInSentence (new B)", () => {
  it("says the day as a sentence does and then the time: today, 8:28 AM", () => {
    expect(formatDayTimeInSentence(new Date(2026, 9, 15, 8, 28), us)).toBe("today, 8:28 AM");
    expect(formatDayTimeInSentence(new Date(2026, 9, 14, 9, 5), us)).toBe("yesterday, 9:05 AM");
    expect(formatDayTimeInSentence(new Date(2026, 8, 3, 13, 4), us)).toBe("Sep 3, 1:04 PM");
  });
  it("is empty when the time cannot be read", () => {
    expect(formatDayTimeInSentence("not a date", us)).toBe("");
  });
});

describe("formatDateTime (C170)", () => {
  it("writes the full day and the time in the locale's own order", () => {
    expect(formatDateTime(new Date(2026, 9, 15, 17, 35), us)).toBe("Oct 15, 2026, 5:35 PM");
    expect(formatDateTime(new Date(2026, 9, 15, 17, 35), { now, locale: "en-GB" })).toBe("15 Oct 2026, 17:35");
  });
  it("is empty for what is not a date", () => {
    expect(formatDateTime(null, us)).toBe("");
  });
});

describe("formatAdded (C170)", () => {
  it("is the day a track was added: relative for the last two days, a date after", () => {
    expect(formatAdded(new Date(2026, 9, 15, 1, 0), us)).toBe("Today");
    expect(formatAdded(new Date(2026, 8, 3), us)).toBe("Sep 3");
  });
});

describe("the computer's locale (M498)", () => {
  const bridge = (getSystemLocale: unknown) => {
    (window as unknown as { cuepoint?: unknown }).cuepoint = { getSystemLocale };
    resetSystemLocale();
  };
  afterEach(() => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    resetSystemLocale();
  });

  it("is en-US when there is no preload (tests, the website)", () => {
    delete (window as unknown as { cuepoint?: unknown }).cuepoint;
    resetSystemLocale();
    expect(systemLocale()).toBe("en-US");
    expect(formatDay(new Date(2026, 4, 3), { now })).toBe("May 3");
  });

  it("writes dates in the locale main reported, when none is passed", () => {
    bridge(() => "de-DE");
    expect(systemLocale()).toBe("de-DE");
    expect(formatDay(new Date(2026, 4, 3), { now })).toContain("3.");
    expect(formatTimeOfDay(new Date(2026, 9, 15, 17, 35), {})).toBe("17:35");
  });

  it("lets a passed locale win", () => {
    bridge(() => "de-DE");
    expect(formatDay(new Date(2026, 4, 3), us)).toBe("May 3");
  });

  it.each([null, "", "   ", "not a locale!!", 5, undefined])("falls back to en-US for %j", (answer) => {
    bridge(() => answer);
    expect(systemLocale()).toBe("en-US");
  });

  it("falls back when the bridge throws", () => {
    bridge(() => {
      throw new Error("no ipc");
    });
    expect(systemLocale()).toBe("en-US");
  });

  it("asks once and keeps the answer", () => {
    let asked = 0;
    bridge(() => {
      asked += 1;
      return "en-GB";
    });
    systemLocale();
    systemLocale();
    expect(asked).toBe(1);
  });
});
