import { describe, expect, it } from "vitest";

import type { SetEntry, SetWarning } from "../../api/cuepointBridge.types";
import { FRIDAY, IDS } from "./prepare.testFixture";
import {
  KEYS_CLASH,
  NO_BEATPORT_KEY,
  captionDetail,
  captionKeys,
  captionSegments,
  mainWarning,
  halfTimesWords,
  shadedTimes,
  transitionOf,
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

// ------------------------------------------------------------- the caption

/** Friday's entries and the engine's own shape of them (FLW-19). */
const FRIDAY_ENTRIES = FRIDAY.entries.entries;
const SHAPE = FRIDAY.analysis.shape;
const [E1, E2, E3, E4, E6, E5] = IDS.friday_entries;
const captionFrom = (entryId: number, shape = SHAPE) => captionSegments(transitionOf(FRIDAY_ENTRIES, entryId)!, shape);

describe("the caption (FLW-19, C15d)", () => {
  it("reads the keys, how they relate and the tempo change, with no planned times", () => {
    expect(captionFrom(E1).join(" · ")).toBe("8A → 9A · next key up · +1.6% BPM");
    expect(captionFrom(E1).join(" ")).not.toMatch(/Out|In /);
  });

  it("names a step down, a relative key and a clash in the key words", () => {
    expect(captionFrom(E2)).toEqual(["9A → 8A", "next key down", "+3.2% BPM"]);
    expect(captionFrom(E6)).toEqual(["8A → 8B", "relative key", "+2.5% BPM"]);
    expect(captionFrom(E3)).toEqual(["8A → 3B", KEYS_CLASH, "+9.4% BPM"]);
  });

  it("says a slower tempo with a minus sign, and the same key as the same", () => {
    expect(captionFrom(E4)[2]).toBe("−12.9% BPM");
    const same = {
      ...SHAPE,
      transitions: SHAPE.transitions.map((t) => (t.from_entry_id === E1 ? { ...t, key_relation: "same" as const } : t)),
    };
    expect(captionFrom(E1, same).slice(0, 2)).toEqual(["8A → 9A", "same key"]);
  });

  it("writes library-notation keys as their Camelot codes, text and chips alike", () => {
    const classic = {
      ...SHAPE,
      entries: SHAPE.entries.map((e) =>
        e.entry_id === E1 ? { ...e, key: "Am" } : e.entry_id === E2 ? { ...e, key: "Em" } : e,
      ),
    };
    expect(captionFrom(E1, classic)[0]).toBe("8A → 9A");
    expect(captionKeys(transitionOf(FRIDAY_ENTRIES, E1)!, classic)).toEqual({ from: "8A", to: "9A" });
    expect(captionKeys(transitionOf(FRIDAY_ENTRIES, E5)!, classic)).toBeNull();
  });

  it("keeps the full tempos for the title: the detail", () => {
    expect(captionDetail(transitionOf(FRIDAY_ENTRIES, E1)!, SHAPE)).toBe("122 → 124 BPM (+1.6%)");
    expect(captionDetail(transitionOf(FRIDAY_ENTRIES, E1)!, null)).toBeNull();
    expect(captionDetail(transitionOf(FRIDAY_ENTRIES, E5)!, SHAPE)).toBeNull();
  });

  it("says once that a key is missing, and that it was not checked", () => {
    const keyless = {
      ...SHAPE,
      entries: SHAPE.entries.map((e) => (e.entry_id === E2 ? { ...e, key: null, camelot: null } : e)),
    };
    expect(NO_BEATPORT_KEY).toBe("Keys not checked");
    expect(captionFrom(E1, keyless)).toEqual([NO_BEATPORT_KEY, "+1.6% BPM"]);
  });

  it("leaves the tempo out when either side has none, and everything out without the shape", () => {
    const noBpm = {
      ...SHAPE,
      entries: SHAPE.entries.map((e) => (e.entry_id === E2 ? { ...e, bpm: null } : e)),
    };
    expect(captionFrom(E1, noBpm)).toEqual(["8A → 9A", "next key up"]);
    expect(captionSegments(transitionOf(FRIDAY_ENTRIES, E1)!, null)).toEqual([]);
  });

  it("says a clash in the caption even with a key clash warning listed: the warning is a line of its own", () => {
    expect(captionFrom(E3)).toContain(KEYS_CLASH);
  });

  it("is empty for the last entry: there is no transition to read", () => {
    expect(captionFrom(E5)).toEqual([]);
  });

  it("says the same tempo as 0%", () => {
    const flat = {
      ...SHAPE,
      entries: SHAPE.entries.map((e) => (e.entry_id === E2 ? { ...e, bpm: 122 } : e)),
    };
    expect(captionFrom(E1, flat)[2]).toBe("0% BPM");
  });
});

describe("the one warning the caption shows (C15d)", () => {
  // Only the kind and whether it is accepted are read.
  const warn = (kind: SetWarning["kind"], acknowledged = false): SetWarning =>
    ({ kind, acknowledged }) as unknown as SetWarning;

  it("is the first still open, key clash before tempo jump before tempo unknown, the rest counted", () => {
    const list = [warn("tempo_unknown"), warn("tempo_jump"), warn("key_clash")];
    const { shown, others } = mainWarning(list);
    expect(shown?.kind).toBe("key_clash");
    expect(others.map((w) => w.kind)).toEqual(["tempo_jump", "tempo_unknown"]);
    expect(mainWarning([warn("tempo_unknown"), warn("tempo_jump")]).shown?.kind).toBe("tempo_jump");
  });

  it("passes an accepted one over for an open one, and falls back to it when all are accepted", () => {
    expect(mainWarning([warn("key_clash", true), warn("tempo_jump")]).shown?.kind).toBe("tempo_jump");
    const all = mainWarning([warn("tempo_jump", true), warn("key_clash", true)]);
    expect(all.shown?.kind).toBe("key_clash");
    expect(all.others).toHaveLength(1);
  });

  it("is none for no warnings, or for kinds the strip does not carry", () => {
    expect(mainWarning([])).toEqual({ shown: null, others: [] });
    expect(mainWarning([warn("file_missing")])).toEqual({ shown: null, others: [] });
  });
});
