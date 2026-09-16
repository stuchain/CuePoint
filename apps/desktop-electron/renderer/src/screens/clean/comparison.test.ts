import { describe, expect, it } from "vitest";

import type { MatchCandidate, TrackMatchState } from "../../api/cuepointBridge.types";
import {
  APPLY_FIELDS,
  CANDIDATE_LIMIT,
  SCORE_ROWS,
  VALUE_ROWS,
  applyValue,
  candidateBadges,
  cellText,
  defaultChoice,
  stepChoice,
  visibleCandidates,
} from "./comparison";

function candidate(id: number, overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id,
    attempt_id: 1,
    rank: id - 1,
    is_winner: false,
    guard_ok: true,
    reject_reason: null,
    score: 90 - id,
    base_score: 80,
    title_sim: 91.4,
    artist_sim: 88,
    bonus_year: 1,
    bonus_key: 0,
    beatport_track_id: String(id),
    url: `https://www.beatport.com/track/x/${id}`,
    title: "A Title",
    artists: "An Artist",
    remixers: null,
    label: "A Label",
    genre: "Techno",
    subgenre: null,
    key: "A Minor",
    bpm: 128,
    release_name: "A Release",
    release_date: "2020-01-01",
    release_year: 2020,
    artwork_url: null,
    preview_url: null,
    query_index: 1,
    query_text: "a title an artist",
    candidate_index: 1,
    elapsed_ms: 10,
    mix: null,
    differs: null,
    ...overrides,
  };
}

function state(overrides: Partial<TrackMatchState> = {}): TrackMatchState {
  return {
    track_id: 1,
    state: "needs_review",
    decided_by: null,
    attempt_id: 1,
    candidate_id: null,
    newer_attempt_id: null,
    disputed: false,
    decided_at: null,
    ...overrides,
  };
}

describe("which candidate a reviewer starts on", () => {
  const list = [candidate(1), candidate(2, { is_winner: true }), candidate(3)];

  it("is the one the state points at", () => {
    expect(defaultChoice(state({ candidate_id: 3 }), list)).toBe(3);
  });

  it("is the matcher's pick when the state points at none of these", () => {
    expect(defaultChoice(state({ candidate_id: 99 }), list)).toBe(2);
  });

  it("is the first when nothing won", () => {
    expect(defaultChoice(null, [candidate(1), candidate(2)])).toBe(1);
  });

  it("is nothing without candidates", () => {
    expect(defaultChoice(state(), [])).toBeNull();
  });
});

describe("the candidates drawn", () => {
  const many = Array.from({ length: CANDIDATE_LIMIT + 3 }, (_, i) => candidate(i + 1));

  it("are the first few by rank", () => {
    const shown = visibleCandidates([...many].reverse(), false, null);
    expect(shown.map((c) => c.id)).toEqual([1, 2, 3, 4, 5]);
  });

  it("keep the chosen one wherever it ranks", () => {
    expect(visibleCandidates(many, false, 8).map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 8]);
  });

  it("are all of them when asked", () => {
    expect(visibleCandidates(many, true, null)).toHaveLength(many.length);
  });

  it("move left and right and stop at the ends", () => {
    const shown = many.slice(0, 3);
    expect(stepChoice(shown, 1, 1)).toBe(2);
    expect(stepChoice(shown, 3, 1)).toBe(3);
    expect(stepChoice(shown, 1, -1)).toBe(1);
    expect(stepChoice(shown, 42, 1)).toBe(1);
    expect(stepChoice([], 1, 1)).toBeNull();
  });
});

describe("what a candidate is called", () => {
  it("is what the decision made of it", () => {
    expect(candidateBadges(candidate(1), state({ state: "accepted", candidate_id: 1 }))).toEqual([
      "Accepted",
    ]);
    expect(candidateBadges(candidate(1), state({ state: "rejected", candidate_id: 1 }))).toEqual([
      "Rejected",
    ]);
    expect(
      candidateBadges(candidate(1, { is_winner: true }), state({ candidate_id: 1 })),
    ).toEqual(["Proposed"]);
  });

  it("is the matcher's pick when a person chose another", () => {
    expect(
      candidateBadges(
        candidate(1, { is_winner: true }),
        state({ state: "accepted", candidate_id: 2 }),
      ),
    ).toEqual(["Matcher's pick"]);
  });

  it("says a guard refused it", () => {
    expect(candidateBadges(candidate(2, { guard_ok: false }), state())).toEqual(["Refused"]);
  });
});

describe("the rows", () => {
  const track = {
    title: "A Title (Extended Mix)",
    artist: "An Artist",
    mix: "Extended Mix",
    remixer: null,
    album: null,
    label: "A Label",
    genre: "Techno",
    key: "8A",
    bpm: 127.98,
    year: null,
  };

  it("draw both sides, absent as a dash", () => {
    const text = (id: string) => {
      const row = VALUE_ROWS.find((entry) => entry.id === id)!;
      return [row.track(track), row.candidate(candidate(1, { subgenre: "Peak Time" }))];
    };
    expect(text("key")).toEqual(["8A", "A Minor"]);
    expect(text("bpm")).toEqual(["128.0", "128.0"]);
    expect(text("genre")).toEqual(["Techno", "Techno (Peak Time)"]);
    expect(text("remixers")).toEqual(["—", "—"]);
    expect(text("year")).toEqual(["—", "2020"]);
    expect(text("release")).toEqual(["—", "A Release"]);
  });

  it("mark only the fields the engine compares", () => {
    const compared = VALUE_ROWS.filter((row) => row.differs).map((row) => row.differs);
    expect(compared).toEqual([
      "title",
      "artists",
      "mix",
      "remixers",
      "label",
      "genre",
      "key",
      "bpm",
      "year",
    ]);
  });

  it("show how the matcher scored, and why it refused", () => {
    const text = (id: string, c: MatchCandidate) =>
      SCORE_ROWS.find((row) => row.id === id)!.candidate(c);
    expect(text("score", candidate(1))).toBe("89.0");
    expect(text("title_sim", candidate(1))).toBe("91");
    expect(text("bonus_year", candidate(1))).toBe("+1");
    expect(text("bonus_key", candidate(1, { bonus_key: -2 }))).toBe("-2");
    expect(text("guard", candidate(1))).toBe("Passed");
    expect(
      text("guard", candidate(1, { guard_ok: false, reject_reason: "guard_artist_sim_no_overlap" })),
    ).toBe("Refused: no artist in common");
    expect(cellText("")).toBe("—");
  });
});

describe("what applying copies", () => {
  it("is each field's value from the candidate, or nothing", () => {
    const c = candidate(1, { label: null });
    expect(APPLY_FIELDS.map((field) => applyValue(field, c))).toEqual([
      "A Minor",
      "128.0",
      "Techno",
      null,
      "2020",
    ]);
  });
});
