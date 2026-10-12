/**
 * Rows, candidates and answers for the Match area's tests (C14).
 *
 * Shaped as the engine answers: a track row with the Clean fields, the
 * candidates the matcher scored with the engine's own `differs`, and a track's
 * matches as `getTrackMatches` returns them. The browse fake echoes what it was
 * asked, because the window drops an answer that does not.
 */
import type {
  FilterRuleSet,
  LibrarySearchResponse,
  LibraryTrackRow,
  MatchCandidate,
  MatchRun,
  TrackMatches,
  TrackMatchState,
} from "../api/cuepointBridge.types";

export function track(id: number, overrides: Partial<LibraryTrackRow> = {}): LibraryTrackRow {
  return {
    id,
    rekordbox_track_id: String(id),
    title: `Track ${id}`,
    artist: `Artist ${id}`,
    remixer: null,
    album: null,
    label: "Label One",
    genre: "Techno",
    key: "8A",
    bpm: 126,
    year: null,
    duration_seconds: 300 + id,
    rating: null,
    play_count: null,
    colour: null,
    date_added: null,
    comment: null,
    bitrate: 320,
    file_path: `C:\\music\\${id}.mp3`,
    effective_rating: null,
    rating_source: null,
    favorite: false,
    effective_bpm: 126,
    match_state: "needs_review",
    match_disputed: false,
    file_status: "present",
    artwork: "unknown",
    ...overrides,
  };
}

/** A row with a proposal, as the browse sends it for a waiting or accepted match. */
export function proposed(id: number, overrides: Partial<LibraryTrackRow> = {}): LibraryTrackRow {
  return track(id, {
    match_proposal: {
      candidate_id: 1001,
      key: "6A",
      bpm: 128,
      genre: "Melodic House & Techno",
      label: "Label One",
      year: 2024,
      mix: "Original Mix",
      score: 92,
      guard_ok: true,
    },
    ...overrides,
  });
}

export function candidate(id: number, overrides: Partial<MatchCandidate> = {}): MatchCandidate {
  return {
    id,
    attempt_id: 100,
    rank: id - 1001,
    is_winner: id === 1001,
    guard_ok: true,
    reject_reason: null,
    score: 92 - (id - 1001) * 10,
    base_score: 90,
    title_sim: 95,
    artist_sim: 90,
    bonus_year: 0,
    bonus_key: 2,
    beatport_track_id: String(id),
    url: `https://www.beatport.com/track/x/${id}`,
    title: "Track",
    artists: "Artist",
    remixers: null,
    label: "Label Two",
    genre: "Techno",
    subgenre: null,
    key: "A Minor",
    bpm: 128,
    release_name: "Release",
    release_date: null,
    release_year: 2020,
    artwork_url: null,
    preview_url: null,
    query_index: 1,
    query_text: "track artist",
    candidate_index: 1,
    elapsed_ms: 5,
    mix: id === 1001 ? "Original Mix" : "Extended Mix",
    differs: {
      title: false,
      artists: false,
      mix: null,
      remixers: null,
      label: true,
      genre: false,
      key: false,
      bpm: true,
      year: null,
    },
    ...overrides,
  };
}

export const CANDIDATES = [
  candidate(1001),
  candidate(1002, { guard_ok: false, reject_reason: "guard_artist_sim_no_overlap" }),
];

export function stateFor(trackId: number, overrides: Partial<TrackMatchState> = {}): TrackMatchState {
  return {
    track_id: trackId,
    state: "needs_review",
    decided_by: null,
    // Each track's own attempt, as ids are in a real library.
    attempt_id: 100 + trackId,
    candidate_id: 1001,
    newer_attempt_id: null,
    disputed: false,
    decided_at: null,
    ...overrides,
  };
}

export function matchesFor(trackId: number, state = stateFor(trackId)): TrackMatches {
  return {
    track_id: trackId,
    track: {
      title: `Track ${trackId}`,
      artist: `Artist ${trackId}`,
      mix: null,
      remixer: null,
      album: null,
      label: "Label One",
      genre: "Techno",
      key: "8A",
      bpm: 126,
      year: null,
    },
    state,
    candidate: CANDIDATES.find((entry) => entry.id === state.candidate_id) ?? null,
    attempts: [
      {
        id: 100 + trackId,
        track_id: trackId,
        job_id: "job-match",
        outcome: "matched",
        score: 92,
        best_candidate_id: 1001,
        error: null,
        input: {},
        queries: [],
        matcher_version: "1",
        started_at: "2026-09-15T10:00:00Z",
        finished_at: "2026-09-15T10:00:05Z",
      },
    ],
    total: 1,
  };
}

export function run(overrides: Partial<MatchRun> = {}): MatchRun {
  return {
    job_id: "job-1",
    created_at: "2026-10-12T13:42:00",
    label: 'Playlist "all"',
    rematch: false,
    selected: 179,
    excluded: 0,
    planned: 179,
    done: 179,
    found: 131,
    waiting: 42,
    not_found: 6,
    rejected: 0,
    disputed: 0,
    status: "done",
    finished_at: null,
    latest_job_id: "job-1",
    resume_job_id: null,
    ...overrides,
  };
}

export function ruleOf(params: Record<string, unknown>) {
  return (params.filters as FilterRuleSet | null)?.rules[0];
}

export function browseAnswer(
  params: Record<string, unknown>,
  rows: LibraryTrackRow[],
): LibrarySearchResponse {
  const offset = Number(params.offset ?? 0);
  const limit = Number(params.limit ?? 100);
  const page = rows.slice(offset, offset + limit);
  const ids = params.fields === "id";
  return {
    query: (params.q as string) ?? "",
    total: rows.length,
    limit,
    offset,
    tracks: ids ? [] : page,
    track_ids: ids ? page.map((row) => row.id ?? 0) : undefined,
    library_empty: false,
    mode: "browse",
    scope: (params.playlistId as number | null) ?? null,
    collection_scope: (params.scope as "collection" | "smart" | undefined) ?? null,
    collection_id: (params.collectionId as number | null) ?? null,
    sort: params.sort as string,
    dir: params.dir as "asc" | "desc",
    filters: (params.filters as LibrarySearchResponse["filters"]) ?? null,
  };
}
