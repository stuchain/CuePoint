/**
 * A faked bridge for the Match area's tests (C14), over `matchFixtures`.
 *
 * It answers what the area reads — the windowed browse (the rule set decides
 * which list), a track's matches and candidates, the artwork and preview of a
 * candidate, Past searches — and records what it is asked to do. The lists live
 * in `world`, so a test changes what the next read returns.
 */
import { vi } from "vitest";

import type {
  FilterRule,
  LibraryHealth,
  LibraryTrackRow,
  MatchRun,
  ReviewTrack,
} from "../api/cuepointBridge.types";
import {
  CANDIDATES,
  browseAnswer,
  matchesFor,
  proposed,
  reviewOf,
  stateFor,
  track,
} from "./matchFixtures";

type Fn = ReturnType<typeof vi.fn>;

export interface MatchWorld {
  /** Every track the faked library holds. */
  tracks: LibraryTrackRow[];
  /** Past searches, newest first. */
  runs: MatchRun[];
  /** The tracks of each run, by root job id. */
  runTracks: Record<string, number[]>;
  /** What the Review list holds: every track of the run being reviewed, as the engine sends it. */
  review: ReviewTrack[];
}

export function newWorld(): MatchWorld {
  return {
    tracks: [proposed(1), proposed(2), proposed(3)],
    runs: [],
    runTracks: {},
    review: [],
  };
}

function holds(row: LibraryTrackRow, rule: FilterRule, world: MatchWorld): boolean {
  switch (rule.field) {
    case "match_state":
      return row.match_state === rule.value;
    case "match_disputed":
      return row.match_disputed === rule.value;
    case "match_run":
      return (world.runTracks[String(rule.value)] ?? []).includes(row.id ?? -1);
    default:
      return true;
  }
}

/** The jsdom has no layout: the table needs a size, a ResizeObserver and a scroll. */
export function installTableEnvironment() {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 1200,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 600,
  });
  Element.prototype.scrollTo ??= function scrollTo() {};
}

export function removeTableEnvironment() {
  Reflect.deleteProperty(HTMLElement.prototype, "offsetWidth");
  Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
}

/**
 * The review as the engine answers it: the tracks still to look at first, a filter, a page, and
 * the counts for all of them; with `idsOnly`, just the ids of the filter.
 */
function reviewAnswer(
  all: ReviewTrack[],
  params: { filter?: string; after?: string; limit?: number; idsOnly?: boolean } = {},
) {
  const ordered = [...all.filter((row) => row.status !== "done"), ...all.filter((row) => row.status === "done")];
  const filter = params.filter ?? "all";
  const held = ordered.filter((row) =>
    filter === "all"
      ? true
      : filter === "rejected"
        ? row.decision === "rejected"
        : filter === "disputed"
          ? row.disputed
          : row.status === filter,
  );
  // Read on from a cursor: the listing order is (decided, plan order), and a cursor carries its place in it.
  const place = (row: ReviewTrack) => (row.status === "done" ? 1 : 0) * 1e9 + row.track_id;
  const [group, at] = (params.after ?? "").split(":").map(Number);
  const past = params.after ? group! * 1e9 + at! : -1;
  const page = held.filter((row) => place(row) > past).slice(0, params.limit ?? 20000);
  const answer = reviewOf(page, { total: all.length, matching: held.length, counts: reviewOf(all).counts });
  return {
    ...answer,
    rejected: all.filter((row) => row.decision === "rejected").length,
    disputed: all.filter((row) => row.disputed).length,
    ...(params.idsOnly ? { ids: held.map((row) => row.track_id), tracks: [] } : {}),
  };
}

/** A decision, as the engine would now say it: the track is done, with what was decided. */
function decideInReview(
  world: MatchWorld,
  trackId: number,
  status: ReviewTrack["status"],
  decision: ReviewTrack["decision"],
  batch: string | null = decision === "accepted" ? `batch-${trackId}` : null,
) {
  world.review = world.review.map((row) =>
    row.track_id === trackId ? { ...row, status, decision, undo_batch: batch } : row,
  );
}

/** Undo, as the engine would say it: back to what the search found. */
function undoInReview(world: MatchWorld, trackId: number) {
  world.review = world.review.map((row) =>
    row.track_id === trackId
      ? { ...row, status: row.candidate ? "to_check" : "not_found", decision: null, undo_batch: null }
      : row,
  );
}

export function installMatchBridge(
  world: MatchWorld,
  overrides: Record<string, Fn> = {},
): Record<string, Fn> {
  const bridge: Record<string, Fn> = {
    browseLibrary: vi.fn(async (params: Record<string, unknown>) => {
      const rules = (params.filters as { rules?: FilterRule[] } | null)?.rules ?? [];
      const rows = world.tracks.filter((row) => rules.every((rule) => holds(row, rule, world)));
      return browseAnswer(params, rows);
    }),
    getLibraryTrack: vi.fn(async ({ trackId }: { trackId: number }) => ({
      track: world.tracks.find((row) => row.id === trackId) ?? track(trackId),
      playlists: [],
      playlist_count: 0,
      metadata: null,
      tags: [],
      collections: [],
    })),
    getTrackHistory: vi.fn().mockResolvedValue({ track_id: 1, changes: [], limit: 50 }),
    getTrackMatches: vi.fn(async ({ trackId }: { trackId: number }) => matchesFor(trackId)),
    getMatchCandidates: vi.fn(async ({ attemptId }: { attemptId: number }) => ({
      attempt_id: attemptId,
      track_id: 1,
      candidates: CANDIDATES,
      total: CANDIDATES.length,
    })),
    getCandidateArtwork: vi.fn().mockResolvedValue(null),
    getCandidatePreview: vi.fn().mockResolvedValue(null),
    releaseCandidatePreview: vi.fn(),
    releaseTrackArtwork: vi.fn(),
    correctMatch: vi.fn(async ({ track_id }: { track_id: number }) => {
      decideInReview(world, track_id, "done", "accepted");
      world.tracks = world.tracks.map((row) =>
        row.id === track_id ? { ...row, match_state: "accepted", match_proposal: null } : row,
      );
      return {
        match: stateFor(track_id, { state: "accepted", decided_by: "user" }),
        track: track(track_id),
        batch_id: `batch-${track_id}`,
        changed: true,
        applied: ["bpm", "label", "year"],
        skipped: [],
        unchanged: [],
        key: null,
      };
    }),
    correctMatches: vi.fn(async (params?: { selection?: { track_ids?: number[] } }) => {
      const ids = params?.selection?.track_ids ?? [];
      for (const id of ids) decideInReview(world, id, "done", "accepted", "batch-many");
      return {
        applied: {
          batch_id: "batch-many",
          operation: "correct_match",
          target: "",
          total: ids.length,
          changed: ids.length,
          unchanged: 0,
          failed: 0,
          cancelled: false,
        },
      };
    }),
    decideMatch: vi.fn(async (params: { track_id: number; decision: string }) => {
      if (params.decision === "clear") undoInReview(world, params.track_id);
      else decideInReview(world, params.track_id, "done", "rejected");
      world.tracks = world.tracks.map((row) =>
        row.id === params.track_id ? { ...row, match_state: "rejected", match_proposal: null } : row,
      );
      return { match: stateFor(params.track_id) };
    }),
    revertBatch: vi.fn(async ({ batch_id, track_id }: { batch_id: string; track_id?: number }) => {
      // A single correction's batch is "batch-<track id>"; Accept all's is "batch-many", which
      // covers every track decided with it. With a track named, only that track goes back.
      if (track_id !== undefined) undoInReview(world, track_id);
      else if (batch_id === "batch-many") {
        for (const row of world.review) if (row.undo_batch === "batch-many") undoInReview(world, row.track_id);
      } else {
        const id = Number(String(batch_id).replace("batch-", ""));
        if (Number.isInteger(id)) undoInReview(world, id);
      }
      return { reverted: { batch_id, total: 1, reverted: 1, skipped: 0 } };
    }),
    searchMatch: vi.fn(async ({ track_id, query }: { track_id: number; query: string }) => ({
      attempt_id: 500 + track_id,
      track_id,
      candidates: CANDIDATES,
      total: CANDIDATES.length,
      query,
      failure: null,
      failure_message: null,
      state: stateFor(track_id),
    })),
    getMatchJobs: vi.fn(async () => ({ jobs: world.runs, total: world.runs.length })),
    getMatchReview: vi.fn(
      async (params?: { filter?: string; after?: string; limit?: number; idsOnly?: boolean }) =>
        reviewAnswer(world.review, params),
    ),
    startCleanMatch: vi.fn().mockResolvedValue({
      job_id: "job-match",
      id: "job-match",
      state: "queued",
      selected: 3,
      excluded: 1,
      planned: 2,
      resumed_from: null,
    }),
    getJob: vi.fn().mockResolvedValue({ id: "job", state: "succeeded" }),
    getJobResults: vi.fn().mockResolvedValue({ id: "job", state: "succeeded" }),
    ...overrides,
  };
  (window as unknown as { cuepoint?: unknown }).cuepoint = bridge;
  return bridge;
}

export function removeMatchBridge() {
  delete (window as unknown as { cuepoint?: unknown }).cuepoint;
}

/** Health with a given count of tracks never looked up. */
export function healthWith(base: LibraryHealth, entries: Record<string, number>): LibraryHealth {
  return {
    ...base,
    counts: base.counts.map((count) => ({ ...count, count: entries[count.id] ?? count.count })),
  };
}
