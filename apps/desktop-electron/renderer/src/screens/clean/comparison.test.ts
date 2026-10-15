import { afterEach, describe, expect, it, vi } from "vitest";

import type { MatchCandidate } from "../../api/cuepointBridge.types";
import {
  APPLY_FIELDS,
  SCORE_ROWS,
  applyValue,
  cellText,
  scoreLine,
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

describe("the scoring rows", () => {
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
    ).toBe("Ruled out: no artist in common");
    expect(cellText("")).toBe("—");
  });
});

describe("what applying copies", () => {
  it("is each field's value from the candidate, or nothing", () => {
    const c = candidate(1, { label: null });
    // The key is not applied: an accepted match gives it (DEC-201).
    expect(APPLY_FIELDS).not.toContain("key");
    expect(APPLY_FIELDS.map((field) => applyValue(field, c))).toEqual([
      "128",
      "Techno",
      null,
      "2020",
    ]);
  });
});

describe("one plain line per candidate", () => {
  it.each([
    [94.2, "94% likely"],
    [71.1, "71% likely"],
    [41.6, "42% likely"],
  ])("says %s as %s", (score, line) => {
    expect(scoreLine(candidate(1, { score }))).toBe(line);
  });

  it("says why a candidate was ruled out instead of a score", () => {
    expect(
      scoreLine(candidate(1, { guard_ok: false, reject_reason: "guard_artist_sim_no_overlap" })),
    ).toBe("Ruled out: no artist in common");
  });

  it("keeps the matcher's internals out of the plain line", () => {
    expect(scoreLine(candidate(1, { score: 94 }))).not.toMatch(/bonus|similarity|guard/i);
  });
});

describe("the scoring rows folded under Why this score?", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("hold everything the plain line leaves out, the key bonus included", () => {
    expect(SCORE_ROWS.map((row) => row.label)).toEqual([
      "Score",
      "Before bonuses",
      "Title similarity",
      "Artist similarity",
      "Year bonus",
      "Key bonus",
      "Guards",
      "Found by",
    ]);
  });
});
