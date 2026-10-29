import { describe, expect, it } from "vitest";

import type { TrackMatchState } from "../../api/cuepointBridge.types";
import {
  clampLabel,
  decisionLine,
  differingParts,
  duplicateCountLine,
  attemptLabel,
  exportedLine,
  fileStatusHint,
  fileStatusLabel,
  matchStartedLine,
  matchStateLabel,
  rejectReasonText,
  signalExplanation,
  signalLabel,
} from "./cleanFormat";

describe("a run's name within the engine's limit", () => {
  it("leaves a name of 200 characters or fewer alone", () => {
    expect(clampLabel("All tracks")).toBe("All tracks");
    expect(clampLabel("x".repeat(200))).toBe("x".repeat(200));
  });

  it("cuts a longer one to 199 characters and an ellipsis", () => {
    const clamped = clampLabel("y".repeat(201));
    expect(clamped).toHaveLength(200);
    expect(clamped).toBe(`${"y".repeat(199)}…`);
  });
});

function state(overrides: Partial<TrackMatchState>): TrackMatchState {
  return {
    track_id: 1,
    state: "accepted",
    decided_by: "auto",
    attempt_id: 1,
    candidate_id: 1,
    newer_attempt_id: null,
    disputed: false,
    decided_at: null,
    ...overrides,
  };
}

describe("where a track stands", () => {
  it("says who decided", () => {
    expect(decisionLine(state({ decided_by: "auto" }))).toBe("Confirmed automatically");
    expect(decisionLine(state({ decided_by: "user" }))).toBe("Confirmed by you");
    expect(decisionLine(state({ state: "rejected", decided_by: "user" }))).toBe("Rejected by you");
    expect(decisionLine(state({ state: "needs_review", decided_by: null }))).toBe("To check");
    expect(decisionLine(state({ state: "no_match" }))).toBe("No match");
    expect(decisionLine(state({ state: "not_matched" }))).toBe("Not looked up yet");
  });

  it("says when a newer match disagrees", () => {
    expect(decisionLine(state({ decided_by: "user", disputed: true }))).toBe(
      "Confirmed by you - changed after you confirmed",
    );
  });

  it("labels every state and nothing for none", () => {
    // CLN-4 and D2: one set of words for the Match area, the Library and the Inspector.
    expect(matchStateLabel("needs_review")).toBe("To check");
    expect(matchStateLabel("accepted")).toBe("Confirmed");
    expect(matchStateLabel("rejected")).toBe("Rejected");
    expect(matchStateLabel("no_match")).toBe("No match");
    expect(matchStateLabel("not_matched")).toBe("Not looked up yet");
    expect(matchStateLabel(null)).toBe("");
    expect(fileStatusLabel("unreadable")).toBe("Unreadable");
    expect(fileStatusLabel(undefined)).toBe("");
    expect(fileStatusHint("unreadable")).toBe("the file is there but CuePoint cannot open it");
    expect(fileStatusHint("missing")).toMatch(/nothing is at that path/);
    expect(fileStatusHint("present")).toBe("");
  });
});

describe("why a guard ruled out a candidate", () => {
  it.each([
    ["guard_artist_sim_no_overlap", "Ruled out: no artist in common"],
    ["guard_title_subset_match", "Ruled out: its title is only part of this track's title"],
    ["guard_title_token_coverage", "Ruled out: too few words of the title match"],
    ["title_only_too_low", "Ruled out: no artist to compare, and the title is not close enough"],
    ["no_title", "Ruled out: Beatport gave it no title"],
    ["", "Ruled out by a check"],
    [null, "Ruled out by a check"],
    ["a_new_guard", "Ruled out: a new guard"],
  ])("%s", (reason, text) => {
    expect(rejectReasonText(reason)).toBe(text);
  });
});

describe("duplicate signals", () => {
  it("names and explains each", () => {
    expect(signalLabel("path")).toBe("Same file");
    expect(signalLabel("beatport")).toBe("Same Beatport track");
    expect(signalLabel("text")).toBe("Same artist and title");
    expect(signalExplanation("text")).toMatch(/two seconds/);
    expect(signalExplanation("path")).toMatch(/same file/);
    expect(signalExplanation("beatport")).toMatch(/Beatport/);
  });
});

describe("sentences about what was done", () => {
  it("says what a match started and left out", () => {
    expect(matchStartedLine({ planned: 1, excluded: 0 })).toBe("Matching 1 track on Beatport.");
    expect(matchStartedLine({ planned: 1200, excluded: 3 })).toBe(
      "Matching 1,200 tracks on Beatport. 3 already matched or decided are left out.",
    );
    expect(matchStartedLine({ planned: 2, excluded: 1 })).toMatch(/1 already matched or decided is/);
  });


  it("says what was exported", () => {
    expect(exportedLine(2, "C:\\out\\review-list.csv")).toBe(
      "Exported 2 tracks to review-list.csv.",
    );
    expect(exportedLine(1, "/out/list.json")).toBe("Exported 1 track to list.json.");
  });

  it("names an attempt by when, what came of it, and its notes", () => {
    const attempt = { id: 5, outcome: "matched" as const, finished_at: "<recorded>" };
    expect(attemptLabel(attempt, 0, 5)).toBe("<recorded> - matched (latest, decided)");
    expect(attemptLabel({ ...attempt, outcome: "no_match" }, 1, null)).toBe(
      "<recorded> - no match",
    );
    expect(attemptLabel({ ...attempt, outcome: "error" }, 2, null)).toBe("<recorded> - search failed");
  });
});

describe("duplicates, by track (D18)", () => {
  it("lights the words that differ, wherever they sit in the title", () => {
    expect(differingParts("Touch Me (Hotlap Remix)", ["Hotlap Remix"])).toEqual([
      { text: "Touch Me (", differs: false },
      { text: "Hotlap Remix", differs: true },
      { text: ")", differs: false },
    ]);
    expect(differingParts("Touch Me", [])).toEqual([{ text: "Touch Me", differs: false }]);
    expect(differingParts("Touch Me", ["Remix"])).toEqual([{ text: "Touch Me", differs: false }]);
  });

  it("joins words that overlap or touch into one lit part", () => {
    expect(differingParts("A Extended Mix", ["Extended", "Extended Mix"])).toEqual([
      { text: "A ", differs: false },
      { text: "Extended Mix", differs: true },
    ]);
  });

  it("counts groups and tracks the same everywhere", () => {
    expect(duplicateCountLine(2, 4)).toBe("2 duplicate groups (4 tracks)");
    expect(duplicateCountLine(1, 2)).toBe("1 duplicate group (2 tracks)");
    expect(duplicateCountLine(3, undefined)).toBe("3 duplicate groups");
  });

  it("says a queued match waits for the running one (M510)", () => {
    expect(matchStartedLine({ planned: 5, excluded: 0, queued: true })).toBe(
      "Queued: 5 tracks will be matched on Beatport after the running match.",
    );
  });
});
