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
  it("says how far a running match is, and that the person can keep working", () => {
    expect(playlistStatus(counts({ running: { job_id: "j", done: 108, total: 1800 } }))).toEqual({
      kind: "running",
      text: "Matching 108 of 1,800",
      tone: "none",
      next: { kind: "text", text: "You can keep working" },
    });
  });

  it("offers Review N when tracks wait for a yes or no", () => {
    expect(playlistStatus(counts({ waiting: 1200 }))).toEqual({
      kind: "waiting",
      text: "1,200 waiting for you",
      tone: "action",
      next: { kind: "review", label: "Review 1,200", count: 1200 },
    });
  });

  it("offers Save N to files… when values are ready", () => {
    expect(playlistStatus(counts({ unsaved: 39 }))).toEqual({
      kind: "unsaved",
      text: "39 ready to save",
      tone: "action",
      next: { kind: "save", label: "Save 39 to files…", count: 39 },
    });
  });

  it("says Not matched when nothing was looked up, and N not matched when some was", () => {
    const all = playlistStatus(counts({ track_count: 64, not_matched: 64, accepted: 0 }));
    expect(all).toMatchObject({ kind: "not_matched", text: "Not matched", tone: "problem" });
    expect(all.next).toEqual({ kind: "text", text: "Tick and press Match" });
    expect(playlistStatus(counts({ not_matched: 5 })).text).toBe("5 not matched");
  });

  it("says Done, in words rather than a typed tick", () => {
    expect(playlistStatus(counts())).toEqual({
      kind: "done",
      text: "Done",
      tone: "done",
      next: { kind: "text", text: "Values in your files" },
    });
  });

  it("says Empty for a playlist with no tracks, with nothing next", () => {
    expect(playlistStatus(counts({ track_count: 0, accepted: 0 }))).toEqual({
      kind: "empty",
      text: "Empty",
      tone: "none",
      next: null,
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
