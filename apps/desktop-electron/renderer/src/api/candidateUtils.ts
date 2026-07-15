import type { MatchCandidate, TrackResult } from "../mocks/types";

function candidateScore(candidate: MatchCandidate): number {
  const raw = candidate.final_score ?? candidate.match_score ?? 0;
  const value = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
  return Number.isFinite(value) ? value : 0;
}

export function sortCandidates(candidates: MatchCandidate[]): MatchCandidate[] {
  return [...candidates].sort((a, b) => candidateScore(b) - candidateScore(a));
}

export function hasCandidates(row: TrackResult): boolean {
  return Boolean(row.candidates?.length);
}

export function currentMatchFromResult(row: TrackResult): MatchCandidate | null {
  if (!row.matched) return null;
  return {
    candidate_title: row.beatport_title,
    beatport_title: row.beatport_title,
    candidate_artists: row.beatport_artists,
    beatport_artists: row.beatport_artists,
    candidate_url: row.beatport_url,
    beatport_url: row.beatport_url,
    match_score: row.match_score,
    final_score: row.match_score,
    title_sim: row.title_sim,
    artist_sim: row.artist_sim,
    candidate_key: row.beatport_key,
    beatport_key: row.beatport_key,
    candidate_key_camelot: row.beatport_key_camelot,
    beatport_key_camelot: row.beatport_key_camelot,
    candidate_bpm: row.beatport_bpm,
    beatport_bpm: row.beatport_bpm,
    candidate_year: row.beatport_year,
    beatport_year: row.beatport_year,
    candidate_label: row.beatport_label,
    beatport_label: row.beatport_label,
  };
}

function readCandidateField(
  candidate: MatchCandidate,
  primary: keyof MatchCandidate,
  fallback: keyof MatchCandidate,
): string | undefined {
  const value = candidate[primary] ?? candidate[fallback];
  return value != null && value !== "" ? String(value) : undefined;
}

function readCandidateNumber(
  candidate: MatchCandidate,
  primary: keyof MatchCandidate,
  fallback: keyof MatchCandidate,
): number | undefined {
  const raw = candidate[primary] ?? candidate[fallback];
  if (raw == null || raw === "") return undefined;
  const value = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
  return Number.isFinite(value) ? value : undefined;
}

export function applyCandidateToResult(row: TrackResult, candidate: MatchCandidate): TrackResult {
  const matchScore = readCandidateNumber(candidate, "final_score", "match_score");
  return {
    ...row,
    matched: true,
    beatport_title: readCandidateField(candidate, "candidate_title", "beatport_title"),
    beatport_artists: readCandidateField(candidate, "candidate_artists", "beatport_artists"),
    beatport_url: readCandidateField(candidate, "candidate_url", "beatport_url"),
    beatport_key: readCandidateField(candidate, "candidate_key", "beatport_key"),
    beatport_key_camelot: readCandidateField(
      candidate,
      "candidate_key_camelot",
      "beatport_key_camelot",
    ),
    beatport_year: readCandidateField(candidate, "candidate_year", "beatport_year"),
    beatport_bpm: readCandidateField(candidate, "candidate_bpm", "beatport_bpm"),
    beatport_label: readCandidateField(candidate, "candidate_label", "beatport_label"),
    match_score: matchScore,
    title_sim: readCandidateNumber(candidate, "title_sim", "title_sim"),
    artist_sim: readCandidateNumber(candidate, "artist_sim", "artist_sim"),
    confidence:
      matchScore != null && matchScore >= 85
        ? "high"
        : matchScore != null && matchScore >= 70
          ? "medium"
          : "low",
  };
}
