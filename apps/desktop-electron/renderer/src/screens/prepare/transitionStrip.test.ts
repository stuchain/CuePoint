import { describe, expect, it } from "vitest";

import type { SetEntry } from "../../api/cuepointBridge.types";
import {
  halfTimesWords,
  inWords,
  outWords,
  shadedTimes,
  transitionOf,
  transitionWords,
  type TransitionHalf,
} from "./transitionStrip";

/**
 * What the transition strip says (WAVE-07, DEC-120): the selected entry and the
 * next, each one's planned times in words (DEC-107), the words between them,
 * the last entry, and nothing selected.
 */

function entry(
  entryId: number,
  trackId: number,
  title: string,
  inSeconds: number | null,
  outSeconds: number | null,
): SetEntry {
  return {
    entry_id: entryId,
    track_id: trackId,
    position: entryId - 1,
    chapter_id: 1,
    in_seconds: inSeconds,
    out_seconds: outSeconds,
    note: null,
    planned_seconds: null,
    starts_at: null,
    length_seconds: null,
    track: { id: trackId, title } as SetEntry["track"],
  };
}

const half = (inSeconds: number | null, outSeconds: number | null): TransitionHalf => ({
  entryId: 1,
  trackId: 1,
  title: "A",
  inSeconds,
  outSeconds,
});

// Warm One 0:00–5:42, Build 0:16–6:10, a repeat of Warm One untimed, Close in at 1:00 only.
const ENTRIES = [
  entry(1, 10, "Warm One", null, 342),
  entry(2, 20, "Build", 16, 370),
  entry(3, 10, "Warm One", null, null),
  entry(4, 40, "Close", 60, null),
];

describe("transitionOf", () => {
  it("is the selected entry and the one after it, in the running order", () => {
    const transition = transitionOf(ENTRIES, 1)!;
    expect(transition.from).toEqual({ entryId: 1, trackId: 10, title: "Warm One", inSeconds: null, outSeconds: 342 });
    expect(transition.to).toEqual({ entryId: 2, trackId: 20, title: "Build", inSeconds: 16, outSeconds: 370 });
  });

  it("counts a repeat as its own entry", () => {
    expect(transitionOf(ENTRIES, 2)!.to).toMatchObject({ entryId: 3, trackId: 10 });
    expect(transitionOf(ENTRIES, 3)!.from).toMatchObject({ entryId: 3, trackId: 10 });
  });

  it("has no second half after the last entry", () => {
    expect(transitionOf(ENTRIES, 4)).toEqual({
      from: expect.objectContaining({ entryId: 4 }),
      to: null,
    });
  });

  it("is null with nothing selected, or a selection no longer in the Set", () => {
    expect(transitionOf(ENTRIES, null)).toBeNull();
    expect(transitionOf(ENTRIES, 99)).toBeNull();
    expect(transitionOf([], 1)).toBeNull();
  });

  it("names an untitled track", () => {
    expect(transitionOf([entry(1, 1, "  ", null, null)], 1)!.from.title).toBe("Untitled");
  });
});

describe("the words", () => {
  it("say how the one goes out and the next comes in", () => {
    expect(transitionWords(transitionOf(ENTRIES, 1)!)).toEqual(["Out 5:42", "→", "In 0:16"]);
    expect(transitionWords(transitionOf(ENTRIES, 1)!).join(" ")).toBe("Out 5:42 → In 0:16");
  });

  it("say untimed for an out never typed, and for a next entry with no times planned", () => {
    expect(transitionWords(transitionOf(ENTRIES, 2)!).join(" ")).toBe("Out 6:10 → untimed");
    expect(transitionWords(transitionOf(ENTRIES, 3)!).join(" ")).toBe("Untimed → In 1:00");
  });

  it("are the last entry's out alone", () => {
    expect(transitionWords(transitionOf(ENTRIES, 4)!)).toEqual(["Untimed"]);
    expect(transitionWords(transitionOf(ENTRIES.slice(0, 1), 1)!)).toEqual(["Out 5:42"]);
  });

  it("read an empty in time as the start of the track, for an entry that is timed", () => {
    expect(inWords(half(null, 300))).toBe("In 0:00");
    expect(inWords(half(16, null))).toBe("In 0:16");
    expect(inWords(half(null, null))).toBe("untimed");
    expect(outWords(half(16, null))).toBe("Untimed");
    expect(outWords(half(null, 3_725))).toBe("Out 1:02:05");
  });

  it("give each half its planned times", () => {
    expect(halfTimesWords(half(16, 342))).toBe("In 0:16 · Out 5:42");
    expect(halfTimesWords(half(null, 342))).toBe("In 0:00 · Out 5:42");
    expect(halfTimesWords(half(16, null))).toBe("In 0:16 · untimed");
    expect(halfTimesWords(half(null, null))).toBe("Untimed");
  });
});

describe("the shading", () => {
  it("is before the in and after the out, in milliseconds", () => {
    expect(shadedTimes(half(16, 342))).toEqual({ inMs: 16_000, outMs: 342_000 });
  });

  it("shades nothing before an in at the start, and nothing after an untimed entry", () => {
    expect(shadedTimes(half(null, null))).toEqual({ inMs: null, outMs: null });
    expect(shadedTimes(half(0, null))).toEqual({ inMs: null, outMs: null });
  });
});
