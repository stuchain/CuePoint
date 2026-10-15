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

/** The review as the engine answers it: plan order, a page, and the counts and the tick count for all of them. */
function reviewAnswer(
  all: ReviewTrack[],
  params: { after?: string; limit?: number; tickedIds?: boolean } = {},
) {
  // A cursor is "<rank>:<track id>" and the fixture's rank is its id, so reading on is "ids after".
  const after = params.after ? Number(params.after.split(":")[1]) : -1;
  const page = all.filter((row) => row.track_id > after).slice(0, params.limit ?? 20000);
  const answer = reviewOf(page, { total: all.length, counts: reviewOf(all).counts });
  return {
    ...answer,
    ticked: all.filter((row) => row.ticked).length,
    ...(params.tickedIds ? { ids: all.filter((row) => row.ticked).map((row) => row.track_id), tracks: [] } : {}),
  };
}

/** A tick, as the engine would now say it: the row is ticked or not, and keeps its place. */
function tickInReview(world: MatchWorld, trackIds: number[], ticked: boolean) {
  world.review = world.review.map((row) =>
    trackIds.includes(row.track_id) && row.tickable ? { ...row, ticked } : row,
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
    correctMatches: vi.fn(async (params?: { selection?: { track_ids?: number[] } }) => {
      const ids = params?.selection?.track_ids ?? [];
      return {
        applied: {
          batch_id: "batch-values",
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
    setMatchTicks: vi.fn(
      async (params: { ticked: boolean; track_ids?: number[]; scope?: unknown }) => {
        const ids = params.track_ids ?? world.review.map((row) => row.track_id);
        const before = world.review.filter((row) => row.ticked !== params.ticked && ids.includes(row.track_id) && row.tickable);
        tickInReview(world, ids, params.ticked);
        return { ticked: params.ticked, changed: before.length, skipped: 0, batch_id: before.length ? "batch-ticks" : null };
      },
    ),
    decideMatch: vi.fn(async (params: { track_id: number; decision: string; candidate_id?: number }) => {
      if (params.decision === "accept") {
        world.review = world.review.map((row) =>
          row.track_id === params.track_id
            ? {
                ...row,
                status: "matched" as const,
                ticked: true,
                tickable: true,
                candidate: row.candidate ? { ...row.candidate, id: params.candidate_id ?? row.candidate.id } : row.candidate,
              }
            : row,
        );
      }
      return { match: stateFor(params.track_id) };
    }),
    revertBatch: vi.fn(async ({ batch_id }: { batch_id: string }) => ({
      reverted: { batch_id, total: 1, reverted: 1, skipped: 0 },
    })),
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
    getMatchReview: vi.fn(async (params?: { after?: string; limit?: number; tickedIds?: boolean }) =>
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
