/**
 * Activity feed formatting.
 *
 * These are the places a log quietly goes wrong: a date that will not parse
 * becoming "Invalid Date", and a detail object rendering as "[object Object]".
 * Both look like working software until someone reads them.
 */
import { describe, expect, it } from "vitest";

import {
  formatEventDetail,
  formatEventTime,
  formatEventType,
  sortNewestFirst,
} from "./activityFormat";
import type { ActivityEvent } from "../../api/cuepointBridge.types";

function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 1,
    type: "test",
    summary: "Summary",
    detail: {},
    created_at: "2026-09-02T10:00:00Z",
    ...overrides,
  };
}

describe("formatEventTime", () => {
  const now = new Date("2026-09-02T18:00:00Z");

  it("shows only the time for something that happened today", () => {
    const formatted = formatEventTime("2026-09-02T10:00:00Z", now);
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
    expect(formatted).not.toMatch(/Sep/);
  });

  it("includes the date for something older", () => {
    expect(formatEventTime("2026-08-30T10:00:00Z", now)).toMatch(/Aug/);
  });

  it("shows an unparseable timestamp verbatim", () => {
    // The raw value says what actually happened; "Invalid Date" hides it.
    expect(formatEventTime("not a date", now)).toBe("not a date");
    expect(formatEventTime("", now)).toBe("");
  });
});

describe("formatEventType", () => {
  it("shows the last part of a dotted type", () => {
    expect(formatEventType("library.import")).toBe("import");
    expect(formatEventType("track.field.changed")).toBe("changed");
  });

  it("leaves an undotted type alone", () => {
    expect(formatEventType("backup")).toBe("backup");
  });

  it("survives an empty or malformed type", () => {
    expect(formatEventType("")).toBe("");
    expect(formatEventType("...")).toBe("...");
  });
});

describe("formatEventDetail", () => {
  it("is empty when there is no detail", () => {
    expect(formatEventDetail(undefined)).toBe("");
    expect(formatEventDetail({})).toBe("");
  });

  it("joins simple values", () => {
    expect(formatEventDetail({ count: 120, source: "rekordbox" })).toBe(
      "count: 120 · source: rekordbox",
    );
  });

  it("summarizes an array rather than dumping it", () => {
    expect(formatEventDetail({ tracks: [1, 2, 3] })).toBe("tracks: 3 items");
  });

  it("summarizes a nested object rather than rendering [object Object]", () => {
    expect(formatEventDetail({ before: { bpm: 128, key: "6A" } })).toBe("before: 2 fields");
  });

  it("counts one of something in the singular", () => {
    // "1 fields" was visible in the running app before this: a field-change
    // event carries exactly one key more often than not.
    expect(formatEventDetail({ before: { bpm: 128 } })).toBe("before: 1 field");
    expect(formatEventDetail({ tracks: [1] })).toBe("tracks: 1 item");
  });

  it("skips nulls and empty strings", () => {
    expect(formatEventDetail({ count: 1, note: null, label: "" })).toBe("count: 1");
  });

  it("keeps false, which is a real value", () => {
    expect(formatEventDetail({ succeeded: false })).toBe("succeeded: false");
  });
});

describe("sortNewestFirst", () => {
  it("orders by timestamp descending", () => {
    const sorted = sortNewestFirst([
      event({ id: 1, created_at: "2026-09-02T09:00:00Z" }),
      event({ id: 2, created_at: "2026-09-02T11:00:00Z" }),
      event({ id: 3, created_at: "2026-09-02T10:00:00Z" }),
    ]);

    expect(sorted.map((e) => e.id)).toEqual([2, 3, 1]);
  });

  it("does not mutate the input", () => {
    const input = [
      event({ id: 1, created_at: "2026-09-02T09:00:00Z" }),
      event({ id: 2, created_at: "2026-09-02T11:00:00Z" }),
    ];

    sortNewestFirst(input);

    expect(input.map((e) => e.id)).toEqual([1, 2]);
  });
});
