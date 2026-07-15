import { describe, expect, it } from "vitest";
import {
  applyCandidateToResult,
  hasCandidates,
  sortCandidates,
} from "./candidateUtils";
import type { MatchCandidate, TrackResult } from "../mocks/types";

const baseRow: TrackResult = {
  playlist_index: 1,
  title: "Original",
  artist: "Artist",
  matched: true,
  beatport_title: "Primary",
  beatport_artists: "BP Artist",
  beatport_url: "https://www.beatport.com/track/1",
  match_score: 88,
  candidates: [
    { candidate_title: "Primary", final_score: 88, candidate_url: "https://www.beatport.com/track/1" },
    { candidate_title: "Alt", final_score: 72, candidate_url: "https://www.beatport.com/track/2" },
  ],
};

describe("candidateUtils", () => {
  it("sorts candidates by score descending", () => {
    const sorted = sortCandidates(baseRow.candidates ?? []);
    expect(sorted[0]?.candidate_title).toBe("Primary");
    expect(sorted[1]?.candidate_title).toBe("Alt");
  });

  it("detects candidate rows", () => {
    expect(hasCandidates(baseRow)).toBe(true);
    expect(hasCandidates({ ...baseRow, candidates: [] })).toBe(false);
  });

  it("applies selected candidate fields to a result row", () => {
    const candidate: MatchCandidate = {
      candidate_title: "New Match",
      candidate_artists: "New Artist",
      candidate_url: "https://www.beatport.com/track/new",
      final_score: 91,
      title_sim: 97,
      artist_sim: 93,
      candidate_key_camelot: "8A",
      candidate_bpm: "128",
      candidate_year: "2024",
      candidate_label: "Fresh Label",
    };

    const updated = applyCandidateToResult(baseRow, candidate);
    expect(updated.beatport_title).toBe("New Match");
    expect(updated.beatport_artists).toBe("New Artist");
    expect(updated.beatport_url).toBe("https://www.beatport.com/track/new");
    expect(updated.match_score).toBe(91);
    expect(updated.confidence).toBe("high");
  });
});
