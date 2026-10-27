/** What the Match button says and sends (C22): the ticked playlists as one run. */
import { describe, expect, it } from "vitest";

import type { CleanPlaylistCounts, CleanPlaylistStatus } from "../../../api/cuepointBridge.types";
import { displayFolderPath, MATCH_TICKED_LABEL, matchRequest } from "./matchPlaylists";

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

describe("matchRequest", () => {
  it("asks for one playlist as an In playlist rule, named by the playlist", () => {
    expect(matchRequest({ whole: false, playlists: [playlist(7, "hJ")] }, COUNTS)).toEqual({
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

  it("asks for several playlists as one run over all of them, named by how many", () => {
    const request = matchRequest({ whole: false, playlists: [playlist(7, "hJ"), playlist(8, "all")] }, COUNTS);
    expect(request.selection).toEqual({
      query: {
        filters: {
          match: "all",
          rules: [
            {
              field: "in_playlist",
              operator: "any_of",
              value: [
                { kind: "playlist", id: 7 },
                { kind: "playlist", id: 8 },
              ],
            },
          ],
        },
      },
    });
    expect(request.label).toBe("2 playlists");
  });

  it("rematches only when every playlist has nothing left to look up", () => {
    expect(matchRequest({ whole: false, playlists: [playlist(7, "hJ", 0), playlist(8, "a", 0)] }, COUNTS).again).toBe(true);
    expect(matchRequest({ whole: false, playlists: [playlist(7, "hJ", 0), playlist(8, "a", 2)] }, COUNTS).again).toBe(false);
  });

  it("asks for every track for the whole library, by its own count", () => {
    expect(matchRequest({ whole: true }, { ...COUNTS, not_matched: 4 })).toEqual({
      selection: { query: {} },
      again: false,
      label: "All tracks",
    });
    expect(matchRequest({ whole: true }, { ...COUNTS, not_matched: 0 }).again).toBe(true);
  });
});

describe("MATCH_TICKED_LABEL", () => {
  it("is one fixed label, so the button keeps its width as playlists are ticked (C202)", () => {
    expect(MATCH_TICKED_LABEL).toBe("Match ticked playlists");
  });
});

describe("displayFolderPath", () => {
  it("drops Rekordbox's ROOT container and keeps real folders", () => {
    expect(displayFolderPath("ROOT")).toBe("");
    expect(displayFolderPath("ROOT/Gigs")).toBe("Gigs");
    expect(displayFolderPath("ROOT / Gigs / Friday")).toBe("Gigs / Friday");
    expect(displayFolderPath("Gigs/Friday")).toBe("Gigs / Friday");
    expect(displayFolderPath("Gigs/ROOT")).toBe("Gigs / ROOT");
    expect(displayFolderPath("")).toBe("");
  });
});
