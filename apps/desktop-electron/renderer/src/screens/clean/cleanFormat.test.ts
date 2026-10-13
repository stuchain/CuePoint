import { describe, expect, it } from "vitest";

import type { TrackMatchState } from "../../api/cuepointBridge.types";
import {
  clampLabel,
  attemptLabel,
  correctedLine,
  correctedManyLine,
  decisionLine,
  exportedLine,
  fileStatusHint,
  fileStatusLabel,
  formatWhen,
  matchRunningNote,
  matchStartedLine,
  matchStateLabel,
  nothingToCorrectLine,
  notThisLine,
  undidLine,
  rejectReasonText,
  signalExplanation,
  signalLabel,
} from "./cleanFormat";

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

describe("a run's name within the engine's limit", () => {
  it("leaves a name of 200 characters or fewer alone", () => {
    expect(clampLabel("Whole library")).toBe("Whole library");
    expect(clampLabel("x".repeat(200))).toBe("x".repeat(200));
  });

  it("cuts a longer one to 199 characters and an ellipsis", () => {
    const clamped = clampLabel("y".repeat(201));
    expect(clamped).toHaveLength(200);
    expect(clamped).toBe(`${"y".repeat(199)}…`);
  });
});

describe("where a track stands", () => {
  it("says who decided", () => {
    expect(decisionLine(state({ decided_by: "auto" }))).toBe("Accepted automatically");
    expect(decisionLine(state({ decided_by: "user" }))).toBe("Accepted by you");
    expect(decisionLine(state({ state: "rejected", decided_by: "user" }))).toBe("Rejected by you");
    expect(decisionLine(state({ state: "needs_review", decided_by: null }))).toBe("Waiting for you");
    expect(decisionLine(state({ state: "no_match" }))).toBe("No match");
    expect(decisionLine(state({ state: "not_matched" }))).toBe("Not matched");
  });

  it("says when a newer match disagrees", () => {
    expect(decisionLine(state({ decided_by: "user", disputed: true }))).toBe(
      "Accepted by you — changed since you decided",
    );
  });

  it("labels every state and nothing for none", () => {
    // CLN-4: one set of words for the Match area, the Library and the Inspector.
    expect(matchStateLabel("needs_review")).toBe("Waiting for you");
    expect(matchStateLabel("accepted")).toBe("Accepted");
    expect(matchStateLabel("rejected")).toBe("Rejected");
    expect(matchStateLabel("no_match")).toBe("No match");
    expect(matchStateLabel("not_matched")).toBe("Not matched");
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

  it("says a running match in one line: its name and how far it is (C22)", () => {
    expect(matchRunningNote("hj", { done: 108, total: 180 })).toBe("Matching hj · 108 of 180");
    expect(matchRunningNote("Whole library", { done: 1200, total: 18000 })).toBe(
      "Matching Whole library · 1,200 of 18,000",
    );
    // No name when the page was left and came back.
    expect(matchRunningNote(null, { done: 3, total: 9 })).toBe("Matching · 3 of 9");
  });

  it("is short while the count is not known, and has no explainer sentence", () => {
    expect(matchRunningNote()).toBe("Matching…");
    expect(matchRunningNote("hj", { done: 0, total: 0 })).toBe("Matching hj…");
    expect(matchRunningNote("hj", null)).not.toMatch(/bar at the bottom|keep working/);
  });

  it("says what was corrected, refused and undone, and what changed nothing", () => {
    expect(correctedLine("Strobe")).toBe("Corrected “Strobe”.");
    expect(nothingToCorrectLine("Strobe")).toBe("Nothing to change for “Strobe”.");
    expect(notThisLine("Strobe")).toBe("Marked “Strobe” as not this track.");
    expect(undidLine("Strobe")).toBe("Undid the change to “Strobe”.");
    expect(correctedManyLine(1)).toBe("Corrected 1 track.");
    expect(correctedManyLine(1200)).toBe("Corrected 1,200 tracks.");
  });

  it("says what was exported", () => {
    expect(exportedLine(2, "C:\\out\\review-list.csv")).toBe(
      "Exported 2 tracks to review-list.csv.",
    );
    expect(exportedLine(1, "/out/list.json")).toBe("Exported 1 track to list.json.");
  });

  it("names an attempt by when, what came of it, and its notes", () => {
    const attempt = { id: 5, outcome: "matched" as const, finished_at: "<recorded>" };
    expect(attemptLabel(attempt, 0, 5)).toBe("<recorded> — matched (latest, decided)");
    expect(attemptLabel({ ...attempt, outcome: "no_match" }, 1, null)).toBe(
      "<recorded> — found nothing",
    );
    expect(attemptLabel({ ...attempt, outcome: "error" }, 2, null)).toBe("<recorded> — failed");
  });

  it("shows a time it cannot read as it came", () => {
    expect(formatWhen("<recorded>")).toBe("<recorded>");
    expect(formatWhen(null)).toBe("");
    expect(formatWhen("2026-09-15T10:00:00Z")).not.toBe("2026-09-15T10:00:00Z");
  });
});
