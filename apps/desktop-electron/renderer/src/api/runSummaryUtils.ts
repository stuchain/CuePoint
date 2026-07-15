import type { TrackResult } from "../mocks/types";

export interface RunSummaryView {
  playlist: string;
  totalTracks: number;
  matched: number;
  unmatched: number;
  lowConfidence: number;
  durationSec: number;
  isBatch: boolean;
  playlistCount?: number;
}

export function buildRunSummary(
  results: TrackResult[],
  playlist: string,
  durationSec: number,
): RunSummaryView {
  const totalTracks = results.length;
  const matched = results.filter((row) => row.matched).length;
  const unmatched = totalTracks - matched;
  const lowConfidence = results.filter((row) => (row.match_score ?? 0) < 70).length;
  return {
    playlist,
    totalTracks,
    matched,
    unmatched,
    lowConfidence,
    durationSec,
    isBatch: false,
  };
}

export function buildBatchRunSummary(
  batchResults: Record<string, TrackResult[]>,
  durationSec: number,
): RunSummaryView {
  const playlists = Object.keys(batchResults);
  const allRows = playlists.flatMap((name) => batchResults[name] ?? []);
  const summary = buildRunSummary(allRows, playlists[0] ?? "Batch", durationSec);
  return {
    ...summary,
    playlist: `${playlists.length} playlists`,
    isBatch: true,
    playlistCount: playlists.length,
  };
}

export function formatRunSummaryStats(summary: RunSummaryView): string {
  const parts = [
    `${summary.totalTracks} tracks`,
    `${summary.matched} matched`,
  ];
  if (summary.unmatched > 0) parts.push(`${summary.unmatched} unmatched`);
  if (summary.lowConfidence > 0) parts.push(`${summary.lowConfidence} low confidence`);
  parts.push(`${summary.durationSec.toFixed(1)}s`);
  return parts.join(", ");
}
