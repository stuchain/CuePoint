import { describe, expect, it } from "vitest";
import { filterReviewTracks, needsReviewTrack } from "./reviewUtils";
import type { TrackResult } from "../mocks/types";

const base: TrackResult = {
  playlist_index: 1,
  title: "Track",
  artist: "Artist",
  matched: true,
  beatport_url: "https://example.com/track/1",
  match_score: 88,
  artist_sim: 90,
};

describe("reviewUtils", () => {
  it("flags low score tracks", () => {
    expect(needsReviewTrack({ ...base, match_score: 65 })).toBe(true);
  });

  it("flags weak artist similarity", () => {
    expect(needsReviewTrack({ ...base, artist_sim: 40 })).toBe(true);
  });

  it("flags unmatched tracks", () => {
    expect(needsReviewTrack({ ...base, matched: false, beatport_url: undefined })).toBe(true);
  });

  it("filters review subset", () => {
    const rows = [base, { ...base, playlist_index: 2, match_score: 55 }];
    expect(filterReviewTracks(rows)).toHaveLength(1);
    expect(filterReviewTracks(rows)[0]?.playlist_index).toBe(2);
  });
});
