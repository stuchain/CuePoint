/** The words and order of the review list (the Review tab), as pure functions. */
import { describe, expect, it } from "vitest";

import type { MatchCandidate, ReviewCandidate, ReviewStatus, ReviewTrack } from "../../../api/cuepointBridge.types";
import {
  acceptAllLabel,
  acceptQuestion,
  decisionLine,
  bandSegments,
  candidateLine,
  chipsOf,
  differsText,
  filterRows,
  isReviewed,
  nextUndecided,
  orderRows,
  reviewCandidateOf,
  reviewedWords,
  statusLabel,
} from "./reviewList";

function row(id: number, status: ReviewStatus, overrides: Partial<ReviewTrack> = {}): ReviewTrack {
  return {
    track_id: id,
    title: `Title ${id}`,
    artist: `Artist ${id}`,
    status,
    decision: status === "done" ? "accepted" : null,
    disputed: false,
    undo_batch: null,
    cursor: `0:${id}`,
    candidate: null,
    differing: [],
    ...overrides,
  };
}

function candidate(overrides: Partial<ReviewCandidate> = {}): ReviewCandidate {
  return {
    id: 1,
    title: "Glue",
    artists: "Bicep",
    mix: null,
    key: null,
    bpm: null,
    label: null,
    genre: null,
    release_year: null,
    score: 90,
    guard_ok: true,
    ...overrides,
  };
}

const COUNTS = { to_check: 9, not_found: 2, search_failed: 0, matched: 13, done: 0 };

describe("statusLabel", () => {
  it("is the word on the chip", () => {
    expect(statusLabel("to_check")).toBe("To check");
    expect(statusLabel("not_found")).toBe("Not found");
    expect(statusLabel("search_failed")).toBe("Search failed");
    expect(statusLabel("matched")).toBe("Matched");
    expect(statusLabel("done")).toBe("Done");
  });
});

describe("chipsOf", () => {
  it("is All, To check, Not found and Matched with their counts", () => {
    expect(chipsOf(COUNTS, 24)).toEqual([
      { id: "all", label: "All", count: 24 },
      { id: "to_check", label: "To check", count: 9 },
      { id: "not_found", label: "Not found", count: 2 },
      { id: "matched", label: "Matched", count: 13 },
    ]);
  });

  it("adds Rejected and Changed since you decided when there are some", () => {
    const chips = chipsOf(COUNTS, 24, { rejected: 2, disputed: 1 });
    expect(chips.slice(-2)).toEqual([
      { id: "rejected", label: "Rejected", count: 2 },
      { id: "disputed", label: "Changed since you decided", count: 1 },
    ]);
    expect(chipsOf(COUNTS, 24, { rejected: 0, disputed: 0 }).map((chip) => chip.id)).not.toContain("rejected");
  });

  it("adds Search failed and Done only when there are some", () => {
    const chips = chipsOf({ ...COUNTS, search_failed: 3, done: 4 }, 31).map((chip) => chip.id);
    expect(chips).toEqual(["all", "to_check", "not_found", "search_failed", "matched", "done"]);
  });
});

describe("orderRows and filterRows", () => {
  const rows = [row(1, "done"), row(2, "to_check"), row(3, "matched"), row(4, "done"), row(5, "not_found")];

  it("puts decided rows at the bottom, keeping the order of each part", () => {
    expect(orderRows(rows).map((entry) => entry.track_id)).toEqual([2, 3, 5, 1, 4]);
  });

  it("filters by status, and All keeps every row", () => {
    expect(filterRows(rows, "all")).toHaveLength(5);
    expect(filterRows(rows, "to_check").map((entry) => entry.track_id)).toEqual([2]);
    expect(filterRows(rows, "done").map((entry) => entry.track_id)).toEqual([1, 4]);
  });

  it("filters Rejected and Changed since you decided by what the person decided and what disputes it", () => {
    const more = [
      row(1, "done", { decision: "rejected" }),
      row(2, "done"),
      row(3, "to_check", { disputed: true }),
    ];
    expect(filterRows(more, "rejected").map((entry) => entry.track_id)).toEqual([1]);
    expect(filterRows(more, "disputed").map((entry) => entry.track_id)).toEqual([3]);
  });
});

describe("differsText", () => {
  it("names what differs, in the words the list uses", () => {
    expect(differsText(row(1, "to_check", { differing: ["title"] }))).toEqual({ text: "title", tone: "differs" });
    expect(differsText(row(1, "to_check", { differing: ["remix", "bpm"] }))).toEqual({
      text: "remix, BPM",
      tone: "differs",
    });
  });

  it("is a tick when a match is there and nothing differs, and nothing without a match", () => {
    expect(differsText(row(1, "matched", { candidate: candidate() }))).toEqual({ text: "✓", tone: "same" });
    expect(differsText(row(1, "not_found"))).toEqual({ text: "", tone: "none" });
  });
});

describe("candidateLine", () => {
  it("is the title and the artists", () => {
    expect(
      candidateLine(candidate({ title: "Physical (Extended Mix)", artists: "Armada", mix: "Extended Mix" })),
    ).toBe("Physical (Extended Mix) · Armada");
  });

  it("adds a mix its title does not carry, and copes with missing parts", () => {
    expect(candidateLine(candidate({ mix: "Edit" }))).toBe("Glue (Edit) · Bicep");
    expect(candidateLine(candidate({ artists: null }))).toBe("Glue");
    expect(candidateLine(null)).toBe("—");
  });
});

describe("bandSegments", () => {
  it("is each status's share of the tracks, in the order of the chips, leaving out empty ones", () => {
    expect(bandSegments(COUNTS, 24)).toEqual([
      { status: "to_check", count: 9, percent: (9 / 24) * 100 },
      { status: "not_found", count: 2, percent: (2 / 24) * 100 },
      { status: "matched", count: 13, percent: (13 / 24) * 100 },
    ]);
  });

  it("has nothing to draw for no tracks", () => {
    expect(bandSegments({ to_check: 0, not_found: 0, search_failed: 0, matched: 0, done: 0 }, 0)).toEqual([]);
  });
});

describe("acceptAllLabel", () => {
  it("says how many matched, and nothing when none is", () => {
    expect(acceptAllLabel(13)).toBe("Confirm all 13 matched");
    expect(acceptAllLabel(1200)).toBe("Confirm all 1,200 matched");
    expect(acceptAllLabel(0)).toBeNull();
  });
});

describe("isReviewed and reviewedWords", () => {
  it("is reviewed once every track is decided", () => {
    expect(isReviewed({ to_check: 0, not_found: 0, search_failed: 0, matched: 0, done: 24 }, 24)).toBe(true);
    expect(isReviewed(COUNTS, 24)).toBe(false);
    expect(isReviewed({ to_check: 0, not_found: 0, search_failed: 0, matched: 0, done: 0 }, 0)).toBe(false);
  });

  it("says what was decided in two lines", () => {
    expect(reviewedWords("hJ", [row(1, "done"), row(2, "done", { decision: "rejected" }), row(3, "done")])).toEqual({
      headline: "hJ is reviewed",
      detail: "2 confirmed · 1 left unmatched",
    });
    expect(reviewedWords("hJ", [row(1, "done")]).detail).toBe("1 confirmed");
  });
});

describe("nextUndecided", () => {
  const shown = [row(1, "to_check"), row(2, "done"), row(3, "matched"), row(4, "to_check")];

  it("is the next row after this one that is not decided", () => {
    expect(nextUndecided(shown, 1)).toBe(3);
    expect(nextUndecided(shown, 3)).toBe(4);
  });

  it("wraps to the first, and is null when everything is decided", () => {
    expect(nextUndecided(shown, 4)).toBe(1);
    expect(nextUndecided([row(1, "done"), row(2, "done")], 1)).toBeNull();
  });
});

describe("acceptQuestion", () => {
  it("names the count and the values that will be copied", () => {
    expect(acceptQuestion(13, new Set(["bpm", "genre", "label", "year"] as const))).toBe(
      "Confirm 13 and update BPM, Genre, Label, Year?",
    );
  });

  it("says when the key replaces the person's own, and when nothing is copied", () => {
    expect(acceptQuestion(1200, new Set(["key", "bpm"] as const), "Correct")).toBe(
      "Correct 1,200 and update Key (replaces yours), BPM?",
    );
    expect(acceptQuestion(2, new Set())).toBe("Confirm 2 without copying any values?");
  });
});

describe("decisionLine", () => {
  it("says what was done to a track", () => {
    expect(decisionLine("correct", "Strobe")).toBe("Corrected “Strobe”.");
    expect(decisionLine("not-this", "Strobe")).toBe("Marked “Strobe” as not this track.");
    expect(decisionLine("leave", "Strobe")).toBe("Left “Strobe” unmatched.");
    expect(decisionLine("undo", "Strobe")).toBe("Undid the decision on “Strobe”.");
  });
});

describe("reviewCandidateOf", () => {
  it("keeps the few facts the list draws, and a missing mix as none", () => {
    const found = reviewCandidateOf({ ...candidate(), id: 9, mix: undefined } as unknown as MatchCandidate);
    expect(found).toMatchObject({ id: 9, title: "Glue", artists: "Bicep", mix: null, guard_ok: true });
    expect(Object.keys(found).sort()).toEqual(
      ["artists", "bpm", "genre", "guard_ok", "id", "key", "label", "mix", "release_year", "score", "title"].sort(),
    );
  });
});
