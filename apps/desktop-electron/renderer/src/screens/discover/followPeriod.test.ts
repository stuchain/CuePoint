/** The Following tab's period: what is remembered, and which days the engine is asked for. */
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_FOLLOW_PERIOD,
  FOLLOW_PERIOD_STORAGE_KEY,
  customLabel,
  daysBefore,
  isoDay,
  loadPeriod,
  periodKey,
  periodOptions,
  periodRange,
  periodValue,
  reachesPastLabels,
  readPeriod,
  savePeriod,
} from "./followPeriod";

const today = new Date(2026, 10, 17, 15, 0, 0);

afterEach(() => localStorage.clear());

describe("days", () => {
  it("writes a day on this computer's calendar", () => {
    expect(isoDay(today)).toBe("2026-11-17");
    expect(daysBefore(today, 30)).toBe("2026-10-18");
    expect(daysBefore(new Date(2026, 2, 1), 1)).toBe("2026-02-28");
  });
});

describe("remembering the choice", () => {
  it("starts on Last 30 days", () => {
    expect(DEFAULT_FOLLOW_PERIOD).toEqual({ kind: "days", days: 30 });
    expect(loadPeriod()).toEqual(DEFAULT_FOLLOW_PERIOD);
  });

  it("opens on the choice made last time, custom dates included", () => {
    savePeriod({ kind: "custom", since: "2026-10-01", until: "2026-11-01" });
    expect(loadPeriod()).toEqual({ kind: "custom", since: "2026-10-01", until: "2026-11-01" });
    savePeriod({ kind: "new" });
    expect(loadPeriod()).toEqual({ kind: "new" });
  });

  it("ignores what is not a choice", () => {
    for (const raw of ["", "nope", "{}", '{"kind":"days","days":14}', '{"kind":"custom","since":"2026-02-30","until":null}']) {
      expect(readPeriod(raw)).toBeNull();
    }
    localStorage.setItem(FOLLOW_PERIOD_STORAGE_KEY, '{"kind":"days","days":3}');
    expect(loadPeriod()).toEqual(DEFAULT_FOLLOW_PERIOD);
  });
});

describe("the days asked for", () => {
  it("asks for no dates for new since you last looked", () => {
    expect(periodRange({ kind: "new" }, today)).toEqual({});
    expect(periodKey({ kind: "new" }, today)).toBe("new");
  });

  it("asks from n days back to today", () => {
    expect(periodRange({ kind: "days", days: 7 }, today)).toEqual({ since: "2026-11-10" });
  });

  it("leaves out an end that is today, and keeps an earlier one", () => {
    expect(periodRange({ kind: "custom", since: "2026-10-01", until: null }, today)).toEqual({ since: "2026-10-01" });
    expect(periodRange({ kind: "custom", since: "2026-10-01", until: "2026-11-17" }, today)).toEqual({
      since: "2026-10-01",
    });
    expect(periodRange({ kind: "custom", since: "2026-10-01", until: "2026-10-31" }, today)).toEqual({
      since: "2026-10-01",
      until: "2026-10-31",
    });
  });

  it("keeps a range remembered long ago inside a year back", () => {
    expect(periodRange({ kind: "custom", since: "2024-01-01", until: "2024-02-01" }, today)).toEqual({
      since: "2025-11-16",
      until: "2025-11-16",
    });
  });

  it("changes the key when the dates change", () => {
    const a = periodKey({ kind: "days", days: 7 }, today);
    const b = periodKey({ kind: "days", days: 30 }, today);
    expect(a).not.toBe(b);
  });
});

describe("the menu", () => {
  it("offers the four periods and a custom range", () => {
    expect(periodOptions({ kind: "new" }, today).map((o) => o.label)).toEqual([
      "New since you last looked",
      "Last 7 days",
      "Last 30 days",
      "Last 90 days",
      "Custom range…",
    ]);
  });

  it("names a custom range once there is one", () => {
    const choice = { kind: "custom", since: "2026-10-01", until: null } as const;
    expect(periodValue(choice)).toBe("custom");
    expect(periodOptions(choice, today).at(-1)!.label).toBe(customLabel("2026-10-01", null, today));
    expect(customLabel("2026-10-01", null, today)).toMatch(/– today$/);
  });

  it("says so when a range reaches past what labels keep", () => {
    expect(reachesPastLabels({ kind: "days", days: 90 }, today)).toBe(false);
    expect(reachesPastLabels({ kind: "custom", since: "2026-01-01", until: null }, today)).toBe(true);
    expect(reachesPastLabels({ kind: "new" }, today)).toBe(false);
  });
});
