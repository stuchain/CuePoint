/**
 * A faked bridge for the Match area's tests (C14), over `matchFixtures`.
 *
 * It answers what the area reads — the windowed browse (the rule set decides
 * which list), a track's matches and candidates, the artwork and preview of a
 * candidate, Past searches — and records what it is asked to do. The lists live
 * in `world`, so a test changes what the next read returns.
 */
import { vi } from "vitest";

import type { FilterRule, LibraryHealth, LibraryTrackRow, MatchRun } from "../api/cuepointBridge.types";
import {
  CANDIDATES,
  browseAnswer,
  matchesFor,
  proposed,
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
}

export function newWorld(): MatchWorld {
  return {
    tracks: [proposed(1), proposed(2), proposed(3)],
    runs: [],
    runTracks: {},
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
    correctMatches: vi.fn(async () => ({
      applied: {
        batch_id: "batch-many",
        operation: "correct_match",
        target: "",
        total: 2,
        changed: 2,
        unchanged: 0,
        failed: 0,
        cancelled: false,
      },
    })),
    decideMatch: vi.fn(async (params: { track_id: number; decision: string }) => {
      world.tracks = world.tracks.map((row) =>
        row.id === params.track_id ? { ...row, match_state: "rejected", match_proposal: null } : row,
      );
      return { match: stateFor(params.track_id) };
    }),
    revertBatch: vi.fn().mockResolvedValue({
      reverted: { batch_id: "batch", total: 1, reverted: 1, skipped: 0 },
    }),
    getMatchJobs: vi.fn(async () => ({ jobs: world.runs, total: world.runs.length })),
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
