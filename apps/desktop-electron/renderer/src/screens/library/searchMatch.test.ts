import { describe, expect, it } from "vitest";

import { matchedLabel } from "./searchMatch";

describe("matchedLabel", () => {
  it("names the key a row was found by", () => {
    expect(matchedLabel({ matched_on: "key", effective_key: "8A", effective_bpm: 124 })).toBe(
      "Key 8A",
    );
  });

  it("names the tempo, as a person writes it", () => {
    expect(matchedLabel({ matched_on: "bpm", effective_key: null, effective_bpm: 123.60000000000001 })).toBe(
      "123.6 BPM",
    );
    expect(matchedLabel({ matched_on: "bpm", effective_key: null, effective_bpm: 124 })).toBe(
      "124 BPM",
    );
  });

  it("says nothing for a row found by its words, or one the engine did not mark", () => {
    expect(matchedLabel({ matched_on: null, effective_key: "8A", effective_bpm: 124 })).toBeNull();
    expect(matchedLabel({ effective_key: "8A", effective_bpm: 124 })).toBeNull();
  });

  it("says nothing it cannot back up", () => {
    expect(matchedLabel({ matched_on: "key", effective_key: null })).toBeNull();
    expect(matchedLabel({ matched_on: "bpm", effective_bpm: null })).toBeNull();
  });
});
