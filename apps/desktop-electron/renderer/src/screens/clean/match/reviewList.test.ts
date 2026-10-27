/** The words and the parts of the review table. */
import { describe, expect, it } from "vitest";

import type { ReviewCandidate } from "../../../api/cuepointBridge.types";
import {
  allTickedLine,
  leftOutWords,
  matchParts,
  matchText,
  nextToCheck,
  reviewCandidateOf,
  barFacts,
  statusIsQuiet,
  statusLabel,
  statusTone,
  summaryWords,
  tickedLine,
  toCheckOnlyLabel,
} from "./reviewList";
import { reviewTrack } from "../../../test/matchFixtures";

function candidate(overrides: Partial<ReviewCandidate> = {}): ReviewCandidate {
  return {
    id: 1,
    title: "You Don't Know Me (Intro)",
    artists: "Armand Van Helden",
    mix: "Intro",
    key: "A Minor",
    bpm: 125,
    label: "Armada",
    genre: "House",
    release_year: 1999,
    score: 90,
    guard_ok: true,
    ...overrides,
  };
}

describe("statusLabel", () => {
  it("names the four places a track can be, in the words every page uses (D2)", () => {
    expect(statusLabel("matched")).toBe("Confirmed");
    expect(statusLabel("to_check")).toBe("To check");
    expect(statusLabel("not_found")).toBe("No match");
    expect(statusLabel("search_failed")).toBe("Search failed");
  });

  it("gives only the tracks that need a look a chip: confirmed is quiet (D14)", () => {
    expect(statusIsQuiet("matched")).toBe(true);
    expect(statusIsQuiet("to_check")).toBe(false);
    expect(statusIsQuiet("not_found")).toBe(false);
    expect(statusIsQuiet("search_failed")).toBe(false);
    expect(statusTone("to_check")).toBe("warning");
    expect(statusTone("not_found")).toBe("neutral");
    expect(statusTone("search_failed")).toBe("danger");
  });
});

describe("matchParts", () => {
  it("cuts the version out of the title so only it is marked when only the version differs", () => {
    expect(matchParts(candidate(), ["remix"])).toEqual([
      { text: "You Don't Know Me", differs: false },
      { text: "(Intro)", differs: true },
      { text: "· Armand Van Helden", differs: false },
    ]);
  });

  it("marks the title and the artists when those differ", () => {
    const parts = matchParts(candidate(), ["title", "artist"]);
    expect(parts.map((part) => part.differs)).toEqual([true, false, true]);
  });

  it("keeps whatever follows the version", () => {
    const parts = matchParts(candidate({ title: "Glue (Original Mix) [Remastered]", mix: "Original Mix" }), []);
    expect(parts.map((part) => part.text)).toEqual(["Glue", "(Original Mix)", "[Remastered]", "· Armand Van Helden"]);
  });

  it("adds the version after a title that does not name it", () => {
    const parts = matchParts(candidate({ title: "Glue", mix: "Original Mix" }), ["remix"]);
    expect(parts.slice(0, 2)).toEqual([
      { text: "Glue", differs: false },
      { text: "(Original Mix)", differs: true },
    ]);
  });

  it("draws a title with no version, and no artists, as just the title", () => {
    expect(matchParts(candidate({ title: "Glue", mix: null, artists: null }), [])).toEqual([
      { text: "Glue", differs: false },
    ]);
  });

  it("is nothing for a track with no match", () => {
    expect(matchParts(null, ["title"])).toEqual([]);
    expect(matchText(null)).toBe("—");
  });

  it("reads as one line for a label", () => {
    expect(matchText(candidate())).toBe("You Don't Know Me (Intro) · Armand Van Helden");
  });
});

describe("the words over the table", () => {
  it("counts the tracks and the ticked ones", () => {
    expect(summaryWords(84, 82)).toBe("84 tracks · 82 ticked to sync");
    expect(summaryWords(1, 0)).toBe("1 track · 0 ticked to sync");
  });

  it("says what has no match to tick, and nothing when all have one", () => {
    expect(leftOutWords({ matched: 5, to_check: 1, not_found: 2, search_failed: 0 })).toBe("2 no match");
    expect(leftOutWords({ matched: 5, to_check: 1, not_found: 2, search_failed: 3 })).toBe(
      "2 no match · 3 search failed",
    );
    expect(leftOutWords({ matched: 5, to_check: 0, not_found: 0, search_failed: 1 })).toBe("1 search failed");
    expect(leftOutWords({ matched: 5, to_check: 0, not_found: 0, search_failed: 0 })).toBe("");
  });

  it("joins the bar's facts with a middle dot (C181)", () => {
    const counts = { matched: 5, to_check: 1, not_found: 2, search_failed: 0 };
    expect(barFacts(8, 6, counts)).toBe("8 tracks · 6 ticked to sync · 2 no match");
    expect(barFacts(8, 8, { ...counts, not_found: 0 })).toBe("8 tracks · 8 ticked to sync");
  });

  it("says a tick and an untick by the track", () => {
    expect(tickedLine(false, "Glue")).toBe("Unticked “Glue”: it will be left out.");
    expect(tickedLine(true, "Glue")).toBe("Ticked “Glue”: it will be synced.");
  });

  it("says what the header tick did, and when it did nothing", () => {
    expect(allTickedLine(true, 1200)).toBe("Ticked 1,200 tracks: they will be synced.");
    expect(allTickedLine(false, 1)).toBe("Unticked 1 track: they will be left out.");
    expect(allTickedLine(true, 0)).toBe("No track changed.");
  });
});

describe("reviewCandidateOf", () => {
  it("draws a search result as the table draws a match", () => {
    const drawn = reviewCandidateOf({
      id: 9,
      title: "Glue",
      artists: "Bicep",
      mix: undefined,
      key: null,
      bpm: 125,
      label: null,
      genre: null,
      release_year: 2017,
      score: 91,
      guard_ok: true,
    } as never);
    expect(drawn).toMatchObject({ id: 9, mix: null, bpm: 125, score: 91 });
  });
});

describe("the next track to check (M508)", () => {
  const rows = [
    reviewTrack(1, "matched"),
    reviewTrack(2, "to_check"),
    reviewTrack(3, "matched"),
    reviewTrack(4, "to_check"),
  ];

  it("is the next one after this track, and wraps round to the start", () => {
    expect(nextToCheck(rows, 1)?.track_id).toBe(2);
    expect(nextToCheck(rows, 2)?.track_id).toBe(4);
    expect(nextToCheck(rows, 4)?.track_id).toBe(2);
    expect(nextToCheck(rows, null)?.track_id).toBe(2);
  });

  it("is never the track it counts on from, and is null when nothing else waits", () => {
    expect(nextToCheck([reviewTrack(1, "to_check")], 1)).toBeNull();
    expect(nextToCheck([reviewTrack(1, "matched")], null)).toBeNull();
    expect(nextToCheck([], null)).toBeNull();
  });

  it("names the filter with how many it keeps", () => {
    expect(toCheckOnlyLabel(1234)).toBe("To check only (1,234)");
  });
});
