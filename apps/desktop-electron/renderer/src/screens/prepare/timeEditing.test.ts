import { describe, expect, it } from "vitest";

import { FRIDAY, REFUSALS } from "./prepare.testFixture";
import { nextTimeTarget, timeRefusalWords, timeTexts, timesToSave } from "./timeEditing";

/**
 * Typing In and Out in the Set table (FLW-18): what a typed cell sends, where
 * Enter and Tab go next, and how a refusal reads on the facts line.
 */
const entries = FRIDAY.entries.entries;
const first = entries[0]!; // Warm One, in 0:30, out 4:30
const second = entries[1]!; // Warm Two, in none, out 5:20

describe("what a typed cell saves", () => {
  it("sends both times, the one typed and the other as it is", () => {
    expect(timesToSave(timeTexts(first), "in", "1:00")).toEqual({ changed: true, in_time: "1:00", out_time: "4:30" });
    expect(timesToSave(timeTexts(first), "out", "4:00")).toEqual({ changed: true, in_time: "0:30", out_time: "4:00" });
  });

  it("sends nothing for a cell left as it was, whitespace aside", () => {
    expect(timesToSave(timeTexts(first), "in", " 0:30 ").changed).toBe(false);
    expect(timesToSave(timeTexts(second), "in", "").changed).toBe(false);
  });

  it("builds on what the last save wrote when the Set has not been read again", () => {
    expect(timesToSave({ in: "1:00", out: "" }, "out", "4:00")).toEqual({
      changed: true,
      in_time: "1:00",
      out_time: "4:00",
    });
  });

  it("clears a time with a blank cell", () => {
    expect(timesToSave(timeTexts(first), "out", "  ")).toEqual({ changed: true, in_time: "0:30", out_time: null });
  });
});

describe("where Enter and Tab go next", () => {
  it("goes from In to Out of the same entry, and from Out to the next entry's In", () => {
    expect(nextTimeTarget(entries, first.entry_id, "in", 1)).toEqual({ entryId: first.entry_id, field: "out" });
    expect(nextTimeTarget(entries, first.entry_id, "out", 1)).toEqual({ entryId: second.entry_id, field: "in" });
  });

  it("goes back the same way", () => {
    expect(nextTimeTarget(entries, second.entry_id, "in", -1)).toEqual({ entryId: first.entry_id, field: "out" });
    expect(nextTimeTarget(entries, first.entry_id, "out", -1)).toEqual({ entryId: first.entry_id, field: "in" });
  });

  it("ends at the Set's last Out and first In", () => {
    const last = entries[entries.length - 1]!;
    expect(nextTimeTarget(entries, last.entry_id, "out", 1)).toBeNull();
    expect(nextTimeTarget(entries, first.entry_id, "in", -1)).toBeNull();
    expect(nextTimeTarget(entries, 99999, "in", 1)).toBeNull();
  });

  it("follows the running order, not the entry ids", () => {
    const shuffled = [...entries].sort((a, b) => b.position - a.position);
    expect(nextTimeTarget(shuffled, first.entry_id, "out", 1)).toEqual({ entryId: second.entry_id, field: "in" });
  });
});

describe("a refused time on the facts line", () => {
  it("says the engine's reason first and the entry last, so the reason shows whatever the width", () => {
    const words = timeRefusalWords("Warm One", REFUSALS.badTime.message);
    expect(words.reason).toBe("Not saved: An entry must come in before it goes out: in 4:30, out 0:30");
    expect(words.entry).toBe("(Warm One)");
    expect(words.line).toBe(`${words.reason} ${words.entry}`);
  });

  it("calls an entry without a title by its place", () => {
    expect(timeRefusalWords("", "x").line).toBe("Not saved: x (an untitled track)");
  });
});
