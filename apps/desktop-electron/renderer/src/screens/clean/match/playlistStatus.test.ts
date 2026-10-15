/** The Playlists view's row status (C22): what each row says, and what it offers. */
import { describe, expect, it } from "vitest";

import type { CleanPlaylistCounts } from "../../../api/cuepointBridge.types";
import { playlistStatus } from "./playlistStatus";

function counts(overrides: Partial<CleanPlaylistCounts> = {}): CleanPlaylistCounts {
  return {
    track_count: 100,
    not_matched: 0,
    waiting: 0,
    accepted: 100,
    rejected: 0,
    no_match: 0,
    unsaved: 0,
    running: null,
    ...overrides,
  };
}

describe("playlistStatus", () => {
  it("says how far a running match is, with its job, and cannot be ticked or reviewed", () => {
    expect(playlistStatus(counts({ running: { job_id: "j", done: 108, total: 1800 } }))).toMatchObject({
      kind: "running",
      text: "Matching 108 of 1,800",
      running: { jobId: "j", done: 108, total: 1800 },
      canReview: false,
      canTick: false,
    });
  });

  it("says Matched with how many tracks have a match, and offers Review", () => {
    const status = playlistStatus(counts({ waiting: 9, accepted: 15, rejected: 1, track_count: 25 }));
    expect(status).toMatchObject({ kind: "matched", canReview: true, canTick: true });
    expect(status.chips).toEqual([{ text: "Matched · 25", tone: "done" }]);
  });

  it("says what was not found beside it, and what has not been looked up", () => {
    const status = playlistStatus(counts({ accepted: 20, no_match: 5, not_matched: 3, track_count: 28 }));
    expect(status.chips).toEqual([
      { text: "Matched · 20", tone: "done" },
      { text: "5 not found", tone: "problem" },
      { text: "3 not matched yet", tone: "none" },
    ]);
  });

  it("offers Review for a playlist the search found nothing for, since those are the tracks to look at", () => {
    const status = playlistStatus(counts({ accepted: 0, no_match: 24, track_count: 24 }));
    expect(status.chips).toEqual([{ text: "24 not found", tone: "problem" }]);
    expect(status.canReview).toBe(true);
  });

  it("says Not matched yet for one never looked up, with nothing to review", () => {
    expect(playlistStatus(counts({ accepted: 0, not_matched: 100 }))).toMatchObject({
      kind: "not_matched",
      chips: [{ text: "Not matched yet", tone: "none" }],
      canReview: false,
      canTick: true,
    });
  });

  it("says Empty for a playlist with no tracks, which cannot be ticked", () => {
    expect(playlistStatus(counts({ track_count: 0, accepted: 0 }))).toMatchObject({
      kind: "empty",
      chips: [{ text: "Empty", tone: "none" }],
      canTick: false,
      canReview: false,
    });
  });
});
