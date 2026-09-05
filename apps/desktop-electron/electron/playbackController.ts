import type { MpvEndFile, MpvStartFile } from "./mpvClient";
import {
  PlaybackQueue,
  type QueueItem,
  type QueueItemInput,
  type QueueSnapshot,
  type QueueWindow,
  type RepeatMode,
} from "./playbackQueue";
import type { PlayerSnapshot, PlayerSupervisor } from "./playerSupervisor";

/**
 * Where the queue meets mpv (PLAYER-04, DEC-050).
 *
 * `PlaybackQueue` decides what plays next and knows nothing about processes;
 * `PlayerSupervisor` runs mpv and knows nothing about queues. This joins them,
 * and owns the one genuinely subtle thing in between: **gapless playback**.
 *
 * ## How gapless works, and why it shapes this file
 *
 * `--gapless-audio=yes` only removes the gap *inside mpv's own playlist*. If
 * CuePoint waited for `end-file` and then loaded the next track, there would be
 * a gap between every pair of tracks — the exact thing DEC-056 promises there
 * will not be. So the next track is appended to mpv's playlist *while the
 * current one is still playing*, and mpv walks into it by itself.
 *
 * That means mpv, not CuePoint, decides the moment of the transition, and this
 * class has to notice it after the fact. It does that with playlist entry ids:
 * `loadfile` returns the id of the entry it created, and the `start-file` event
 * carries the id of the entry mpv just began. Positions cannot be used —
 * mpv reports `playlist-pos` as -1 until playback actually starts, and indices
 * shift as the playlist changes. Ids are stable, which is the same reason the
 * queue tracks its current item by identity.
 *
 * Manual actions — next, previous, jumping — use `replace` instead, which
 * clears mpv's playlist and starts immediately. A gap there is not a defect: the
 * user asked for the change and expects it to happen now.
 */

export interface PlaybackControllerOptions {
  queue?: PlaybackQueue;
  /** Injected in tests. */
  random?: () => number;
}

export interface PlaybackControllerSnapshot extends PlayerSnapshot {
  queue: QueueSnapshot;
}

export type ControllerListener = (snapshot: PlaybackControllerSnapshot) => void;

export class PlaybackController {
  private readonly queue: PlaybackQueue;
  private readonly listeners = new Set<ControllerListener>();
  private readonly unsubscribes: Array<() => void> = [];

  /** mpv playlist entry id -> queue item id. */
  private entryToItem = new Map<number, string>();
  /** The queue item currently preloaded into mpv, if any. */
  private preloadedItemId: string | null = null;

  constructor(
    private readonly player: PlayerSupervisor,
    options: PlaybackControllerOptions = {},
  ) {
    this.queue = options.queue ?? new PlaybackQueue({ random: options.random });

    this.unsubscribes.push(
      this.player.onSnapshot(() => this.publish()),
      this.player.onStartFile((info) => this.onStartFile(info)),
      this.player.onEndFile((info) => this.onEndFile(info)),
    );
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  snapshot(): PlaybackControllerSnapshot {
    return { ...this.player.getSnapshot(), queue: this.queue.snapshot() };
  }

  /**
   * One page of the queue, for the panel (PLAYER-08).
   *
   * Served from the queue already in memory rather than re-queried from the
   * engine: main built these items when the view was resolved (PLAYER-05) and
   * they are the queue, so asking the engine again could only disagree.
   */
  queueWindow(offset: number, limit: number): QueueWindow {
    return this.queue.window(offset, limit);
  }

  onSnapshot(listener: ControllerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(): void {
    if (this.listeners.size === 0) return;
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
    this.listeners.clear();
  }

  // -------------------------------------------------------------------------
  // Starting playback
  // -------------------------------------------------------------------------

  /**
   * Play a view's worth of tracks, starting at one of them (DEC-012).
   *
   * Replaces whatever was queued, which is what double-clicking means.
   */
  async playQueue(items: readonly QueueItemInput[], startIndex = 0): Promise<void> {
    const start = this.queue.replace(items, startIndex);
    if (!start) {
      await this.stop();
      return;
    }
    await this.playCurrent();
  }

  /** DEC-013's Play Next: insert after the current track, do not interrupt. */
  async playNextItems(items: readonly QueueItemInput[]): Promise<void> {
    this.queue.playNext(items);
    // What comes next just changed, so whatever mpv has preloaded is wrong.
    await this.refreshPreload();
    this.publish();
  }

  /** DEC-013's Add to Queue: append, do not interrupt. */
  async addToQueue(items: readonly QueueItemInput[]): Promise<void> {
    const wasEmpty = this.queue.isEmpty;
    this.queue.append(items);
    if (wasEmpty && this.queue.current === null) {
      // Adding to an empty queue does not start playback; PLAYER-06 decides
      // whether a button does. But the first item is now "next", so mpv should
      // know about it if something is already running.
      this.publish();
      return;
    }
    await this.refreshPreload();
    this.publish();
  }

  private async playCurrent(): Promise<void> {
    const current = this.queue.current;
    if (!current) {
      await this.stop();
      return;
    }
    const entryId = await this.player.play(current.filePath);
    // `replace` cleared mpv's playlist, so every previous mapping is stale.
    this.entryToItem.clear();
    this.preloadedItemId = null;
    if (entryId !== null) this.entryToItem.set(entryId, current.id);
    await this.refreshPreload();
    this.publish();
  }

  /**
   * Make sure mpv has the right next track appended, and only that one.
   *
   * Called whenever "what comes next" changes: a new track started, the queue
   * was edited, shuffle or repeat changed. When the answer is already loaded
   * this does nothing, so ordinary playback appends each track exactly once.
   */
  private async refreshPreload(): Promise<void> {
    if (!this.player.isRunning) return;
    // Nothing is playing, so nothing "comes next". Without this, a queue that
    // has finished would still report its first track as upcoming — and
    // editing the queue afterwards would quietly hand mpv a track to play.
    if (this.queue.currentId === null) {
      this.preloadedItemId = null;
      return;
    }
    const upcoming = this.queue.peekNext();

    if (!upcoming) {
      // Nothing should follow. An entry already appended cannot be unappended
      // without disturbing playback, so it is left alone and simply not
      // followed — `onStartFile` re-checks the queue when mpv reaches it.
      this.preloadedItemId = null;
      return;
    }
    if (this.preloadedItemId === upcoming.id) return;

    const entryId = await this.player.enqueue(upcoming.filePath);
    if (entryId !== null) this.entryToItem.set(entryId, upcoming.id);
    this.preloadedItemId = upcoming.id;
  }

  // -------------------------------------------------------------------------
  // mpv moved on its own
  // -------------------------------------------------------------------------

  /**
   * mpv started a playlist entry.
   *
   * When it is an entry we preloaded, mpv advanced by itself and the queue has
   * to catch up — this is the gapless transition, observed after the fact.
   */
  private onStartFile(info: MpvStartFile): void {
    if (info.playlistEntryId === null) return;
    const itemId = this.entryToItem.get(info.playlistEntryId);
    if (!itemId || itemId === this.queue.currentId) return;

    this.queue.jumpToId(itemId);
    this.preloadedItemId = null;
    // Line up the one after this. Failures here must not break playback: mpv is
    // already playing, and a missing preload only costs the next gap.
    void this.refreshPreload().catch(() => undefined);
    this.publish();
  }

  /**
   * A file ended.
   *
   * A failure is recorded on the item so the queue panel can show it
   * (DEC-054); reporting it to the user is PLAYER-10's. When the queue has run
   * out, playback stops here rather than leaving a stale "playing" state.
   */
  private onEndFile(info: MpvEndFile): void {
    if (info.reason === "error") {
      const failedId = this.entryToItem.get(info.playlistEntryId ?? -1) ?? this.queue.currentId;
      if (failedId) this.queue.markFailed(failedId);
    }
    if (info.reason === "eof" && this.queue.peekNext() === null) {
      // The end of the queue. mpv will go idle by itself; the queue stays so
      // the panel still shows what was played.
      this.queue.next();
    }
    this.publish();
  }

  // -------------------------------------------------------------------------
  // Transport
  // -------------------------------------------------------------------------

  async next(): Promise<void> {
    const upcoming = this.queue.next();
    if (!upcoming) {
      await this.stop();
      return;
    }
    await this.playCurrent();
  }

  /**
   * Previous, or restart — the queue decides which (PLAYER-04's rule).
   */
  async previous(): Promise<void> {
    const position = this.player.getSnapshot().playback.positionSeconds;
    const result = this.queue.previous(position);
    if (result.action === "none") return;
    if (result.action === "restart") {
      await this.player.seek(0);
      this.publish();
      return;
    }
    await this.playCurrent();
  }

  async jumpTo(index: number): Promise<void> {
    if (!this.queue.jumpTo(index)) return;
    await this.playCurrent();
  }

  async jumpToId(id: string): Promise<void> {
    if (!this.queue.jumpToId(id)) return;
    await this.playCurrent();
  }

  // -------------------------------------------------------------------------
  // Editing while playing
  // -------------------------------------------------------------------------

  async removeFromQueue(id: string): Promise<void> {
    const { removed, nextToPlay } = this.queue.removeById(id);
    if (!removed) return;
    if (nextToPlay) {
      // The playing track was removed; the successor takes over immediately.
      await this.playCurrent();
      return;
    }
    if (this.queue.isEmpty) {
      await this.stop();
      return;
    }
    await this.refreshPreload();
    this.publish();
  }

  async moveInQueue(fromIndex: number, toIndex: number): Promise<void> {
    if (!this.queue.move(fromIndex, toIndex)) return;
    await this.refreshPreload();
    this.publish();
  }

  async clearQueue(): Promise<void> {
    this.queue.clear();
    await this.stop();
  }

  // -------------------------------------------------------------------------
  // Order (PLAYER-07's controls drive these)
  // -------------------------------------------------------------------------

  async setShuffle(on: boolean): Promise<void> {
    this.queue.setShuffle(on);
    await this.refreshPreload();
    this.publish();
  }

  async setRepeat(mode: RepeatMode): Promise<void> {
    this.queue.setRepeat(mode);
    await this.refreshPreload();
    this.publish();
  }

  // -------------------------------------------------------------------------
  // Pass-through transport
  // -------------------------------------------------------------------------

  async pause(): Promise<void> {
    await this.player.pause();
  }

  async resume(): Promise<void> {
    await this.player.resume();
  }

  async togglePause(): Promise<void> {
    await this.player.togglePause();
  }

  async seek(seconds: number): Promise<void> {
    await this.player.seek(seconds);
  }

  async setVolume(volume: number): Promise<void> {
    await this.player.setVolume(volume);
  }

  async setMuted(muted: boolean): Promise<void> {
    await this.player.setMuted(muted);
  }

  async stop(): Promise<void> {
    this.entryToItem.clear();
    this.preloadedItemId = null;
    await this.player.stopPlayback();
    this.publish();
  }

  /** For tests and diagnostics: what mpv has been told to play next. */
  get preloaded(): QueueItem | null {
    return this.preloadedItemId ? this.queue.itemById(this.preloadedItemId) : null;
  }
}
