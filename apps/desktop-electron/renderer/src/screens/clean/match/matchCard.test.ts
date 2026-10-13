import { describe, expect, it } from "vitest";

import type { LibraryTrackRow, MatchCandidate, MatchProposal } from "../../../api/cuepointBridge.types";
import {
  camelotOf,
  cardRows,
  correctPlan,
  lengthOf,
  noProposalLine,
  proposalCells,
  tickableRows,
  type CardField,
} from "./matchCard";

function track(overrides: Partial<LibraryTrackRow> = {}): LibraryTrackRow {
  return {
    id: 1,
    rekordbox_track_id: "1",
    title: "Place",
    artist: "AIKON",
    remixer: null,
    album: null,
    label: "UNTAMED",
    genre: null,
    key: "3B",
    bpm: 126,
    year: null,
    duration_seconds: 402,
    rating: null,
    play_count: null,
    colour: null,
    date_added: null,
    comment: null,
    bitrate: null,
    file_path: "C:\\music\\1.mp3",
    effective_rating: null,
    rating_source: null,
    favorite: false,
    effective_key: "3B",
    key_source: "beatport",
    effective_bpm: 126,
    effective_genre: null,
    effective_label: "UNTAMED",
    effective_year: null,
    match_state: "needs_review",
    ...overrides,
  };
}

function candidate(overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id: 1001,
    attempt_id: 1,
    rank: 0,
    is_winner: true,
    guard_ok: true,
    reject_reason: null,
    score: 92,
    base_score: 90,
    title_sim: 95,
    artist_sim: 90,
    bonus_year: 0,
    bonus_key: 0,
    beatport_track_id: "1",
    url: "https://www.beatport.com/track/place/1",
    title: "Place",
    artists: "AIKON",
    remixers: null,
    label: "UNTAMED",
    genre: "Melodic House & Techno",
    subgenre: null,
    key: "B Major",
    bpm: 128,
    release_name: "Place",
    release_date: null,
    release_year: 2024,
    artwork_url: null,
    preview_url: null,
    query_index: 1,
    query_text: "place aikon",
    candidate_index: 1,
    elapsed_ms: 5,
    mix: "Original Mix",
    differs: {
      title: false,
      artists: false,
      mix: null,
      remixers: null,
      label: false,
      genre: null,
      key: false,
      bpm: true,
      year: null,
    },
    ...overrides,
  };
}

const byId = (rows: ReturnType<typeof cardRows>, id: CardField) => rows.find((row) => row.id === id)!;

describe("the key in the app's notation", () => {
  it("turns Beatport's names into Camelot", () => {
    expect(camelotOf("A Minor")).toBe("8A");
    expect(camelotOf("B Major")).toBe("1B");
    expect(camelotOf("F# Minor")).toBe("11A");
    expect(camelotOf("Bb Major")).toBe("6B");
    expect(camelotOf("Eb Minor")).toBe("2A");
  });

  it("keeps a Camelot code and says nothing for no key", () => {
    expect(camelotOf("5a")).toBe("5A");
    expect(camelotOf(null)).toBeNull();
    expect(camelotOf("  ")).toBeNull();
  });

  it("shows a notation it does not know as it came", () => {
    expect(camelotOf("open key 3m")).toBe("open key 3m");
  });
});

describe("the two cards' rows", () => {
  it("mark what Correct would change, by the engine's answer first", () => {
    const rows = cardRows(track(), candidate());
    expect(byId(rows, "bpm")).toMatchObject({ yours: "126", theirs: "128", status: "changes", tickable: true });
    // Engine says the label is the same; the genre it could not compare, and the track has none.
    expect(byId(rows, "label")).toMatchObject({ status: "same", tickable: false });
    expect(byId(rows, "genre")).toMatchObject({ yours: null, theirs: "Melodic House & Techno", status: "changes" });
    expect(byId(rows, "year")).toMatchObject({ yours: null, theirs: "2024", status: "changes" });
  });

  it("say nothing to copy when Beatport has no value", () => {
    const rows = cardRows(track(), candidate({ genre: null, release_year: null }));
    expect(byId(rows, "genre")).toMatchObject({ theirs: null, status: "none", tickable: false });
    expect(byId(rows, "year")).toMatchObject({ status: "none" });
  });

  it("compare by text when the engine could not", () => {
    const rows = cardRows(
      track({ effective_genre: "Techno" }),
      candidate({ genre: "techno", differs: null }),
    );
    expect(byId(rows, "genre").status).toBe("same");
  });

  it("let the key come with Correct, without a tick", () => {
    const rows = cardRows(track({ effective_key: "5A", key_source: "beatport" }), candidate());
    expect(byId(rows, "key")).toMatchObject({ yours: "5A", theirs: "1B", status: "comes-with-correct", tickable: false });
  });

  it("offer a tick for the key only where the user's own would be replaced", () => {
    const rows = cardRows(track({ effective_key: "5A", key_source: "yours" }), candidate());
    expect(byId(rows, "key")).toMatchObject({ status: "replaces-yours", tickable: true });
    // The same key in two notations is not a difference.
    const same = cardRows(track({ effective_key: "1B", key_source: "yours" }), candidate());
    expect(byId(same, "key")).toMatchObject({ status: "same", tickable: false });
  });

  it("say nothing without a candidate", () => {
    const rows = cardRows(track(), null);
    expect(rows.every((row) => row.status === "none" && !row.tickable)).toBe(true);
    expect(tickableRows(rows)).toEqual([]);
  });

  it("give the track's length", () => {
    expect(lengthOf(track())).toBe("6:42");
    expect(lengthOf(track({ duration_seconds: null }))).toBeNull();
  });
});

describe("what Correct sends", () => {
  const rows = cardRows(track({ effective_key: "5A", key_source: "yours" }), candidate());

  it("is every ticked field that would change", () => {
    const all = new Set<CardField>(["bpm", "genre", "label", "year", "key"]);
    expect(correctPlan(all, rows)).toEqual({ fields: ["bpm", "genre", "year"], replaceKey: true });
  });

  it("leaves out what is not ticked", () => {
    expect(correctPlan(new Set<CardField>(["genre"]), rows)).toEqual({ fields: ["genre"], replaceKey: false });
    expect(correctPlan(new Set(), rows)).toEqual({ fields: [], replaceKey: false });
  });

  it("never sends a field that would not change, ticked or not", () => {
    // The label is the same on both sides.
    const plan = correctPlan(new Set<CardField>(["label"]), rows);
    expect(plan.fields).toEqual([]);
  });

  it("never replaces a key that is not the user's", () => {
    const given = cardRows(track({ key_source: "beatport", effective_key: "5A" }), candidate());
    expect(correctPlan(new Set<CardField>(["key"]), given).replaceKey).toBe(false);
  });
});

describe("a Table row", () => {
  const proposal: MatchProposal = {
    candidate_id: 1001,
    key: "1B",
    bpm: 128,
    genre: "Melodic House & Techno",
    label: "UNTAMED",
    year: 2024,
    mix: null,
    score: 92,
    guard_ok: true,
  };

  it("has no cells without a proposal", () => {
    expect(proposalCells(track({ match_proposal: null }))).toBeNull();
    expect(proposalCells(track())).toBeNull();
  });

  it("reads before and after from the proposal", () => {
    const cells = proposalCells(track({ match_proposal: proposal }))!;
    expect(cells.bpm).toEqual({ before: "126", after: "128", changes: true });
    expect(cells.label).toEqual({ before: "UNTAMED", after: "UNTAMED", changes: false });
    expect(cells.genre).toEqual({ before: null, after: "Melodic House & Techno", changes: true });
    expect(cells.year).toEqual({ before: null, after: "2024", changes: true });
  });

  it("changes the key only where the user's own is replaced", () => {
    const given = proposalCells(track({ match_proposal: proposal, effective_key: "5A" }))!;
    expect(given.key).toEqual({ before: "5A", after: "1B", changes: false });
    const yours = proposalCells(
      track({ match_proposal: proposal, effective_key: "5A", key_source: "yours" }),
    )!;
    expect(yours.key.changes).toBe(true);
  });

  it("says what a row with nothing to take is", () => {
    expect(noProposalLine(track({ match_state: "needs_review" }))).toBe(
      "Several possible matches · choose in One at a time",
    );
    expect(noProposalLine(track({ match_state: "no_match" }))).toBe("Beatport found nothing");
    expect(noProposalLine(track({ match_state: "not_matched" }))).toBe("Not looked up yet");
  });
});
