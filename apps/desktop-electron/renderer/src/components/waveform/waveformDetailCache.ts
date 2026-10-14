/**
 * The zoomed waveforms the renderer holds (T4).
 *
 * **Asked for once.** A view that shows a track reads its detail
 * (`waveforms.detail`). A detail the engine has not made (`waiting`) is
 * requested (`waveforms.requestDetail`), which puts it first; the engine
 * decodes the file, so the answer is then read every `POLL_MS` while it is
 * `working`, for at most `DETAIL_TIMEOUT_MS`, then it is an error. A poll that
 * still reads `waiting` after a request asks again (the engine may have
 * restarted and lost its queue), up to `MAX_REQUESTS` in all, then it is an
 * error; so is a refused request. Any other state (`missing`, `unchecked`...)
 * is final until the track is shown again: a missing file is not made by asking.
 *
 * **Bounded.** A detail is about 100 KB, so only `DETAIL_LIMIT` are kept, the
 * least recently read going first; one a view shows is never dropped.
 *
 * **Made ahead.** `prefetch` makes a track's detail before it plays (selected in
 * a list, queued, next in the queue). It follows the same states but asks the
 * engine at low priority (`low`), which never displaces a track a view waits
 * for and is turned away, to be asked again, while the engine is busy. It is one
 * per track, gives up after `PREFETCH_TIMEOUT_MS` without an error, stands down
 * as soon as a view shows the track (the view follows it) and does not touch
 * the engine at all while a view waits for another track. What it makes sits in
 * the same bounded cache.
 *
 * **Emptied** by "Delete waveform data" and a finished refresh
 * (`forgetWaveforms`); what is shown is asked for again.
 */
import type { WaveformAnswer, WaveformDetail, WaveformsBridge } from "../../api/cuepointBridge.types";
import { reportUnexpected } from "../../reporting/reporting";
import { userMessage } from "../../api/userMessage";

/** Details kept at once: the current, the next and the previous, and one more. */
export const DETAIL_LIMIT = 4;

/** The time between two reads of a detail being made (ms). */
export const POLL_MS = 500;

/** How long a detail is followed before the cache stops asking (ms), as a file check's. */
export const DETAIL_TIMEOUT_MS = 300_000;

/** Requests per track, the first included: a `waiting` poll after the last one fails. */
export const MAX_REQUESTS = 4;

/** How long a prepare-ahead request is followed (ms): a guess that may be dropped, so shorter. */
export const PREFETCH_TIMEOUT_MS = 60_000;

const WAITING_FAILED = "The waveform was requested but never started";
const TIMED_OUT = "The waveform took too long to make";

export type DetailEntry =
  | { kind: "detail"; detail: WaveformDetail }
  | { kind: "loading" }
  | { kind: "error"; message: string };

const LOADING: DetailEntry = { kind: "loading" };

/** A detail being made ahead of need. */
export interface PrefetchHandle {
  /** Settles when it is ready, final, given up, handed to a view or cancelled; never rejects. */
  done: Promise<void>;
  /** Stop following it. The engine may still finish a decode it began. */
  cancel: () => void;
}

interface Prefetching {
  handle: PrefetchHandle;
  cancelled: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  startedAt: number;
  finish: () => void;
}

const FINISHED: PrefetchHandle = { done: Promise.resolve(), cancel: () => undefined };

type Bridge = Pick<WaveformsBridge, "detail" | "requestDetail">;

interface DetailCacheOptions {
  /** The bridge's waveforms namespace, asked at each use. */
  bridge: () => Bridge | undefined;
  limit?: number;
}

interface Following {
  /** Changes whenever the track's loading is replaced or stopped. */
  token: number;
  timer: ReturnType<typeof setTimeout> | null;
  /** Requests made so far: the first, and the re-requests after it. */
  requests: number;
  startedAt: number;
}

export class WaveformDetailCache {
  private readonly entries = new Map<number, DetailEntry>();
  private readonly shown = new Map<number, number>();
  private readonly following = new Map<number, Following>();
  private readonly prefetching = new Map<number, Prefetching>();
  private readonly listeners = new Set<() => void>();
  private tokens = 0;
  private readonly bridge: () => Bridge | undefined;
  private readonly limit: number;

  constructor(options: DetailCacheOptions) {
    this.bridge = options.bridge;
    this.limit = options.limit ?? DETAIL_LIMIT;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** A track's answer, marked as just read; loading when not answered yet. */
  read(trackId: number): DetailEntry {
    const entry = this.entries.get(trackId);
    if (entry === undefined) return LOADING;
    this.entries.delete(trackId);
    this.entries.set(trackId, entry);
    return entry;
  }

  get size(): number {
    return this.entries.size;
  }

  /** A view shows this track until the returned function is called. */
  show(trackId: number): () => void {
    this.shown.set(trackId, (this.shown.get(trackId) ?? 0) + 1);
    // The view follows it now.
    this.prefetching.get(trackId)?.handle.cancel();
    const entry = this.entries.get(trackId);
    const ready = entry?.kind === "detail" && entry.detail.state === "ready";
    if (!ready && !this.following.has(trackId)) this.begin(trackId);
    return () => {
      const count = (this.shown.get(trackId) ?? 1) - 1;
      if (count > 0) {
        this.shown.set(trackId, count);
        return;
      }
      this.shown.delete(trackId);
      this.stop(trackId);
    };
  }

  /**
   * Make this track's detail ahead of need, if it is not held or being made.
   * Asking twice is the same request.
   */
  prefetch(trackId: number): PrefetchHandle {
    const held = this.prefetching.get(trackId);
    if (held) return held.handle;
    const entry = this.entries.get(trackId);
    const pending = entry === undefined || (entry.kind === "detail" && (entry.detail.state === "waiting" || entry.detail.state === "working"));
    if (!pending || this.following.has(trackId) || this.shown.has(trackId)) return FINISHED;
    let finish = () => undefined as void;
    const done = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const state: Prefetching = {
      handle: { done, cancel: () => undefined },
      cancelled: false,
      timer: null,
      startedAt: Date.now(),
      finish,
    };
    state.handle.cancel = () => {
      state.cancelled = true;
      if (state.timer !== null) clearTimeout(state.timer);
      state.timer = null;
      if (this.prefetching.get(trackId) === state) this.prefetching.delete(trackId);
      finish();
    };
    this.prefetching.set(trackId, state);
    void this.prefetchStep(trackId, state);
    return state.handle;
  }

  private async prefetchStep(trackId: number, state: Prefetching): Promise<void> {
    if (state.cancelled) return;
    const stop = () => state.handle.cancel();
    const later = () => {
      state.timer = setTimeout(() => {
        state.timer = null;
        void this.prefetchStep(trackId, state);
      }, POLL_MS);
    };
    const bridge = this.bridge();
    // A view follows this track now, or the engine is wanted for another one.
    if (!bridge?.detail || this.following.has(trackId) || this.shown.has(trackId)) return stop();
    if (Date.now() - state.startedAt >= PREFETCH_TIMEOUT_MS) return stop();
    if (this.following.size > 0) return later();
    const handedOver = () => state.cancelled || this.following.has(trackId) || this.shown.has(trackId);
    try {
      const answer = await bridge.detail({ track_id: trackId });
      if (handedOver()) return stop();
      if (answer.refusal) return stop();
      let detail = answer.value;
      this.store(trackId, { kind: "detail", detail });
      if (detail.state === "waiting") {
        const requested = await bridge.requestDetail({ track_id: trackId, low: true });
        if (handedOver()) return stop();
        if (requested.refusal) return stop();
        const next = requested.value?.state;
        if (next && next !== "working" && next !== "ready" && next !== "waiting") {
          detail = { ...detail, state: next };
          this.store(trackId, { kind: "detail", detail });
          return stop();
        }
      } else if (detail.state !== "working") {
        return stop();
      }
    } catch {
      // A guess that failed is not worth a report: the view asks for itself.
      return stop();
    }
    later();
  }

  /** Empty the cache: every shown track is asked for again. */
  forget(): void {
    for (const trackId of [...this.following.keys()]) this.stop(trackId);
    for (const state of [...this.prefetching.values()]) state.handle.cancel();
    this.entries.clear();
    this.emit();
    for (const trackId of this.shown.keys()) this.begin(trackId);
  }

  // ------------------------------------------------------------- loading

  private begin(trackId: number): void {
    this.tokens += 1;
    this.following.set(trackId, { token: this.tokens, timer: null, requests: 0, startedAt: Date.now() });
    void this.step(trackId);
  }

  private stop(trackId: number): void {
    const following = this.following.get(trackId);
    if (!following) return;
    if (following.timer !== null) clearTimeout(following.timer);
    this.following.delete(trackId);
  }

  private async step(trackId: number): Promise<void> {
    const following = this.following.get(trackId);
    const bridge = this.bridge();
    if (!following || !bridge?.detail) {
      this.following.delete(trackId);
      return;
    }
    const { token } = following;
    const alive = () => this.following.get(trackId)?.token === token;
    let answer: WaveformAnswer<WaveformDetail>;
    try {
      answer = await bridge.detail({ track_id: trackId });
    } catch (cause) {
      reportUnexpected(cause);
      if (alive()) this.fail(trackId, userMessage(cause));
      return;
    }
    if (!alive()) return;
    if (answer.refusal) {
      this.fail(trackId, answer.refusal.message);
      return;
    }
    let detail = answer.value;
    this.store(trackId, { kind: "detail", detail });

    if (detail.state === "waiting") {
      // Still waiting after a request: the engine may have restarted and lost
      // its queue, so ask again, a few times, then say it will not.
      if (following.requests >= MAX_REQUESTS) {
        this.fail(trackId, WAITING_FAILED);
        return;
      }
      following.requests += 1;
      try {
        const requested = await bridge.requestDetail({ track_id: trackId });
        if (!alive()) return;
        if (requested.refusal) {
          this.fail(trackId, requested.refusal.message);
          return;
        }
        const next = requested.value?.state;
        if (next && next !== "working" && next !== "ready" && next !== "waiting") {
          // The engine says why it will not: that is the state now.
          detail = { ...detail, state: next };
          this.store(trackId, { kind: "detail", detail });
        }
      } catch (cause) {
        reportUnexpected(cause);
        if (alive()) this.fail(trackId, userMessage(cause));
        return;
      }
    }

    const pending = detail.state === "working" || detail.state === "waiting";
    if (!pending) {
      this.following.delete(trackId);
      return;
    }
    if (Date.now() - following.startedAt >= DETAIL_TIMEOUT_MS) {
      this.fail(trackId, TIMED_OUT);
      return;
    }
    following.timer = setTimeout(() => {
      following.timer = null;
      void this.step(trackId);
    }, POLL_MS);
  }

  private fail(trackId: number, message: string): void {
    this.following.delete(trackId);
    this.store(trackId, { kind: "error", message });
  }

  private store(trackId: number, entry: DetailEntry): void {
    this.entries.delete(trackId);
    this.entries.set(trackId, entry);
    for (const key of this.entries.keys()) {
      if (this.entries.size <= this.limit) break;
      if (!this.shown.has(key)) this.entries.delete(key);
    }
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener());
  }
}

/** The one cache the app's views share. */
export const waveformDetailCache = new WaveformDetailCache({
  bridge: () => (typeof window === "undefined" ? undefined : window.cuepoint?.waveforms),
});
