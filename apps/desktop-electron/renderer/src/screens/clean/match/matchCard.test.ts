import { describe, expect, it } from "vitest";

import { CARD_FIELDS, CARD_FIELD_LABELS, camelotOf } from "./matchCard";

describe("the key in the app's notation", () => {
  it("turns Beatport's names into Camelot", () => {
    expect(camelotOf("A Minor")).toBe("8A");
    expect(camelotOf("B Major")).toBe("1B");
    expect(camelotOf("F# Minor")).toBe("11A");
    expect(camelotOf("Bb Major")).toBe("6B");
    expect(camelotOf("Eb Minor")).toBe("2A");
  });

  it("keeps a Camelot code and says nothing for no key", () => {
    expect(camelotOf("5a")).toBe("5A");
    expect(camelotOf(null)).toBeNull();
    expect(camelotOf("  ")).toBeNull();
  });

  it("shows a notation it does not know as it came", () => {
    expect(camelotOf("open key 3m")).toBe("open key 3m");
  });
});

describe("the fields a tick names", () => {
  it("are read in a DJ's order, each with its word", () => {
    expect(CARD_FIELDS).toEqual(["key", "bpm", "genre", "label", "year"]);
    expect(CARD_FIELDS.map((field) => CARD_FIELD_LABELS[field])).toEqual(["Key", "BPM", "Genre", "Label", "Year"]);
  });
});
