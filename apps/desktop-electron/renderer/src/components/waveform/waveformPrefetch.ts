/**
 * Which tracks' zoomed waveforms are made before they play (T4).
 *
 * The strip's 75/s detail is made on demand, so the first seconds of a track
 * would be drawn from the overview. This makes it ahead of that: for the track
 * selected in a list once the arrow keys pause (`PREFETCH_DEBOUNCE_MS`), and
 * for the next one in the queue (which is also the one just queued, when
 * nothing else is). The next track comes first, since it is the likelier to
 * play.
 *
 * **Bounded.** One request in flight (the engine has one detail worker), the
 * next starting when it ends. A request whose track is no longer wanted is
 * cancelled. The track playing is the strip's own and is never asked for here.
 * Nothing is asked for twice while it stays wanted; the cache holds the
 * results within its own bound and stands down for any view that shows a track.
 */
import type { PrefetchHandle } from "./waveformDetailCache";

/** A pause in the selection this long means the user has stopped on a track (ms). */
export const PREFETCH_DEBOUNCE_MS = 300;

export interface DetailPrefetcherCache {
  prefetch: (trackId: number) => PrefetchHandle;
}

export class WaveformPrefetcher {
  private selected: number | null = null;
  private next: number | null = null;
  private playing: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: { trackId: number; handle: PrefetchHandle } | null = null;
  /** Tracks asked for since they were last unwanted. */
  private readonly attempted = new Set<number>();
  private disposed = false;

  private readonly cache: DetailPrefetcherCache;
  private readonly debounceMs: number;

  constructor(cache: DetailPrefetcherCache, debounceMs: number = PREFETCH_DEBOUNCE_MS) {
    this.cache = cache;
    this.debounceMs = debounceMs;
  }

  setSelected(trackId: number | null): void {
    if (this.selected === trackId) return;
    this.selected = trackId;
    this.arm();
  }

  setNext(trackId: number | null): void {
    if (this.next === trackId) return;
    this.next = trackId;
    this.arm();
  }

  setPlaying(trackId: number | null): void {
    if (this.playing === trackId) return;
    this.playing = trackId;
    this.arm();
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.running?.handle.cancel();
    this.running = null;
  }

  private arm(): void {
    if (this.disposed) return;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.settle();
    }, this.debounceMs);
  }

  private wanted(): number[] {
    const found: number[] = [];
    for (const id of [this.next, this.selected]) {
      if (id !== null && id !== this.playing && !found.includes(id)) found.push(id);
    }
    return found;
  }

  private settle(): void {
    if (this.disposed) return;
    const wanted = this.wanted();
    for (const id of [...this.attempted]) if (!wanted.includes(id)) this.attempted.delete(id);
    if (this.running && !wanted.includes(this.running.trackId)) {
      this.running.handle.cancel();
      this.running = null;
    }
    this.pump(wanted);
  }

  private pump(wanted: number[]): void {
    if (this.disposed || this.running) return;
    const trackId = wanted.find((id) => !this.attempted.has(id));
    if (trackId === undefined) return;
    this.attempted.add(trackId);
    const handle = this.cache.prefetch(trackId);
    const entry = { trackId, handle };
    this.running = entry;
    void handle.done.then(() => {
      if (this.running !== entry) return;
      this.running = null;
      this.pump(this.wanted());
    });
  }
}
