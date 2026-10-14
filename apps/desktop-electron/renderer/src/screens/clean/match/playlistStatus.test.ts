/**
 * The Playlists view's row status (C22, G4 §2.2): each row of the table, and
 * which one wins when more than one applies.
 */
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
  it("says how far a running match is, with its job, and offers neither Review nor Match", () => {
    const status = playlistStatus(counts({ running: { job_id: "j", done: 108, total: 1800 } }));
    expect(status).toMatchObject({
      kind: "running",
      text: "Matching 108 of 1,800",
      running: { jobId: "j", done: 108, total: 1800 },
      review: null,
      save: null,
      canMatch: false,
    });
  });

  it("says N to check and N confirmed, and offers Review N ›, when tracks wait for a yes or no", () => {
    const status = playlistStatus(counts({ waiting: 9, accepted: 15, track_count: 24, unsaved: 15 }));
    expect(status).toMatchObject({
      kind: "waiting",
      tone: "action",
      chips: [
        { text: "9 to check", tone: "action" },
        { text: "15 confirmed", tone: "done" },
      ],
      review: { label: "Review 9 ›", count: 9 },
    });
    // The values already sure can be saved while the rest waits.
    expect(status.save).toEqual({ label: "Save 15 to files…", count: 15 });
  });

  it("leaves out the confirmed chip when none is", () => {
    expect(playlistStatus(counts({ waiting: 1200, accepted: 0 })).chips).toEqual([
      { text: "1,200 to check", tone: "action" },
    ]);
  });

  it("offers Save N to files… when values are ready", () => {
    expect(playlistStatus(counts({ unsaved: 39 }))).toMatchObject({
      kind: "unsaved",
      text: "39 ready to save",
      tone: "action",
      save: { label: "Save 39 to files…", count: 39 },
      review: null,
      canMatch: true,
    });
  });

  it("says Not matched when nothing was looked up, and N not matched when some was", () => {
    const all = playlistStatus(counts({ track_count: 64, not_matched: 64, accepted: 0 }));
    expect(all).toMatchObject({ kind: "not_matched", text: "Not matched", tone: "problem", canMatch: true });
    expect(playlistStatus(counts({ not_matched: 5 })).text).toBe("5 not matched");
  });

  it("says Done, in words rather than a typed tick", () => {
    expect(playlistStatus(counts())).toMatchObject({
      kind: "done",
      text: "Done",
      tone: "done",
      note: "Values in your files",
      canMatch: true,
    });
  });

  it("says Empty for a playlist with no tracks, with nothing to press", () => {
    expect(playlistStatus(counts({ track_count: 0, accepted: 0 }))).toMatchObject({
      kind: "empty",
      text: "Empty",
      tone: "none",
      review: null,
      save: null,
      canMatch: false,
    });
  });

  it("takes the first that applies: running, waiting, ready to save, not matched, done", () => {
    const all = { waiting: 3, unsaved: 2, not_matched: 1 };
    const running = { job_id: "j", done: 1, total: 2 };
    expect(playlistStatus(counts({ ...all, running })).kind).toBe("running");
    expect(playlistStatus(counts(all)).kind).toBe("waiting");
    expect(playlistStatus(counts({ unsaved: 2, not_matched: 1 })).kind).toBe("unsaved");
    expect(playlistStatus(counts({ not_matched: 1 })).kind).toBe("not_matched");
    expect(playlistStatus(counts()).kind).toBe("done");
  });
});
