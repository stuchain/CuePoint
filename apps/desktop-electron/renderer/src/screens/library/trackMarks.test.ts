import { describe, expect, it } from "vitest";

import type { TrackCue, TrackMarksSummary } from "../../api/cuepointBridge.types";
import {
  MARKS_NOT_READ,
  beatGridLine,
  cueLine,
  cueSlot,
  cueTime,
  cuesHeading,
  cuesInTrackOrder,
} from "./trackMarks";

function cue(overrides: Partial<TrackCue> = {}): TrackCue {
  return {
    kind: "cue",
    hot_cue: 0,
    start_ms: 32_100,
    end_ms: null,
    name: "Drop",
    color: "#28e214",
    ...overrides,
  };
}

function marks(overrides: Partial<TrackMarksSummary> = {}): TrackMarksSummary {
  return {
    read: true,
    hot_cues: 0,
    memory_cues: 0,
    cues: [],
    beat_grid: null,
    ...overrides,
  };
}

describe("cueTime", () => {
  it("reads to a tenth of a second", () => {
    expect(cueTime(32_100)).toBe("0:32.1");
    expect(cueTime(0)).toBe("0:00.0");
    expect(cueTime(64_025)).toBe("1:04.0");
  });

  it("truncates as a playhead reads, never rounding into the next tenth", () => {
    expect(cueTime(64_999)).toBe("1:04.9");
    expect(cueTime(59_999)).toBe("0:59.9");
  });

  it("gains hours past an hour", () => {
    expect(cueTime(3_723_400)).toBe("1:02:03.4");
  });

  it("never reads a negative time", () => {
    expect(cueTime(-5)).toBe("0:00.0");
  });
});

describe("cueSlot", () => {
  it("names the eight hot cues A to H and a memory cue as one", () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((slot) => cueSlot({ hot_cue: slot }))).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
    ]);
    expect(cueSlot({ hot_cue: null })).toBe("Memory");
  });
});

describe("cueLine", () => {
  it("reads a hot cue as its letter, time and name", () => {
    expect(cueLine(cue())).toBe("A · 0:32.1 · Drop");
  });

  it("leaves out a name Rekordbox did not give", () => {
    expect(cueLine(cue({ hot_cue: 1, name: null, start_ms: 96_025 }))).toBe("B · 1:36.0");
  });

  it("reads a memory cue as one", () => {
    expect(cueLine(cue({ hot_cue: null, start_ms: 25, name: "Intro" }))).toBe(
      "Memory · 0:00.0 · Intro",
    );
  });

  it("gives a loop its span and says it is a loop", () => {
    expect(
      cueLine(cue({ kind: "loop", hot_cue: 2, start_ms: 120_025, end_ms: 127_525, name: "Build" })),
    ).toBe("C · 2:00.0–2:07.5 · Loop · Build");
  });

  it("names every other kind of mark", () => {
    const at = { hot_cue: null, start_ms: 1_500, name: null };
    expect(cueLine(cue({ ...at, kind: "fade_in" }))).toBe("Memory · 0:01.5 · Fade-in");
    expect(cueLine(cue({ ...at, kind: "fade_out" }))).toBe("Memory · 0:01.5 · Fade-out");
    expect(cueLine(cue({ ...at, kind: "load" }))).toBe("Memory · 0:01.5 · Load point");
  });
});

describe("cuesInTrackOrder", () => {
  it("lists cues as the track plays them, a hot cue first at one spot", () => {
    const memory = cue({ hot_cue: null, start_ms: 10_000, name: "m" });
    const hot = cue({ hot_cue: 4, start_ms: 10_000, name: "h" });
    const early = cue({ hot_cue: 7, start_ms: 1_000, name: "e" });
    const ordered = cuesInTrackOrder([memory, hot, early]);
    expect(ordered.map((c) => c.name)).toEqual(["e", "h", "m"]);
  });

  it("leaves what it was given as it was", () => {
    const given = [cue({ start_ms: 2 }), cue({ start_ms: 1 })];
    cuesInTrackOrder(given);
    expect(given.map((c) => c.start_ms)).toEqual([2, 1]);
  });
});

describe("cuesHeading", () => {
  it("counts hot and memory cues", () => {
    expect(cuesHeading(marks({ hot_cues: 3, memory_cues: 5, cues: [cue()] }))).toBe(
      "Cues · 3 hot, 5 memory",
    );
    expect(cuesHeading(marks({ hot_cues: 2, cues: [cue()] }))).toBe("Cues · 2 hot");
    expect(cuesHeading(marks({ memory_cues: 1, cues: [cue()] }))).toBe("Cues · 1 memory");
  });

  it("says a track has none only once the library's marks have been read", () => {
    expect(cuesHeading(marks())).toBe("No cues");
    expect(cuesHeading(marks({ read: false }))).toBe("Cues");
    expect(MARKS_NOT_READ).toMatch(/next refresh/);
  });
});

describe("beatGridLine", () => {
  const grid = { markers: 1, bpm: 128, min_bpm: 128, max_bpm: 128, variable: false };

  it("gives a constant grid's tempo to two places", () => {
    expect(beatGridLine(grid, true)).toBe("Beat grid · 128.00 BPM");
  });

  it("calls a grid that changes tempo variable, with its range", () => {
    expect(
      beatGridLine(
        { markers: 3, bpm: 121, min_bpm: 121, max_bpm: 124, variable: true },
        true,
      ),
    ).toBe("Beat grid · variable, 121.00–124.00 BPM");
  });

  it("says there is none only when the marks have been read", () => {
    expect(beatGridLine(null, true)).toBe("No beat grid");
    expect(beatGridLine(null, false)).toBeNull();
  });
});
