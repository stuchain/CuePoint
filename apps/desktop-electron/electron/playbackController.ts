import type { MpvEndFile, MpvStartFile } from "./mpvClient";
import {
  FailureReporter,
  type FailureReport,
  type PlayerNotice,
} from "./playbackFailures";
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
  /** How long failures are coalesced before being reported (PLAYER-10). */
  failureWindowMs?: number;
}

export interface PlaybackControllerSnapshot extends PlayerSnapshot {
  queue: QueueSnapshot;
}

export type ControllerListener = (snapshot: PlaybackControllerSnapshot) => void;
export type NoticeListener = (notice: PlayerNotice) => void;

export class PlaybackController {
  private readonly queue: PlaybackQueue;
  private readonly listeners = new Set<ControllerListener>();
  private readonly unsubscribes: Array<() => void> = [];

  /** mpv playlist entry id -> queue item id. */
  private entryToItem = new Map<number, string>();
  /** The queue item currently preloaded into mpv, if any. */
  private preloadedItemId: string | null = null;

  /** Coalesces failures into one message per run (PLAYER-10, DEC-054). */
  private readonly failures: FailureReporter;
  private readonly noticeListeners = new Set<NoticeListener>();
  private noticeSequence = 0;

  /**
   * The item that just failed and has not been answered yet.
   *
   * mpv normally walks past a broken file into the entry preloaded behind it,
   * and then this is cleared by `start-file`. When it does not — nothing was
   * preloaded, or the append lost the race with the failure — mpv goes idle
   * instead, and this is what tells `onPlayerIdle` that the silence is a
   * stalled queue rather than a player that was idle anyway.
   */
  private failedAwaitingAdvance: string | null = null;

  /**
   * Bumped by every deliberate load.
   *
   * `loadfile … replace` clears mpv's playlist, so an append that was already
   * in flight when it happened describes a playlist that no longer exists.
   * Recording its entry id would leave a mapping that makes mpv look like it
   * advanced to a track nobody queued.
   */
  private generation = 0;

  constructor(
    private readonly player: PlayerSupervisor,
    options: PlaybackControllerOptions = {},
  ) {
    this.queue = options.queue ?? new PlaybackQueue({ random: options.random });
    this.failures = new FailureReporter({
      windowMs: options.failureWindowMs,
      onReport: (report) => this.onFailureReport(report),
    });

    this.unsubscribes.push(
      this.player.onSnapshot(() => this.publish()),
      this.player.onStartFile((info) => this.onStartFile(info)),
      this.player.onEndFile((info) => this.onEndFile(info)),
      this.player.onIdle(() => this.onPlayerIdle()),
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

  /**
   * Subscribe to things the user should be told once (PLAYER-10).
   *
   * Separate from the snapshot stream on purpose: a snapshot is state, and a
   * subscriber that arrives late is entitled to all of it. A notice is an
   * event — replaying it would put a toast about a track that failed ten
   * minutes ago in front of someone who just opened a window.
   */
  onNotice(listener: NoticeListener): () => void {
    this.noticeListeners.add(listener);
    return () => this.noticeListeners.delete(listener);
  }

  private emitNotice(notice: Omit<PlayerNotice, "id">): void {
    this.noticeSequence += 1;
    const full: PlayerNotice = { ...notice, id: this.noticeSequence };
    for (const listener of this.noticeListeners) listener(full);
  }

  private onFailureReport(report: FailureReport): void {
    this.emitNotice({
      kind: "track-failed",
      message: report.message,
      count: report.count,
      stopped: report.stopped,
    });
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribes.splice(0)) unsubscribe();
    this.listeners.clear();
    this.noticeListeners.clear();
    this.failures.dispose();
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
    // An item with no path cannot be handed to mpv at all, so it fails here
    // rather than there (PLAYER-10). A loop rather than recursion: a queue of
    // fifty thousand such items would otherwise be fifty thousand stack frames.
    let current = this.queue.current;
    while (current && current.filePath.trim() === "") {
      this.queue.markFailed(current.id);
      this.failures.record({ title: current.title, reason: "no file path" });
      const upcoming = this.stillWorthTrying() ? this.queue.next() : null;
      if (!upcoming) {
        await this.stop();
        this.failures.stopped();
        return;
      }
      current = this.queue.current;
    }
    if (!current) {
      await this.stop();
      return;
    }

    const generation = ++this.generation;
    this.failedAwaitingAdvance = null;
    const entryId = await this.player.play(current.filePath);
    // A newer load happened while this one was in flight; that one owns mpv.
    if (generation !== this.generation) return;
    // `replace` cleared mpv's playlist, so every previous mapping is stale.
    this.entryToItem.clear();
    this.preloadedItemId = null;
    if (entryId !== null) this.entryToItem.set(entryId, current.id);
    await this.refreshPreload(generation);
    this.publish();
  }

  /**
   * Whether it is still worth handing mpv another track.
   *
   * A disconnected drive fails every track in the queue, and mpv fails a file
   * it cannot open far faster than it plays one — so without this a 5,000-track
   * queue would be walked in a couple of seconds, and a repeating one would be
   * walked forever. Once the current run of failures covers the whole queue,
   * everything has been tried and playback stops (DEC-054).
   */
  private stillWorthTrying(): boolean {
    if (this.queue.length === 0) return false;
    return this.failures.pending < this.queue.length;
  }

  /**
   * Make sure mpv has the right next track appended, and only that one.
   *
   * Called whenever "what comes next" changes: a new track started, the queue
   * was edited, shuffle or repeat changed. When the answer is already loaded
   * this does nothing, so ordinary playback appends each track exactly once.
   */
  private async refreshPreload(generation = this.generation): Promise<void> {
    if (!this.player.isRunning) return;
    // Everything in the queue has failed. Feeding mpv another entry is what
    // "spinning through the queue at speed" looks like; letting it run dry is
    // what makes it stop, and `onPlayerIdle` says so once.
    if (!this.stillWorthTrying()) {
      this.preloadedItemId = null;
      return;
    }
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
    // A `replace` happened while this append was in flight: mpv's playlist is
    // not the one this entry id belongs to any more.
    if (generation !== this.generation) return;
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
    // mpv answered the failure by walking into the next entry itself, so the
    // stall handler has nothing to do.
    this.failedAwaitingAdvance = null;
    // Line up the one after this. Failures here must not break playback: mpv is
    // already playing, and a missing preload only costs the next gap.
    void this.refreshPreload().catch(() => undefined);
    this.publish();
  }

  /**
   * A file ended.
   *
   * A failure is marked on the item so the queue panel keeps showing it after
   * the toast is gone, counted so a run of them produces one message rather
   * than hundreds (DEC-054), and remembered so a queue that stalls because of
   * it can be restarted. When the queue has run out, playback stops here
   * rather than leaving a stale "playing" state.
   */
  private onEndFile(info: MpvEndFile): void {
    if (info.reason === "error") {
      const failedId = this.entryToItem.get(info.playlistEntryId ?? -1) ?? this.queue.currentId;
      if (failedId) {
        const item = this.queue.itemById(failedId);
        this.queue.markFailed(failedId);
        this.failures.record({ title: item?.title ?? "", reason: info.error ?? null });
        this.failedAwaitingAdvance = failedId;
        // mpv may have said it was idle *before* sending this. `idle-active`
        // only fires on change, so no second event is coming to prompt the
        // recovery — the level has to be read here instead.
        if (this.player.isIdle) this.onPlayerIdle();
      }
      this.publish();
      return;
    }
    if (info.reason === "eof" && this.queue.peekNext() === null) {
      // The end of the queue. mpv will go idle by itself; the queue stays so
      // the panel still shows what was played.
      this.queue.next();
    }
    this.publish();
  }

  /**
   * mpv ran out of things to play (PLAYER-10).
   *
   * Only interesting when a failure is outstanding. mpv goes idle for plenty
   * of innocent reasons — it is idle before the first track of the session, and
   * again after the queue ends or playback is stopped — and taking any of those
   * as a cue to start playing would be an app that plays music nobody asked
   * for. A failure with no answer from mpv is the one case where the silence
   * means something is stuck.
   */
  private onPlayerIdle(): void {
    const failedId = this.failedAwaitingAdvance;
    if (failedId === null) return;
    this.failedAwaitingAdvance = null;
    // mpv did move on after all, and this idle is about something else.
    if (failedId !== this.queue.currentId) return;
    void this.advanceAfterFailure();
  }

  private async advanceAfterFailure(): Promise<void> {
    try {
      const upcoming = this.stillWorthTrying() ? this.queue.next() : null;
      if (!upcoming) {
        await this.stop();
        // Now, not when the coalescing window closes: the message has to
        // arrive with the silence it is explaining.
        this.failures.stopped();
        return;
      }
      await this.playCurrent();
    } catch (error) {
      // The player itself is gone, which is a different thing from a file that
      // will not play and gets said differently (PLAYER-03's risk note).
      await this.stop().catch(() => undefined);
      this.failures.flush();
      this.emitNotice({
        kind: "player-unavailable",
        message: (error as Error).message,
        count: 0,
        stopped: true,
      });
    }
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
    this.failedAwaitingAdvance = null;
    await this.player.stopPlayback();
    this.publish();
  }

  /** For tests and diagnostics: what mpv has been told to play next. */
  get preloaded(): QueueItem | null {
    return this.preloadedItemId ? this.queue.itemById(this.preloadedItemId) : null;
  }
}
