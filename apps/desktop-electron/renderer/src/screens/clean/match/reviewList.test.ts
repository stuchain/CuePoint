/** The words and the parts of the review table. */
import { describe, expect, it } from "vitest";

import type { ReviewCandidate } from "../../../api/cuepointBridge.types";
import {
  allTickedLine,
  leftOutWords,
  matchParts,
  matchText,
  reviewCandidateOf,
  statusLabel,
  summaryWords,
  syncLabel,
  tickedLine,
} from "./reviewList";

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
  it("names the four places a track can be, as the table says them", () => {
    expect(statusLabel("matched")).toBe("Matched");
    expect(statusLabel("to_check")).toBe("Check");
    expect(statusLabel("not_found")).toBe("Not found");
    expect(statusLabel("search_failed")).toBe("Search failed");
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
    expect(leftOutWords({ matched: 5, to_check: 1, not_found: 2, search_failed: 0 })).toBe("2 not found");
    expect(leftOutWords({ matched: 5, to_check: 1, not_found: 2, search_failed: 3 })).toBe(
      "2 not found · 3 search failed",
    );
    expect(leftOutWords({ matched: 5, to_check: 0, not_found: 0, search_failed: 0 })).toBe("");
  });

  it("names the playlist on the Sync button", () => {
    expect(syncLabel("hJ")).toBe("Sync hJ to files…");
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
