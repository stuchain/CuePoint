import { describe, expect, it } from "vitest";

import type { SimilarTrack } from "../../api/cuepointBridge.types";
import { NEXT_PICKS_ASK, NEXT_PICKS_COUNT, NEXT_PICKS_UPCOMING, hasKeyOrBpm, eligibleNextTracks } from "./nextPicksRule";

const suggestion = (id: number): SimilarTrack => ({ track_id: id, score: 100 - id, reasons: [] });
const list = (...ids: number[]) => ids.map(suggestion);
const none = { shownId: 1, queuedIds: [], playingId: null, playedIds: [] };

describe("eligibleNextTracks", () => {
  it("keeps the engine's order and keeps every eligible one for the caller to take three from", () => {
    const picks = eligibleNextTracks(list(9, 4, 7, 2, 5), none);
    expect(picks.map((p) => p.track_id)).toEqual([9, 4, 7, 2, 5]);
    expect(NEXT_PICKS_COUNT).toBe(3);
  });

  it("drops the shown track, queued tracks, the playing track and tracks played earlier", () => {
    const picks = eligibleNextTracks(list(1, 2, 3, 4, 5, 6, 7, 8), {
      shownId: 1,
      queuedIds: [2],
      playingId: 3,
      playedIds: new Set([4]),
    });
    expect(picks.map((p) => p.track_id)).toEqual([5, 6, 7, 8]);
  });

  it("returns what is left, and none when nothing is", () => {
    expect(eligibleNextTracks(list(2, 3), { ...none, queuedIds: [2] }).map((p) => p.track_id)).toEqual([3]);
    expect(eligibleNextTracks(list(2), { ...none, playingId: 2 })).toEqual([]);
    expect(eligibleNextTracks([], none)).toEqual([]);
  });

  it("does not repeat a track the engine listed twice", () => {
    expect(eligibleNextTracks(list(2, 2, 3, 4), none).map((p) => p.track_id)).toEqual([2, 3, 4]);
  });
});

describe("hasKeyOrBpm", () => {
  it("needs a key or a BPM", () => {
    expect(hasKeyOrBpm({ effective_key: null, bpm: null })).toBe(false);
    expect(hasKeyOrBpm({ effective_key: " ", bpm: 0 })).toBe(false);
    expect(hasKeyOrBpm({ effective_key: "8A", bpm: null })).toBe(true);
    expect(hasKeyOrBpm({ effective_key: null, bpm: 128 })).toBe(true);
  });
});

describe("the effective BPM", () => {
  it("counts an effective BPM when the Rekordbox BPM is missing", () => {
    expect(hasKeyOrBpm({ effective_key: null, bpm: null, effective_bpm: 126 })).toBe(true);
    expect(hasKeyOrBpm({ effective_key: null, bpm: 128, effective_bpm: null })).toBe(true);
    expect(hasKeyOrBpm({ effective_key: null, bpm: null, effective_bpm: null })).toBe(false);
  });
});

describe("how many are asked for and excluded", () => {
  it("asks for 50 and treats only the next 10 as queued", () => {
    expect(NEXT_PICKS_ASK).toBe(50);
    expect(NEXT_PICKS_UPCOMING).toBe(10);
  });
});
