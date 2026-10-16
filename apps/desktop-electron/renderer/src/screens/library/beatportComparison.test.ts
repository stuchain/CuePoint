import { describe, expect, it } from "vitest";

import { agreeLine, beatportGenres, compareBeatportRows, joinLabels, releaseLine, scoreWords } from "./beatportComparison";
import type { BeatportFieldRow } from "./libraryClean";

function row(field: string, label: string, imported: string, beatport: string, effective = imported): BeatportFieldRow {
  return { field, label, imported, beatport, effective, source: "rekordbox" } as BeatportFieldRow;
}

describe("compareBeatportRows", () => {
  it("lists equal fields once and keeps only the ones that differ", () => {
    const { agree, applied, differ } = compareBeatportRows([
      row("bpm", "BPM", "127", "127"),
      row("genre", "Genre", "House", "Techno"),
      row("label", "Label", "ISOLATE", "isolate "),
      row("year", "Year", "2026", "2026"),
    ]);
    expect(agree).toEqual(["BPM", "Label", "Year"]);
    expect(applied).toEqual([]);
    expect(differ.map((r) => r.field)).toEqual(["genre"]);
  });

  it("counts a value applied from Beatport as agreeing, and says it was applied", () => {
    const { agree, applied, differ } = compareBeatportRows([
      row("genre", "Genre", "House", "Melodic House & Techno", "Melodic House & Techno"),
    ]);
    expect(agree).toEqual(["Genre"]);
    expect(applied).toEqual(["Genre"]);
    expect(differ).toEqual([]);
  });

  it("calls a field that is used differently from Beatport a difference even if Rekordbox agrees", () => {
    const { agree, differ } = compareBeatportRows([row("bpm", "BPM", "127", "127", "128")]);
    expect(agree).toEqual([]);
    expect(differ).toHaveLength(1);
  });

  it("skips a field Beatport has no value for", () => {
    const { agree, differ } = compareBeatportRows([row("year", "Year", "2026", "")]);
    expect(agree).toEqual([]);
    expect(differ).toEqual([]);
  });

  it("agrees on a genre among Beatport's several, and lists the rest", () => {
    const { agree, alsoGenres, differ } = compareBeatportRows([
      row(
        "genre",
        "Genre",
        "Melodic House & Techno",
        "Melodic House & Techno, Melodic House & Techno|Melodic Techno, Afro House",
      ),
    ]);
    expect(agree).toEqual(["Genre"]);
    expect(alsoGenres).toEqual(["Melodic Techno", "Afro House"]);
    expect(differ).toEqual([]);
  });

  it("calls a genre that is not among Beatport's a difference", () => {
    const { agree, differ } = compareBeatportRows([row("genre", "Genre", "House", "Techno, Afro House")]);
    expect(agree).toEqual([]);
    expect(differ).toHaveLength(1);
  });
});

describe("beatportGenres", () => {
  it("splits on commas and bars, trims and keeps each once, ignoring case", () => {
    expect(beatportGenres("A & B, a & b|C ,, D")).toEqual(["A & B", "C", "D"]);
  });
});

describe("the words", () => {
  it("joins labels", () => {
    expect(joinLabels(["BPM", "Label", "Year"])).toBe("BPM, label and year");
    expect(joinLabels(["Genre"])).toBe("genre");
  });
  it("says nothing when nothing agrees, and the right verb otherwise", () => {
    expect(agreeLine([])).toBe("");
    expect(agreeLine(["BPM"])).toBe("BPM matches");
    expect(agreeLine(["BPM", "Year"])).toBe("BPM and year match");
    expect(agreeLine(["Genre", "Label"])).toBe("Genre and label match");
  });
  it("names the release", () => {
    expect(
      releaseLine({ title: "Don't Make Me", mix: "Original Mix", artists: "Blackloud", label: "ISOLATE", release_name: "Rel" }),
    ).toBe("Blackloud – Don't Make Me (Original Mix) · ISOLATE");
    // A title that already carries the mix is not given it twice.
    expect(
      releaseLine({ title: "Strobe (Extended Mix)", mix: "Extended Mix", artists: "deadmau5", label: "mau5trap", release_name: "Rel" }),
    ).toBe("deadmau5 – Strobe (Extended Mix) · mau5trap");
    expect(releaseLine({ title: "T", mix: null, artists: null, label: null, release_name: "Rel" })).toBe("T · Rel");
  });
  it("words the score", () => {
    expect(scoreWords(141)).toBe("score 141");
    expect(scoreWords(96.54)).toBe("score 96.5");
    expect(scoreWords(null)).toBe("");
  });
});
