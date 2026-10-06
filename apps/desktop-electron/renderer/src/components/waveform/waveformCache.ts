/**
 * Waveforms held in the renderer, shared by every view that draws one (WAVE-05).
 *
 * **Batches.** The ids every view asks for in one task are collected and
 * requested together, at most 200 to a request, so a table of forty rows is one
 * request, not forty. A track already held, or already on its way, is not
 * asked for again.
 *
 * **Bounded.** Up to 2,000 answers are kept, keyed by track, width and whether
 * marks were asked for; the least recently read goes first.
 *
 * **Refreshed.** While a view shows a track that is waiting for the analysis,
 * the analysis is read every 2 seconds, and when its count of finished files
 * moves, the waiting tracks being shown are asked for again, at most once
 * every 2 seconds. That is how a waveform appears while someone watches. The
 * first read after the following starts asks again too: a track requested the
 * moment it was shown is analysed in about a second, before that read, and a
 * count first noted after it would never move for it (WAVE-06). A view that
 * shows a loudness (WAVE-08) says so in its query, and a ready track it shows
 * whose loudness is still to be measured waits the same way; a view that only
 * draws does not ask again for a number it never shows.
 *
 * **Without pictures.** A query of no width asks for states and loudness alone
 * (`data: false`), for a column that shows a number.
 *
 * **Emptied** by "Delete waveform data" and by a finished refresh, which can
 * move a track to another file (`forgetWaveforms`).
 *
 * An id the engine says is no track is held as such, so it is not asked for
 * again. A request that fails is held as an error, and asked for again on the
 * next look no sooner than `RETRY_MS` later.
 */
import type {
  WaveformAnalysisStatus,
  WaveformAnswer,
  WaveformBatch,
  WaveformTrack,
  WaveformsBridge,
  WaveformsQuery,
} from "../../api/cuepointBridge.types";

/** Ids per request: the engine's own limit. */
export const BATCH_SIZE = 200;

/** Answers kept at once. */
export const CACHE_LIMIT = 2_000;

/** The least time between two reads of the analysis, and two refreshes. */
export const REFRESH_MS = 2_000;

/** How long a track whose request failed waits before it is asked for again. */
export const RETRY_MS = 5_000;

/** One track's answer, as a view reads it. */
export type WaveformEntry =
  | { kind: "track"; track: WaveformTrack; paused: boolean }
  /** The engine knows no such track. */
  | { kind: "unknown" }
  /** Not answered yet. */
  | { kind: "loading" }
  /** The last request failed; it is asked for again later. */
  | { kind: "error"; message: string };

const LOADING: WaveformEntry = { kind: "loading" };

export interface WaveformQuery {
  /** The picture's columns; null asks for no picture, only states and loudness. */
  width: number | null;
  marks: boolean;
  /** The view shows each track's loudness, so it waits for one still to be measured. */
  loudness?: boolean;
}

type Bridge = Pick<WaveformsBridge, "get" | "analysis">;

function groupOf({ width, marks, loudness }: WaveformQuery): string {
  return `${width ?? "-"}:${marks ? 1 : 0}${loudness ? ":L" : ""}`;
}

function keyOf(trackId: number, query: WaveformQuery): string {
  return `${trackId}:${groupOf(query)}`;
}

/** True when an answer waits for the analysis, as a view with this query sees it. */
export function waitsInView(entry: WaveformEntry | undefined | null, query: Pick<WaveformQuery, "loudness">): boolean {
  if (entry?.kind !== "track") return false;
  if (entry.track.state === "waiting") return true;
  return Boolean(query.loudness) && entry.track.state === "ready" && entry.track.loudness === null;
}

/** The request one query makes for these tracks. */
function askFor(trackIds: number[], query: WaveformQuery): WaveformsQuery {
  return query.width === null
    ? { track_ids: trackIds, marks: query.marks, data: false }
    : { track_ids: trackIds, width: query.width, marks: query.marks };
}

/**
 * Every answer for these tracks, read now rather than through the cache's
 * batches and without keeping them: what a copy of thousands of rows reads
 * (WAVE-08). 200 to a request, one request at a time. A batch that fails or is
 * refused answers as an error for each of its tracks, so a copy says nothing
 * rather than something wrong.
 */
export async function readEntries(
  bridge: Pick<WaveformsBridge, "get"> | undefined,
  trackIds: readonly number[],
  query: WaveformQuery,
): Promise<Map<number, WaveformEntry>> {
  const answers = new Map<number, WaveformEntry>();
  const ids = [...new Set(trackIds)];
  for (let start = 0; start < ids.length; start += BATCH_SIZE) {
    const batch = ids.slice(start, start + BATCH_SIZE);
    let message: string | null = null;
    try {
      const answer = bridge ? await bridge.get(askFor(batch, query)) : null;
      if (!answer) message = "The engine is not available";
      else if (answer.refusal) message = answer.refusal.message;
      else {
        for (const track of answer.value.waveforms) {
          answers.set(track.track_id, { kind: "track", track, paused: answer.value.paused });
        }
        for (const trackId of answer.value.unknown) answers.set(trackId, { kind: "unknown" });
      }
    } catch (cause) {
      message = cause instanceof Error ? cause.message : String(cause);
    }
    if (message !== null) {
      for (const trackId of batch) answers.set(trackId, { kind: "error", message });
    }
  }
  return answers;
}

export interface WaveformCacheOptions {
  /** The bridge's waveforms namespace, asked at each use. */
  bridge: () => Bridge | undefined;
  now?: () => number;
  /** Schedules the batch's flush; the end of the current task by default. */
  schedule?: (run: () => void) => void;
  setInterval?: (run: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  limit?: number;
}

export class WaveformCache {
  private readonly entries = new Map<string, WaveformEntry>();
  private readonly failed = new Map<string, number>();
  /** Per width and marks, the ids waiting for the next flush. */
  private readonly queued = new Map<string, { query: WaveformQuery; ids: Set<number> }>();
  private readonly inFlight = new Set<string>();
  /** Keys a mounted view shows, with how many views show each. */
  private readonly shown = new Map<string, { trackId: number; query: WaveformQuery; count: number }>();
  private readonly listeners = new Set<() => void>();
  private flushScheduled = false;
  private poller: unknown = null;
  private lastFinished: number | null = null;
  private lastRefresh = Number.NEGATIVE_INFINITY;
  private generation = 0;

  private readonly bridge: () => Bridge | undefined;
  private readonly now: () => number;
  private readonly schedule: (run: () => void) => void;
  private readonly startInterval: (run: () => void, ms: number) => unknown;
  private readonly stopInterval: (handle: unknown) => void;
  private readonly limit: number;

  constructor(options: WaveformCacheOptions) {
    this.bridge = options.bridge;
    this.now = options.now ?? (() => Date.now());
    this.schedule = options.schedule ?? ((run) => void setTimeout(run, 0));
    this.startInterval = options.setInterval ?? ((run, ms) => setInterval(run, ms));
    this.stopInterval =
      options.clearInterval ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
    this.limit = options.limit ?? CACHE_LIMIT;
  }

  /** Called whenever an answer arrives or the cache is emptied. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A track's answer, marked as just read; loading when not answered yet. */
  read(trackId: number, query: WaveformQuery): WaveformEntry {
    const key = keyOf(trackId, query);
    const entry = this.entries.get(key);
    if (entry === undefined) return LOADING;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  /** Ask for every track not held or on its way; requested at the end of the task. */
  want(trackIds: Iterable<number>, query: WaveformQuery): void {
    const now = this.now();
    for (const trackId of trackIds) {
      const key = keyOf(trackId, query);
      if (this.inFlight.has(key)) continue;
      const entry = this.entries.get(key);
      if (entry !== undefined && entry.kind !== "error") continue;
      if (entry?.kind === "error" && now - (this.failed.get(key) ?? 0) < RETRY_MS) continue;
      this.queue(trackId, query);
    }
  }

  /**
   * A view shows these tracks until the returned function is called. While a
   * shown track is waiting, the analysis is followed and the track refreshed.
   */
  show(trackIds: readonly number[], query: WaveformQuery): () => void {
    const keys = trackIds.map((trackId) => {
      const key = keyOf(trackId, query);
      const held = this.shown.get(key);
      if (held) held.count += 1;
      else this.shown.set(key, { trackId, query, count: 1 });
      return key;
    });
    this.want(trackIds, query);
    this.follow();
    return () => {
      for (const key of keys) {
        const held = this.shown.get(key);
        if (!held) continue;
        held.count -= 1;
        if (held.count <= 0) this.shown.delete(key);
      }
      this.follow();
    };
  }

  /** Empty the cache: every shown track is asked for again. */
  forget(): void {
    this.generation += 1;
    this.entries.clear();
    this.failed.clear();
    this.inFlight.clear();
    this.lastFinished = null;
    for (const { trackId, query } of this.shown.values()) this.queue(trackId, query);
    this.emit();
  }

  /** Answers held now. */
  get size(): number {
    return this.entries.size;
  }

  // ------------------------------------------------------------------ batch

  private queue(trackId: number, query: WaveformQuery): void {
    const group = groupOf(query);
    let pending = this.queued.get(group);
    if (!pending) {
      pending = { query, ids: new Set() };
      this.queued.set(group, pending);
    }
    pending.ids.add(trackId);
    if (!this.flushScheduled) {
      this.flushScheduled = true;
      this.schedule(() => this.flush());
    }
  }

  /** Request everything queued, 200 ids at a time. */
  flush(): void {
    this.flushScheduled = false;
    const groups = [...this.queued.values()];
    this.queued.clear();
    for (const { query, ids } of groups) {
      const all = [...ids];
      for (let start = 0; start < all.length; start += BATCH_SIZE) {
        void this.request(all.slice(start, start + BATCH_SIZE), query);
      }
    }
  }

  private async request(trackIds: number[], query: WaveformQuery): Promise<void> {
    const get = this.bridge()?.get;
    const keys = trackIds.map((trackId) => keyOf(trackId, query));
    if (!get) return;
    const generation = this.generation;
    keys.forEach((key) => this.inFlight.add(key));
    let answer: WaveformAnswer<WaveformBatch>;
    try {
      answer = await get(askFor(trackIds, query));
    } catch (cause) {
      this.settleFailed(keys, generation, cause instanceof Error ? cause.message : String(cause));
      return;
    }
    if (generation !== this.generation) return;
    keys.forEach((key) => this.inFlight.delete(key));
    if (answer.refusal) {
      this.settleFailed(keys, generation, answer.refusal.message);
      return;
    }
    const batch = answer.value;
    for (const track of batch.waveforms) {
      this.store(keyOf(track.track_id, query), { kind: "track", track, paused: batch.paused });
    }
    for (const trackId of batch.unknown) {
      this.store(keyOf(trackId, query), { kind: "unknown" });
    }
    this.emit();
    this.follow();
  }

  private settleFailed(keys: string[], generation: number, message: string): void {
    if (generation !== this.generation) return;
    const now = this.now();
    for (const key of keys) {
      this.inFlight.delete(key);
      this.store(key, { kind: "error", message });
      this.failed.set(key, now);
    }
    this.emit();
  }

  private store(key: string, entry: WaveformEntry): void {
    this.failed.delete(key);
    this.entries.delete(key);
    this.entries.set(key, entry);
    while (this.entries.size > this.limit) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }

  // ---------------------------------------------------------- the analysis

  private waitingShown(): { trackId: number; query: WaveformQuery }[] {
    return [...this.shown.entries()]
      .filter(([key, held]) => waitsInView(this.entries.get(key), held.query))
      .map(([, held]) => held);
  }

  /** Follow the analysis while a shown track waits for it; stop once none does. */
  private follow(): void {
    const needed = this.waitingShown().length > 0;
    if (needed && this.poller === null) {
      this.poller = this.startInterval(() => void this.poll(), REFRESH_MS);
    } else if (!needed && this.poller !== null) {
      this.stopInterval(this.poller);
      this.poller = null;
      this.lastFinished = null;
    }
  }

  /**
   * Read the analysis; on the first read, and whenever its finished count
   * moved, refresh the waiting tracks shown.
   */
  async poll(): Promise<void> {
    const analysis = this.bridge()?.analysis;
    if (!analysis) return;
    let status: WaveformAnalysisStatus;
    try {
      const answer = await analysis();
      if (answer.refusal) return;
      status = answer.value;
    } catch {
      return;
    }
    const finished = status.analysed + status.failed;
    const moved = this.lastFinished === null || finished !== this.lastFinished;
    this.lastFinished = finished;
    if (!moved || this.now() - this.lastRefresh < REFRESH_MS) return;
    this.lastRefresh = this.now();
    this.refreshWaiting();
  }

  /** Ask again for every waiting track a view shows; each keeps its answer until then. */
  refreshWaiting(): void {
    for (const { trackId, query } of this.waitingShown()) {
      if (!this.inFlight.has(keyOf(trackId, query))) this.queue(trackId, query);
    }
  }
}

/** The one cache the app's views share. */
export const waveformCache = new WaveformCache({
  bridge: () => (typeof window === "undefined" ? undefined : window.cuepoint?.waveforms),
});

/** Empty the shared cache: after "Delete waveform data" and a finished refresh. */
export function forgetWaveforms(): void {
  waveformCache.forget();
}
