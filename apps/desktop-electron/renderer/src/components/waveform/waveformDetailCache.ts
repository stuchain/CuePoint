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
 * **Emptied** by "Delete waveform data" and a finished refresh
 * (`forgetWaveforms`); what is shown is asked for again.
 */
import type { WaveformAnswer, WaveformDetail, WaveformsBridge } from "../../api/cuepointBridge.types";
import { reportUnexpected } from "../../reporting/reporting";

/** Details kept at once: the current, the next and the previous, and one more. */
export const DETAIL_LIMIT = 4;

/** The time between two reads of a detail being made (ms). */
export const POLL_MS = 500;

/** How long a detail is followed before the cache stops asking (ms), as a file check's. */
export const DETAIL_TIMEOUT_MS = 300_000;

/** Requests per track, the first included: a `waiting` poll after the last one fails. */
export const MAX_REQUESTS = 4;

const WAITING_FAILED = "The waveform was requested but never started";
const TIMED_OUT = "The waveform took too long to make";

export type DetailEntry =
  | { kind: "detail"; detail: WaveformDetail }
  | { kind: "loading" }
  | { kind: "error"; message: string };

const LOADING: DetailEntry = { kind: "loading" };

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

  /** Empty the cache: every shown track is asked for again. */
  forget(): void {
    for (const trackId of [...this.following.keys()]) this.stop(trackId);
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
      if (alive()) this.fail(trackId, cause instanceof Error ? cause.message : String(cause));
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
        if (alive()) this.fail(trackId, cause instanceof Error ? cause.message : String(cause));
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
