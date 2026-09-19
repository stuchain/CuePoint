import { describe, expect, it } from "vitest";

import type { TrackMatchState } from "../../api/cuepointBridge.types";
import {
  appliedLine,
  decidedLine,
  decisionLine,
  exportedLine,
  fileStatusLabel,
  formatWhen,
  matchStartedLine,
  matchStateLabel,
  resumableLine,
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

describe("where a track stands", () => {
  it("says who decided", () => {
    expect(decisionLine(state({ decided_by: "auto" }))).toBe("Accepted automatically");
    expect(decisionLine(state({ decided_by: "user" }))).toBe("Accepted by you");
    expect(decisionLine(state({ state: "rejected", decided_by: "user" }))).toBe("Rejected by you");
    expect(decisionLine(state({ state: "needs_review", decided_by: null }))).toBe("Needs review");
    expect(decisionLine(state({ state: "no_match" }))).toBe("Beatport found nothing to match");
    expect(decisionLine(state({ state: "not_matched" }))).toBe("Not matched yet");
  });

  it("says when a newer match disagrees", () => {
    expect(decisionLine(state({ decided_by: "user", disputed: true }))).toBe(
      "Accepted by you — a newer match disagrees",
    );
  });

  it("labels every state and nothing for none", () => {
    expect(matchStateLabel("no_match")).toBe("No match");
    expect(matchStateLabel(null)).toBe("");
    expect(fileStatusLabel("unreadable")).toBe("Unreadable");
    expect(fileStatusLabel(undefined)).toBe("");
  });
});

describe("why a guard refused a candidate", () => {
  it.each([
    ["guard_artist_sim_no_overlap", "Refused: no artist in common"],
    ["guard_title_subset_match", "Refused: its title is only part of this track's title"],
    ["guard_title_token_coverage", "Refused: too few words of the title match"],
    ["title_only_too_low", "Refused: no artist to compare, and the title is not close enough"],
    ["no_title", "Refused: Beatport gave it no title"],
    ["", "Refused by a guard"],
    [null, "Refused by a guard"],
    ["a_new_guard", "Refused: a new guard"],
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

describe("a match that can be resumed", () => {
  it("says how much is left, and that only that is matched", () => {
    expect(resumableLine({ remaining: 12, planned: 50 }, 1)).toBe(
      "A match stopped with 12 of 50 tracks left. Resuming matches only those.",
    );
    expect(resumableLine({ remaining: 1, planned: 1 }, 1)).toBe(
      "A match stopped with 1 of 1 track left. Resuming matches only those.",
    );
  });

  it("counts the others rather than listing them", () => {
    expect(resumableLine({ remaining: 1200, planned: 30000 }, 2)).toBe(
      "A match stopped with 1,200 of 30,000 tracks left. 1 other match can be resumed from Activity.",
    );
    expect(resumableLine({ remaining: 3, planned: 9 }, 4)).toMatch(/3 other matches can be resumed/);
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

  it("says what was decided, applied and exported", () => {
    expect(decidedLine("accept", "Strobe")).toBe("Accepted a match for “Strobe”.");
    expect(decidedLine("reject", "Strobe")).toBe("Rejected the match for “Strobe”.");
    expect(decidedLine("clear", "Strobe")).toBe("Cleared your decision for “Strobe”.");
    expect(appliedLine(["Key", "BPM"], "Strobe")).toBe("Applied Key, BPM to “Strobe”.");
    expect(exportedLine(2, "C:\\out\\review-list.csv")).toBe(
      "Exported 2 tracks to review-list.csv.",
    );
    expect(exportedLine(1, "/out/list.json")).toBe("Exported 1 track to list.json.");
  });

  it("shows a time it cannot read as it came", () => {
    expect(formatWhen("<recorded>")).toBe("<recorded>");
    expect(formatWhen(null)).toBe("");
    expect(formatWhen("2026-09-15T10:00:00Z")).not.toBe("2026-09-15T10:00:00Z");
  });
});
