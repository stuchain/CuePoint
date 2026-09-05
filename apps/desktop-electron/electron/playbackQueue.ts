/**
 * The playback queue (PLAYER-04, DEC-050).
 *
 * A pure model: no mpv, no process, no Electron, no I/O. It answers "what is
 * queued, what is playing, and what plays next" and nothing else, so every rule
 * below can be tested directly instead of through a socket.
 *
 * **The current track is tracked by identity, never by index.** That is the
 * whole design. An index stored and patched on every mutation is where this
 * kind of model always breaks: remove the row above the playing one and the
 * index silently points at its neighbour, so the wrong track is "playing" and
 * the next advance skips one. Holding the id and deriving the index makes that
 * class of bug unrepresentable — the index follows the track, because it *is*
 * a function of the track.
 *
 * **Nothing here is persisted.** DEC-014 says CuePoint does not restore
 * playback position, and DEC-050 keeps the queue in main memory; quitting is
 * meant to lose the queue. There is deliberately no serialization anywhere in
 * this file.
 */

export type RepeatMode = "off" | "one" | "all";

export type QueueItemStatus = "pending" | "playing" | "failed";

export interface QueueItem {
  /** Unique within a queue. The same track can appear twice with two ids. */
  id: string;
  trackId: number | null;
  filePath: string;
  title: string;
  artist: string;
  /** What the player bar and the queue panel show for a DJ (PLAYER-06). */
  key: string | null;
  bpm: number | null;
  durationSeconds: number | null;
  status: QueueItemStatus;
}

/** What a caller supplies; the queue assigns ids and status. */
export interface QueueItemInput {
  trackId?: number | null;
  filePath: string;
  title?: string;
  artist?: string;
  key?: string | null;
  bpm?: number | null;
  durationSeconds?: number | null;
}

/**
 * How far into a track "previous" stops meaning "the previous track".
 *
 * The convention every player shares: pressing previous a few seconds in
 * restarts what is playing, because that is what someone who just missed the
 * intro means. Stated here so it is a decision rather than a magic number
 * rediscovered in review.
 */
export const PREVIOUS_RESTART_THRESHOLD_SECONDS = 3;

export interface PlaybackQueueOptions {
  /** Injected so shuffled order is deterministic in tests. */
  random?: () => number;
}

export interface QueueSnapshot {
  /** In view order — what the queue panel shows (PLAYER-08). */
  items: readonly QueueItem[];
  /** In play order, which differs from view order while shuffled. */
  playOrder: readonly string[];
  currentId: string | null;
  /** Position within `playOrder`, or -1. */
  currentIndex: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

let idCounter = 0;

function makeItem(input: QueueItemInput): QueueItem {
  idCounter += 1;
  return {
    id: `q${idCounter}`,
    trackId: input.trackId ?? null,
    filePath: input.filePath,
    title: input.title ?? "",
    artist: input.artist ?? "",
    key: input.key ?? null,
    bpm: input.bpm ?? null,
    durationSeconds: input.durationSeconds ?? null,
    status: "pending",
  };
}

export class PlaybackQueue {
  /** View order: what the user sees and reorders (PLAYER-08). */
  private items: QueueItem[] = [];
  /** Play order, as ids. Equal to view order unless shuffled. */
  private order: string[] = [];
  private currentIdValue: string | null = null;
  private shuffleOn = false;
  private repeatMode: RepeatMode = "off";
  private readonly random: () => number;

  constructor(options: PlaybackQueueOptions = {}) {
    this.random = options.random ?? Math.random;
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  get length(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  get currentId(): string | null {
    return this.currentIdValue;
  }

  get current(): QueueItem | null {
    return this.items.find((item) => item.id === this.currentIdValue) ?? null;
  }

  /** Where the playing track sits in play order, or -1 when nothing plays. */
  get currentIndex(): number {
    if (this.currentIdValue === null) return -1;
    return this.order.indexOf(this.currentIdValue);
  }

  get shuffle(): boolean {
    return this.shuffleOn;
  }

  get repeat(): RepeatMode {
    return this.repeatMode;
  }

  snapshot(): QueueSnapshot {
    return {
      items: this.items.map((item) => ({ ...item })),
      playOrder: [...this.order],
      currentId: this.currentIdValue,
      currentIndex: this.currentIndex,
      shuffle: this.shuffleOn,
      repeat: this.repeatMode,
    };
  }

  itemById(id: string): QueueItem | null {
    return this.items.find((item) => item.id === id) ?? null;
  }

  // -------------------------------------------------------------------------
  // Building the queue
  // -------------------------------------------------------------------------

  /**
   * Replace everything, which is what playing a track does (DEC-012, DEC-013).
   *
   * `startIndex` is an index into the supplied list — the row the user
   * double-clicked — not into play order, which does not exist yet.
   */
  replace(inputs: readonly QueueItemInput[], startIndex = 0): QueueItem | null {
    this.items = inputs.map(makeItem);
    this.order = this.items.map((item) => item.id);
    const start = this.items[startIndex] ?? this.items[0] ?? null;
    this.currentIdValue = start?.id ?? null;
    if (this.shuffleOn) this.reshuffle();
    if (start) start.status = "playing";
    return start;
  }

  /** DEC-013's "Play Next": insert directly after what is playing. */
  playNext(inputs: readonly QueueItemInput[]): QueueItem[] {
    const added = inputs.map(makeItem);
    if (added.length === 0) return [];

    const currentViewIndex = this.items.findIndex((item) => item.id === this.currentIdValue);
    const insertAt = currentViewIndex === -1 ? 0 : currentViewIndex + 1;
    this.items.splice(insertAt, 0, ...added);

    const orderIndex = this.currentIndex === -1 ? 0 : this.currentIndex + 1;
    this.order.splice(orderIndex, 0, ...added.map((item) => item.id));
    return added;
  }

  /** DEC-013's "Add to Queue": append to the end. */
  append(inputs: readonly QueueItemInput[]): QueueItem[] {
    const added = inputs.map(makeItem);
    this.items.push(...added);
    this.order.push(...added.map((item) => item.id));
    return added;
  }

  clear(): void {
    this.items = [];
    this.order = [];
    this.currentIdValue = null;
  }

  // -------------------------------------------------------------------------
  // Editing the queue (PLAYER-08 drives these)
  // -------------------------------------------------------------------------

  /**
   * Remove one item by id.
   *
   * Returns the item that should play now: `null` when nothing changed, and
   * the next item when the *playing* one was removed. Removing anything else
   * leaves playback alone — including removing a row above it, which must not
   * make a different track "current".
   */
  removeById(id: string): { removed: QueueItem | null; nextToPlay: QueueItem | null } {
    const viewIndex = this.items.findIndex((item) => item.id === id);
    if (viewIndex === -1) return { removed: null, nextToPlay: null };

    const wasCurrent = id === this.currentIdValue;
    const successor = wasCurrent ? this.peekNext() : null;

    const [removed] = this.items.splice(viewIndex, 1);
    const orderIndex = this.order.indexOf(id);
    if (orderIndex !== -1) this.order.splice(orderIndex, 1);

    if (!wasCurrent) return { removed, nextToPlay: null };

    // The playing item is gone: hand back whatever should take over. A
    // successor that was itself the removed item (repeat-one) means stopping.
    const next = successor && successor.id !== id ? successor : null;
    this.currentIdValue = next?.id ?? null;
    if (next) next.status = "playing";
    return { removed, nextToPlay: next };
  }

  /** Reorder in *view* order; play order follows when not shuffled. */
  move(fromIndex: number, toIndex: number): boolean {
    if (
      fromIndex < 0 ||
      fromIndex >= this.items.length ||
      toIndex < 0 ||
      toIndex >= this.items.length ||
      fromIndex === toIndex
    ) {
      return false;
    }
    const [moved] = this.items.splice(fromIndex, 1);
    this.items.splice(toIndex, 0, moved);
    if (!this.shuffleOn) {
      // Play order mirrors view order exactly while unshuffled; rebuilding it
      // keeps the two from drifting apart.
      this.order = this.items.map((item) => item.id);
    }
    return true;
  }

  markFailed(id: string): void {
    const item = this.itemById(id);
    if (item) item.status = "failed";
  }

  // -------------------------------------------------------------------------
  // Moving through the queue
  // -------------------------------------------------------------------------

  /** Play a specific item, by its position in *play* order. */
  jumpTo(index: number): QueueItem | null {
    const id = this.order[index];
    if (id === undefined) return null;
    return this.setCurrent(id);
  }

  jumpToId(id: string): QueueItem | null {
    if (!this.itemById(id)) return null;
    return this.setCurrent(id);
  }

  /**
   * What plays after the current track, without changing anything.
   *
   * Repeat-one answers with the current track, which is what makes a preloaded
   * gapless repeat possible.
   */
  peekNext(): QueueItem | null {
    if (this.isEmpty) return null;
    if (this.repeatMode === "one") return this.current;

    const index = this.currentIndex;
    if (index === -1) return this.itemById(this.order[0] ?? "");

    const nextId = this.order[index + 1];
    if (nextId !== undefined) return this.itemById(nextId);
    return this.repeatMode === "all" ? this.itemById(this.order[0] ?? "") : null;
  }

  /** Advance. Returns the new current item, or null at the end of the queue. */
  next(): QueueItem | null {
    const upcoming = this.peekNext();
    if (!upcoming) {
      // End of the queue: stop, but keep the queue so the panel still shows it.
      // The outgoing track stops being "playing" — leaving that status behind
      // meant a finished queue reported a playing item and no current index at
      // the same time, which the panel would draw as a track still going.
      const outgoing = this.current;
      if (outgoing && outgoing.status === "playing") outgoing.status = "pending";
      this.currentIdValue = null;
      return null;
    }
    return this.setCurrent(upcoming.id);
  }

  /**
   * Previous, with the convention every player shares.
   *
   * Past the threshold this restarts the current track rather than going back,
   * because that is what someone who just missed the intro means.
   */
  previous(positionSeconds: number | null): { action: "restart" | "changed" | "none"; item: QueueItem | null } {
    if (this.isEmpty || this.currentIdValue === null) {
      return { action: "none", item: null };
    }
    if ((positionSeconds ?? 0) > PREVIOUS_RESTART_THRESHOLD_SECONDS) {
      return { action: "restart", item: this.current };
    }

    const index = this.currentIndex;
    const previousId = index > 0 ? this.order[index - 1] : undefined;
    if (previousId === undefined) {
      // Already at the start: restart rather than doing nothing, which is what
      // pressing the button visibly does in every other player.
      return { action: "restart", item: this.current };
    }
    return { action: "changed", item: this.setCurrent(previousId) };
  }

  private setCurrent(id: string): QueueItem | null {
    const item = this.itemById(id);
    if (!item) return null;
    const previous = this.current;
    if (previous && previous.status === "playing") previous.status = "pending";
    this.currentIdValue = id;
    if (item.status !== "failed") item.status = "playing";
    return item;
  }

  // -------------------------------------------------------------------------
  // Order rules (PLAYER-07 supplies the controls)
  // -------------------------------------------------------------------------

  setRepeat(mode: RepeatMode): void {
    this.repeatMode = mode;
  }

  /**
   * Shuffle reorders the *queue*, never the view the queue came from (DEC-052).
   *
   * Turning it on keeps the current track current and shuffles what follows;
   * turning it off restores the queue's own order with the same track still
   * playing. Nothing here touches `items`, which is why the table the queue was
   * built from is unaffected.
   */
  setShuffle(on: boolean): void {
    if (on === this.shuffleOn) return;
    this.shuffleOn = on;
    if (on) {
      this.reshuffle();
    } else {
      this.order = this.items.map((item) => item.id);
    }
  }

  private reshuffle(): void {
    const rest = this.items.map((item) => item.id).filter((id) => id !== this.currentIdValue);
    // Fisher-Yates, with an injectable source so tests are deterministic.
    for (let i = rest.length - 1; i > 0; i -= 1) {
      const j = Math.floor(this.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.order = this.currentIdValue ? [this.currentIdValue, ...rest] : rest;
  }
}
