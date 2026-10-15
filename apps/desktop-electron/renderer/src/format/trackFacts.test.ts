import { describe, expect, it } from "vitest";
import { keyDisplay, toCamelot, trackFactParts, trackFactsLine } from "./trackFacts";

describe("toCamelot", () => {
  it.each([
    ["Am", "8A"],
    ["A minor", "8A"],
    ["C", "8B"],
    ["C major", "8B"],
    ["F♯m", "11A"],
    ["F#m", "11A"],
    ["Bb", "6B"],
    ["B♭m", "3A"],
    ["Ebm", "2A"],
    ["G#m", "1A"],
    ["B", "1B"],
    ["Bm", "10A"],
    ["Cb", "1B"],
    ["8a", "8A"],
    ["08A", "8A"],
    ["12B", "12B"],
  ])("%s is %s", (key, code) => {
    expect(toCamelot(key)).toBe(code);
  });
  it("is null for what is not a key", () => {
    expect(toCamelot("13A")).toBeNull();
    expect(toCamelot("hello")).toBeNull();
    expect(toCamelot("")).toBeNull();
    expect(toCamelot(null)).toBeNull();
  });
});

describe("keyDisplay", () => {
  it("shows the Camelot code, or the text when it is not a key", () => {
    expect(keyDisplay("Am")).toBe("8A");
    expect(keyDisplay(" 4A ")).toBe("4A");
    expect(keyDisplay("odd")).toBe("odd");
    expect(keyDisplay(null)).toBe("");
  });
});

describe("trackFactsLine", () => {
  it("orders artist, label, key, BPM, year", () => {
    expect(
      trackFactsLine({ artist: "Bicep", label: "Ninja Tune", key: "Am", bpm: 128, year: 2021 }),
    ).toBe("Bicep · Ninja Tune · 8A · 128 BPM · 2021");
  });
  it("skips what is missing", () => {
    expect(trackFactsLine({ artist: "Bicep", key: null, bpm: 127.35, year: 0 })).toBe(
      "Bicep · 127.4 BPM",
    );
    expect(trackFactsLine({})).toBe("");
    expect(trackFactParts({ label: "  ", year: "2020" })).toEqual(["2020"]);
  });
});
