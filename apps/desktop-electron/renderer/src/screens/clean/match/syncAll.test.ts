/**
 * Sync all reviewed (M509): which playlists count as reviewed, and the one selection their ticked
 * tracks make, so there is one preview, one job and one undo batch.
 */
import { describe, expect, it } from "vitest";

import type { CleanPlaylistCounts, CleanPlaylists, CleanPlaylistStatus } from "../../../api/cuepointBridge.types";
import { reviewedPlaylists, syncAllLabel, syncAllSelection, syncAllTitle } from "./syncAll";

const COUNTS: CleanPlaylistCounts = {
  track_count: 10,
  not_matched: 0,
  waiting: 0,
  accepted: 10,
  rejected: 0,
  no_match: 0,
  unsaved: 10,
  running: null,
};

function playlist(id: number, overrides: Partial<CleanPlaylistStatus> = {}): CleanPlaylistStatus {
  return { id, name: `P${id}`, path: "", ...COUNTS, synced: false, synced_at: null, ...overrides };
}

describe("which playlists are reviewed", () => {
  it("takes the matched ones with nothing to check and files still to sync", () => {
    const data: CleanPlaylists = {
      whole_library: COUNTS,
      playlists: [
        playlist(1),
        playlist(2, { waiting: 3, accepted: 7 }),
        playlist(3, { synced: true, synced_at: "2026-10-01T10:00:00" }),
        playlist(4, { not_matched: 10, accepted: 0 }),
        playlist(5, { running: { job_id: "j", done: 1, total: 10 } }),
        playlist(6, { track_count: 0, accepted: 0 }),
        playlist(7, { accepted: 4, no_match: 6 }),
      ],
    };
    expect(reviewedPlaylists(data).map((one) => one.id)).toEqual([1, 7]);
  });

  it("is none before the playlists are read", () => {
    expect(reviewedPlaylists(null)).toEqual([]);
  });
});

describe("the one selection (M509)", () => {
  it("holds every ticked track of every reviewed playlist, each once, in playlist order", () => {
    expect(syncAllSelection([[3, 5], [5, 8], [1]])).toEqual({ track_ids: [3, 5, 8, 1] });
  });

  it("is nothing when nothing is ticked anywhere", () => {
    expect(syncAllSelection([[], []])).toBeNull();
    expect(syncAllSelection([])).toBeNull();
  });
});

describe("the words", () => {
  it("names how many playlists, and opens a window", () => {
    expect(syncAllLabel(3)).toBe("Sync all reviewed (3 playlists)…");
    expect(syncAllLabel(1)).toBe("Sync all reviewed (1 playlist)…");
    expect(syncAllTitle(3)).toBe("Sync 3 reviewed playlists to your files");
  });
});
