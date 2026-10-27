import { describe, expect, it } from "vitest";

import { beatportGenres, comparisonRows, matchStrength, matchStrengthTitle } from "./beatportComparison";
import type { BeatportFieldRow } from "./libraryClean";

function row(field: string, label: string, imported: string, beatport: string, effective = imported): BeatportFieldRow {
  return { field, label, imported, beatport, effective, source: "rekordbox" } as BeatportFieldRow;
}

const TRACK = { title: "Slow Daylight", artist: "Anouk Dreyer", key: "1A", effective_key: "1A", year: 2021 };
const CANDIDATE = {
  title: "Slow Daylight",
  artists: "Anouk Dreyer",
  key: "1A",
  bpm: 136,
  genre: "Techno (Peak Time / Driving)",
  label: "Monochrome Hours",
  release_year: 2021,
};

describe("comparisonRows (M134)", () => {
  const fields = [
    row("bpm", "BPM", "136", "136"),
    row("genre", "Genre", "Techno", "Techno (Peak Time / Driving)"),
    row("label", "Label", "Monochrome Hours", "Monochrome Hours"),
    row("year", "Year", "2021", "2021"),
  ];

  it("puts Rekordbox's value beside Beatport's, one row per field, in reading order", () => {
    const rows = comparisonRows(TRACK, CANDIDATE, fields);
    expect(rows.map((r) => r.id)).toEqual(["title", "artist", "key", "bpm", "genre", "label", "year"]);
    expect(rows.find((r) => r.id === "bpm")).toMatchObject({ rekordbox: "136", beatport: "136", differs: false });
  });

  it("flags only the rows where what is used is not what Beatport has", () => {
    const rows = comparisonRows(TRACK, CANDIDATE, fields);
    expect(rows.find((r) => r.id === "genre")?.differs).toBe(true);
    expect(rows.filter((r) => r.differs).map((r) => r.id)).toEqual(["genre"]);
  });

  it("counts a genre among Beatport's several as agreeing", () => {
    const rows = comparisonRows(TRACK, { ...CANDIDATE, genre: "Techno, House" }, [
      ...fields.filter((f) => f.field !== "genre"),
      row("genre", "Genre", "Techno", "Techno, House"),
    ]);
    expect(rows.find((r) => r.id === "genre")?.differs).toBe(false);
  });

  it("names what is used when it is not Rekordbox's, and a title that differs only in case agrees", () => {
    const rows = comparisonRows(
      { ...TRACK, title: "slow daylight" },
      CANDIDATE,
      [row("bpm", "BPM", "135", "136", "136"), ...fields.slice(1)],
    );
    expect(rows.find((r) => r.id === "bpm")).toMatchObject({ rekordbox: "135", using: "136", differs: false });
    expect(rows.find((r) => r.id === "title")).toMatchObject({ using: null, differs: false });
  });

  it("leaves out a field neither side has a value for", () => {
    const rows = comparisonRows({ ...TRACK, key: null, effective_key: null }, { ...CANDIDATE, key: null }, fields);
    expect(rows.map((r) => r.id)).not.toContain("key");
  });

  it("shows Beatport's side blank when there is no candidate", () => {
    const rows = comparisonRows(TRACK, null, [row("bpm", "BPM", "136", "")]);
    expect(rows.every((r) => r.beatport === "" && !r.differs)).toBe(true);
  });
});

describe("beatportGenres", () => {
  it("splits on commas and bars, trims and keeps each once, ignoring case", () => {
    expect(beatportGenres("Techno, house | TECHNO ,")).toEqual(["Techno", "house"]);
  });
});

describe("the words for a score (M134, D16)", () => {
  it.each([
    [141, "Strong match"],
    [95, "Strong match"],
    [94.9, "Good match"],
    [85, "Good match"],
    [70, "Weak match"],
    [null, ""],
  ])("%s reads %s", (score, words) => {
    expect(matchStrength(score)).toBe(words);
  });

  it("keeps the number and the bands for the hover", () => {
    expect(matchStrengthTitle(96.54)).toBe("Match score 96.5: 95 or more is a strong match, 85 or more a good one.");
    expect(matchStrengthTitle(null)).toBe("");
  });
});
