/** What the header's Match N playlists button says and sends (C22). */
import { describe, expect, it } from "vitest";

import { matchPlaylistsAction, matchPlaylistsLabel, matchPlaylistsSelection } from "./matchPlaylists";
import type { TickedPlaylist } from "./useCleanPlaylists";

const COUNTS = {
  track_count: 10,
  not_matched: 10,
  waiting: 0,
  accepted: 0,
  rejected: 0,
  no_match: 0,
  unsaved: 0,
  running: null,
};

function ticked(id: number | null, name: string, notMatched = 10): TickedPlaylist {
  return {
    key: id === null ? "library" : `playlist:${id}`,
    name,
    id,
    counts: { ...COUNTS, not_matched: notMatched },
  };
}

describe("matchPlaylistsAction", () => {
  it("says Match N playlists on Beatport, with 1 playlist for one", () => {
    expect(matchPlaylistsAction([]).label).toBe("Match playlists on Beatport");
    expect(matchPlaylistsAction([ticked(1, "a")])).toEqual({ label: "Match 1 playlist on Beatport", again: false });
    expect(matchPlaylistsAction([ticked(1, "a"), ticked(2, "b")]).label).toBe("Match 2 playlists on Beatport");
  });

  it("says again, and rematches, only when every ticked row has nothing left to look up", () => {
    expect(matchPlaylistsAction([ticked(1, "a", 0), ticked(2, "b", 0)])).toEqual({
      label: "Match 2 playlists again",
      again: true,
    });
    expect(matchPlaylistsAction([ticked(1, "a", 0), ticked(2, "b", 3)]).again).toBe(false);
  });
});

describe("the whole library", () => {
  it("says the whole library, and rematches only by its own count", () => {
    expect(matchPlaylistsAction([ticked(null, "Whole library", 4)])).toEqual({
      label: "Match the whole library on Beatport",
      again: false,
    });
    expect(matchPlaylistsAction([ticked(null, "Whole library", 0)])).toEqual({
      label: "Match the whole library again",
      again: true,
    });
  });
});

describe("matchPlaylistsSelection", () => {
  it("asks for the ticked playlists as one In playlist rule", () => {
    expect(matchPlaylistsSelection([ticked(1, "a"), ticked(2, "b")])).toEqual({
      query: {
        filters: {
          match: "all",
          rules: [
            {
              field: "in_playlist",
              operator: "any_of",
              value: [
                { kind: "playlist", id: 1 },
                { kind: "playlist", id: 2 },
              ],
            },
          ],
        },
      },
    });
  });

  it("asks for every track when the whole library is ticked, as the match window's All tracks does", () => {
    expect(matchPlaylistsSelection([ticked(null, "Whole library"), ticked(2, "b")])).toEqual({ query: {} });
  });
});

describe("matchPlaylistsLabel", () => {
  it("names up to three, then and N more", () => {
    expect(matchPlaylistsLabel([ticked(1, "a"), ticked(2, "b"), ticked(3, "c")])).toBe("a, b, c");
    expect(matchPlaylistsLabel([1, 2, 3, 4, 5].map((id) => ticked(id, `p${id}`)))).toBe("p1, p2, p3 and 2 more");
  });

  it("calls the whole library by that name", () => {
    expect(matchPlaylistsLabel([ticked(null, "Whole library"), ticked(2, "b")])).toBe("Whole library");
  });
});
