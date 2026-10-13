import { describe, expect, it } from "vitest";

import { camelotOf, keyHue, keyRing } from "./keyColour";

/**
 * The one reading of a key's text (DEC-201): Beatport's classic spelling, a spelled name or a
 * Camelot code, each as the code the app draws. This table merges the two tables the app had
 * before the parser was shared (Discover's and the match card's).
 */
describe("a key's text read as a Camelot code", () => {
  it.each([
    ["Am", "8A"],
    ["C", "8B"],
    ["F#m", "11A"],
    ["Gb", "2B"],
    ["Ebm", "2A"],
    ["Bbm", "3A"],
    ["G#m", "1A"],
    ["B", "1B"],
    ["A Minor", "8A"],
    ["B Major", "1B"],
    ["F# Major", "2B"],
    ["F# Minor", "11A"],
    ["Bb Major", "6B"],
    ["Eb Minor", "2A"],
    ["E♭ minor", "2A"],
    ["EB MINOR", "2A"],
    ["ABm", "1A"],
    ["AB", "4B"],
    ["F♯m", "11A"],
    ["8A", "8A"],
    ["12b", "12B"],
    ["5a", "5A"],
    ["  9A ", "9A"],
  ])("reads %s as %s", (text, camelot) => {
    expect(camelotOf(text)).toBe(camelot);
  });

  it("tells a lone M (major) from a lone m (minor)", () => {
    expect(camelotOf("AM")).toBe("11B");
    expect(camelotOf("Am")).toBe("8A");
  });

  it.each([null, undefined, "", "  ", "H", "13A", "0B", "loud", "Cmaj7", "open key 3m"])(
    "reads %j as no key",
    (text) => {
      expect(camelotOf(text)).toBeNull();
    },
  );
});

describe("a code's hue and ring", () => {
  it("is the Camelot number and the ring letter", () => {
    expect(keyHue("1A")).toBe(1);
    expect(keyHue("12B")).toBe(12);
    expect(keyRing("8A")).toBe("A");
    expect(keyRing("8B")).toBe("B");
  });

  it("is null for anything that is not a code", () => {
    expect(keyHue("13A")).toBeNull();
    expect(keyHue("Am")).toBeNull();
    expect(keyRing("")).toBeNull();
  });
});
