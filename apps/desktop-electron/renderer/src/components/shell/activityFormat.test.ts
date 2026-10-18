/**
 * Activity feed formatting.
 *
 * These are the places a log quietly goes wrong: a date that will not parse
 * becoming "Invalid Date", and a detail object rendering as "[object Object]".
 * Both look like working software until someone reads them.
 */
import { describe, expect, it } from "vitest";

import {
  RECORDED_EVENT_TYPES,
  formatDayHeading,
  formatEventDetail,
  formatEventTime,
  formatEventType,
  groupByDay,
  sortNewestFirst,
} from "./activityFormat";
import type { ActivityEvent } from "../../api/cuepointBridge.types";

const PYTHON_SOURCES = import.meta.glob<string>(
  ["../../../../../../src/cuepoint/{services,engine}/**/*.py"],
  { query: "?raw", import: "default", eager: true },
);

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
  it("shows only the time of day, since the day is a heading", () => {
    const formatted = formatEventTime("2026-09-02T10:00:00Z");
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
    expect(formatted).not.toMatch(/Sep|Aug/);
  });

  it("writes the time as the rest of the app does, with no leading zero", () => {
    // Local 4:58 PM, whatever the zone the tests run in.
    const evening = new Date(2026, 8, 2, 16, 58).toISOString();
    expect(formatEventTime(evening)).toBe("4:58 PM");
    expect(formatEventTime(new Date(2026, 8, 2, 9, 5).toISOString())).toBe("9:05 AM");
  });

  it("shows an unparseable timestamp verbatim", () => {
    // The raw value says what actually happened; "Invalid Date" hides it.
    expect(formatEventTime("not a date")).toBe("not a date");
    expect(formatEventTime("")).toBe("");
  });
});

describe("formatEventDetail for a Set", () => {
  it("does not repeat the Set's name after a sentence that already says it", () => {
    const summary = "Made the Set “Friday warm-up” from the Rekordbox playlist “Friday warm-up”, 32 tracks";
    expect(formatEventDetail({ set_name: "Friday warm-up", tracks: 32 }, summary)).toBe("");
  });
});

describe("formatDayHeading (STR-8)", () => {
  // Local noon, so no timezone moves the day.
  const now = new Date(2026, 8, 2, 12, 0, 0);

  it("calls today Today and the day before Yesterday", () => {
    expect(formatDayHeading(new Date(2026, 8, 2, 9, 0).toISOString(), now)).toBe("Today");
    expect(formatDayHeading(new Date(2026, 8, 1, 23, 0).toISOString(), now)).toBe("Yesterday");
  });

  it("writes an older day American-style, month first", () => {
    expect(formatDayHeading(new Date(2026, 7, 30, 10, 0).toISOString(), now)).toBe("Aug 30");
    expect(formatDayHeading(new Date(2026, 9, 3, 10, 0).toISOString(), new Date(2026, 9, 20))).toBe(
      "Oct 3",
    );
  });

  it("adds the year to a day in another year", () => {
    expect(formatDayHeading(new Date(2025, 11, 31, 10, 0).toISOString(), now)).toBe("Dec 31, 2025");
  });

  it("shows an unparseable timestamp verbatim", () => {
    expect(formatDayHeading("not a date", now)).toBe("not a date");
  });
});

describe("groupByDay (STR-8)", () => {
  const at = (id: number, y: number, m: number, d: number, h: number) =>
    event({ id, created_at: new Date(y, m, d, h).toISOString() });

  it("groups newest-first events under one heading per day, in order", () => {
    const now = new Date(2026, 8, 2, 12);
    const groups = groupByDay(
      [at(3, 2026, 8, 2, 11), at(2, 2026, 8, 2, 9), at(1, 2026, 8, 1, 20)],
      now,
    );
    expect(groups.map((g) => g.heading)).toEqual(["Today", "Yesterday"]);
    expect(groups[0]!.events.map((e) => e.id)).toEqual([3, 2]);
    expect(groups[1]!.events.map((e) => e.id)).toEqual([1]);
  });

  it("is empty for no events", () => {
    expect(groupByDay([])).toEqual([]);
  });
});

describe("formatEventType (STR-6)", () => {
  it("maps a full event type to a word", () => {
    expect(formatEventType("engine.started")).toBe("App started");
    expect(formatEventType("backup.created")).toBe("Backup");
    expect(formatEventType("library.imported")).toBe("Import");
    expect(formatEventType("clean.tags.written")).toBe("Saved to files");
  });

  it("has a word for every event type the app records", () => {
    for (const type of RECORDED_EVENT_TYPES) {
      expect(formatEventType(type), type).not.toBe("");
    }
  });

  it("covers every event type the Python side declares", () => {
    // Read from the source, so a new EVENT_* constant fails here until it has a word.
    const found = new Set<string>();
    for (const text of Object.values(PYTHON_SOURCES)) {
      for (const m of text.matchAll(/^EVENT_[A-Z_]+\s*=\s*"([a-z_.]+)"/gm)) found.add(m[1]!);
      for (const m of text.matchAll(/record_activity\(\s*"([a-z_.]+)"/g)) found.add(m[1]!);
      for (const m of text.matchAll(/^\s+ACTION_[A-Z]+:\s*"(discover\.wantlist\.[a-z]+)"/gm)) {
        found.add(m[1]!);
      }
    }
    expect(found.size).toBeGreaterThan(25);
    for (const type of found) {
      expect(RECORDED_EVENT_TYPES, type).toContain(type);
    }
  });

  it("uses no internal word and no British spelling", () => {
    for (const type of RECORDED_EVENT_TYPES) {
      expect(formatEventType(type), type).not.toMatch(/\b(engine|jobs?)\b|analys|colour/i);
    }
  });

  it("shows no badge for a type it does not know", () => {
    expect(formatEventType("something.new_later")).toBe("");
    expect(formatEventType("")).toBe("");
    expect(formatEventType("...")).toBe("");
  });
});

describe("formatEventDetail (STR-7)", () => {
  it("is empty when there is no detail", () => {
    expect(formatEventDetail(undefined)).toBe("");
    expect(formatEventDetail({})).toBe("");
  });

  it("prints only the user-meaningful keys, with labels", () => {
    expect(
      formatEventDetail({
        tracks: 1200,
        playlists: 14,
        port: 51234,
        version: "1.0.0",
        trigger: "launch",
        job_id: "abc",
        xml_path: "/x/y.xml",
      }),
    ).toBe("Tracks: 1,200 · Playlists: 14");
  });

  it("labels a file name and a playlist name", () => {
    expect(formatEventDetail({ file: "backup.db", playlist_name: "Warm-up" })).toBe(
      "File: backup.db · Playlist: Warm-up",
    );
  });

  it("is empty when nothing in it is meant for the user", () => {
    expect(formatEventDetail({ port: 1, job_id: "x" })).toBe("");
  });

  it("summarizes an array of an allowed key rather than dumping it", () => {
    expect(formatEventDetail({ tracks: [1, 2, 3] })).toBe("Tracks: 3 items");
    expect(formatEventDetail({ tracks: [1] })).toBe("Tracks: 1 item");
  });

  it("skips nulls and empty strings", () => {
    expect(formatEventDetail({ tracks: 1, file: null, playlist: "" })).toBe("Tracks: 1");
  });

  it("skips zero, which says nothing happened", () => {
    expect(formatEventDetail({ failed: 0, skipped: 0, tracks: 4 })).toBe("Tracks: 4");
    expect(formatEventDetail({ failed: 0 })).toBe("");
  });

  it("never prints a boolean", () => {
    expect(formatEventDetail({ written: true, restored: false, file: "a.db" })).toBe("File: a.db");
  });

  it("skips a number the summary already says, grouped or plain", () => {
    expect(formatEventDetail({ tracks: 120 }, "Imported 120 tracks")).toBe("");
    expect(formatEventDetail({ tracks: 1200 }, "Imported 1,200 tracks")).toBe("");
    expect(formatEventDetail({ tracks: 1200 }, "Imported 1200 tracks")).toBe("");
  });

  it("reads a number followed by a comma or a full stop", () => {
    expect(formatEventDetail({ removed: 3 }, "Removed 3, kept 5")).toBe("");
    expect(formatEventDetail({ tracks: 1200 }, "Imported 1,200, then stopped")).toBe("");
    expect(formatEventDetail({ tracks: 5 }, "Imported 5.")).toBe("");
  });

  it("does not read numbers out of a version string", () => {
    expect(formatEventDetail({ tracks: 1 }, "CuePoint started (v1.0.0)")).toBe("Tracks: 1");
    expect(formatEventDetail({ tracks: 0 }, "")).toBe("");
  });

  it("keeps a number the summary does not say, or only contains", () => {
    expect(formatEventDetail({ tracks: 12 }, "Imported 120 tracks")).toBe("Tracks: 12");
    expect(formatEventDetail({ tracks: 120, failed: 3 }, "Imported 120 tracks")).toBe("Failed: 3");
    expect(formatEventDetail({ tracks: 5 }, "Imported 1,205 tracks")).toBe("Tracks: 5");
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
