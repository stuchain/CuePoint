import { describe, expect, it } from "vitest";
import { buildBatchRunSummary, buildRunSummary, formatRunSummaryStats } from "./runSummaryUtils";
import type { TrackResult } from "../mocks/types";

const row = (matched: boolean, score = 80): TrackResult => ({
  playlist_index: 1,
  title: "Track",
  artist: "Artist",
  matched,
  match_score: score,
});

describe("runSummaryUtils", () => {
  it("builds single playlist summary", () => {
    const summary = buildRunSummary([row(true), row(false, 50)], "My Playlist", 12.5);
    expect(summary.totalTracks).toBe(2);
    expect(summary.matched).toBe(1);
    expect(summary.unmatched).toBe(1);
    expect(summary.lowConfidence).toBe(1);
    expect(summary.durationSec).toBe(12.5);
  });

  it("builds batch summary", () => {
    const summary = buildBatchRunSummary(
      { A: [row(true)], B: [row(true), row(false)] },
      30,
    );
    expect(summary.isBatch).toBe(true);
    expect(summary.playlistCount).toBe(2);
    expect(summary.totalTracks).toBe(3);
  });

  it("formats stats line", () => {
    const line = formatRunSummaryStats(buildRunSummary([row(true)], "P", 1.2));
    expect(line).toContain("1 tracks");
    expect(line).toContain("1.2s");
  });
});
