import { describe, expect, it } from "vitest";

import type { SetEntry } from "../../api/cuepointBridge.types";
import { FRIDAY, IDS } from "./prepare.testFixture";
import {
  NO_BEATPORT_KEY,
  captionSegments,
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

  it("say there is no out time for an out never typed, and for a next entry with no times planned", () => {
    expect(transitionWords(transitionOf(ENTRIES, 2)!).join(" ")).toBe("Out 6:10 → no times");
    expect(transitionWords(transitionOf(ENTRIES, 3)!).join(" ")).toBe("No out time → In 1:00");
  });

  it("are the last entry's out alone", () => {
    expect(transitionWords(transitionOf(ENTRIES, 4)!)).toEqual(["No out time"]);
    expect(transitionWords(transitionOf(ENTRIES.slice(0, 1), 1)!)).toEqual(["Out 5:42"]);
  });

  it("read an empty in time as the start of the track, for an entry that is timed", () => {
    expect(inWords(half(null, 300))).toBe("In 0:00");
    expect(inWords(half(16, null))).toBe("In 0:16");
    expect(inWords(half(null, null))).toBe("no times");
    expect(outWords(half(16, null))).toBe("No out time");
    expect(outWords(half(null, 3_725))).toBe("Out 1:02:05");
  });

  it("give each half its planned times", () => {
    expect(halfTimesWords(half(16, 342))).toBe("In 0:16 · Out 5:42");
    expect(halfTimesWords(half(null, 342))).toBe("In 0:00 · Out 5:42");
    expect(halfTimesWords(half(16, null))).toBe("In 0:16 · no out time");
    expect(halfTimesWords(half(null, null))).toBe("No out time");
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

describe("the loudness difference (WAVE-08)", () => {
  it("ends the words between the halves when there is one", () => {
    const transition = transitionOf(ENTRIES, 1)!;
    expect(transitionWords(transition, "+2.1 LU").join(" ")).toBe("Out 5:42 → In 0:16 · +2.1 LU");
    expect(transitionWords(transition, null)).toEqual(["Out 5:42", "→", "In 0:16"]);
  });

  it("is never said after the last entry, which has no next", () => {
    const last = transitionOf(ENTRIES, ENTRIES[ENTRIES.length - 1]!.entry_id)!;
    expect(transitionWords(last, "+2.1 LU")).toEqual([outWords(last.from)]);
  });
});

// ------------------------------------------------------------- the caption

/** Friday's entries and the engine's own shape of them (FLW-19). */
const FRIDAY_ENTRIES = FRIDAY.entries.entries;
const SHAPE = FRIDAY.analysis.shape;
const [E1, E2, E3, E4, E6, E5] = IDS.friday_entries;
const captionFrom = (entryId: number, shape = SHAPE, difference: string | null = null) =>
  captionSegments(transitionOf(FRIDAY_ENTRIES, entryId)!, shape, difference);

describe("the caption (FLW-19)", () => {
  it("reads the keys, how they relate, the tempos and the planned times", () => {
    expect(captionFrom(E1).join(" · ")).toBe(
      "8A → 9A · next key up · 122 → 124 BPM (+1.6%) · Out 4:30 → In 0:00",
    );
  });

  it("names a step down, a relative key and a clash in the key words", () => {
    expect(captionFrom(E2).slice(0, 3)).toEqual(["9A → 8A", "next key down", "124 → 128 BPM (+3.2%)"]);
    expect(captionFrom(E6).slice(0, 3)).toEqual(["8A → 8B", "relative key", "122 → 125 BPM (+2.5%)"]);
    expect(captionFrom(E3).slice(0, 3)).toEqual(["8A → 3B", "keys clash", "128 → 140 BPM (+9.4%)"]);
  });

  it("says a slower tempo with a minus sign, and the same key as the same", () => {
    expect(captionFrom(E4)[2]).toBe("140 → 122 BPM (−12.9%)");
    const same = {
      ...SHAPE,
      transitions: SHAPE.transitions.map((t) => (t.from_entry_id === E1 ? { ...t, key_relation: "same" as const } : t)),
    };
    expect(captionFrom(E1, same).slice(0, 2)).toEqual(["8A → 9A", "same key"]);
  });

  it("puts the loudness last, after the times", () => {
    expect(captionFrom(E1, SHAPE, "+2.1 LU").slice(-2)).toEqual(["Out 4:30 → In 0:00", "+2.1 LU"]);
  });

  it("says once that a key is missing, and that it was not checked", () => {
    const keyless = {
      ...SHAPE,
      entries: SHAPE.entries.map((e) => (e.entry_id === E2 ? { ...e, key: null, camelot: null } : e)),
    };
    expect(NO_BEATPORT_KEY).toBe("No Beatport key: key not checked");
    expect(captionFrom(E1, keyless).slice(0, 2)).toEqual([NO_BEATPORT_KEY, "122 → 124 BPM (+1.6%)"]);
  });

  it("leaves the tempo out when either side has none, and everything out without the shape", () => {
    const noBpm = {
      ...SHAPE,
      entries: SHAPE.entries.map((e) => (e.entry_id === E2 ? { ...e, bpm: null } : e)),
    };
    expect(captionFrom(E1, noBpm)).toEqual(["8A → 9A", "next key up", "Out 4:30 → In 0:00"]);
    expect(captionSegments(transitionOf(FRIDAY_ENTRIES, E1)!, null, null)).toEqual(["Out 4:30 → In 0:00"]);
  });

  it("is the out time alone for the last entry", () => {
    expect(captionFrom(E5)).toEqual(["No out time"]);
  });

  it("says the same tempo as the same", () => {
    const flat = {
      ...SHAPE,
      entries: SHAPE.entries.map((e) => (e.entry_id === E2 ? { ...e, bpm: 122 } : e)),
    };
    expect(captionFrom(E1, flat)[2]).toBe("122 → 122 BPM (0%)");
  });
});
