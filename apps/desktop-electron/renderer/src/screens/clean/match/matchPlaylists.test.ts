/** What a playlist's Match button says and sends (C22). */
import { describe, expect, it } from "vitest";

import type { CleanPlaylistCounts, CleanPlaylistStatus } from "../../../api/cuepointBridge.types";
import { matchRowRequest } from "./matchPlaylists";

const COUNTS: CleanPlaylistCounts = {
  track_count: 10,
  not_matched: 10,
  waiting: 0,
  accepted: 0,
  rejected: 0,
  no_match: 0,
  unsaved: 0,
  running: null,
};

function playlist(id: number, name: string, notMatched = 10): CleanPlaylistStatus {
  return { id, name, path: "", ...COUNTS, not_matched: notMatched };
}

describe("matchRowRequest", () => {
  it("asks for one playlist as an In playlist rule, named by the playlist", () => {
    expect(matchRowRequest(playlist(7, "hJ"), COUNTS)).toEqual({
      selection: {
        query: {
          filters: {
            match: "all",
            rules: [{ field: "in_playlist", operator: "any_of", value: [{ kind: "playlist", id: 7 }] }],
          },
        },
      },
      again: false,
      label: "hJ",
    });
  });

  it("rematches only when the playlist has nothing left to look up", () => {
    expect(matchRowRequest(playlist(7, "hJ", 0), COUNTS).again).toBe(true);
    expect(matchRowRequest(playlist(7, "hJ", 3), COUNTS).again).toBe(false);
  });

  it("asks for every track for the whole library, by its own count", () => {
    expect(matchRowRequest(null, { ...COUNTS, not_matched: 4 })).toEqual({
      selection: { query: {} },
      again: false,
      label: "Whole library",
    });
    expect(matchRowRequest(null, { ...COUNTS, not_matched: 0 }).again).toBe(true);
  });
});
