import type { PlayerSnapshot, QueueItem, RepeatMode } from "../../api/cuepointBridge.types";

/**
 * Formatting and selectors for the player bar (PLAYER-06).
 *
 * Pure functions, kept out of the component so the rules that decide what the
 * bar *says* can be tested without rendering anything — the pattern
 * `libraryFormat.ts` already set for the Library page.
 */

/**
 * Seconds as `m:ss`, or `h:mm:ss` past an hour.
 *
 * A dash for anything unknown rather than `0:00`: a track whose duration has
 * not arrived yet has not got a duration of zero, and showing one makes the
 * position bar look full at the start of every track.
 */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "–:––";
  }
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  const paddedSeconds = String(secs).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  }
  return `${minutes}:${paddedSeconds}`;
}

/** BPM with one decimal, the way Rekordbox writes it. Empty when unknown. */
export function formatBpm(bpm: number | null | undefined): string {
  if (bpm === null || bpm === undefined || !Number.isFinite(bpm) || bpm <= 0) return "";
  return bpm.toFixed(1);
}

/**
 * The line under the title: artist, then key and BPM when they are known.
 *
 * Joined here rather than in JSX so the separators cannot end up stranded
 * around a missing value — "— · 128.0" for a track with no artist.
 */
export function formatTrackMeta(item: QueueItem | null): string {
  if (!item) return "";
  const bpm = formatBpm(item.bpm);
  return [item.artist, item.key ?? "", bpm ? `${bpm} BPM` : ""]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ");
}

/** How far through the track, 0–1. Zero when either end is unknown. */
export function progressFraction(
  positionSeconds: number | null,
  durationSeconds: number | null,
): number {
  if (!positionSeconds || !durationSeconds || durationSeconds <= 0) return 0;
  return Math.max(0, Math.min(1, positionSeconds / durationSeconds));
}

// ---------------------------------------------------------------------------
// Selectors — stable module-level functions, as `usePlayerValue` requires
// ---------------------------------------------------------------------------

/**
 * The track that is playing, or null.
 *
 * Read straight off the snapshot: the queue's contents are no longer pushed
 * (PLAYER-08), and the one entry the bar has to name is carried on its own.
 */
export function selectCurrentItem(state: PlayerSnapshot | null): QueueItem | null {
  return state?.queue.currentItem ?? null;
}

/** Two queue items are the same for display purposes when they are the same entry. */
export function sameItem(a: QueueItem | null, b: QueueItem | null): boolean {
  return a?.id === b?.id;
}

export function selectPaused(state: PlayerSnapshot | null): boolean {
  return state?.playback.paused ?? false;
}

/**
 * Is a track actually playing?
 *
 * The transport button asks this rather than `paused`, because idle is not
 * paused: with nothing loaded, `paused` is false, and a button derived from it
 * would offer to *pause* a player that is not playing anything.
 */
export function selectPlaying(state: PlayerSnapshot | null): boolean {
  return state?.playback.playing === true && state?.playback.paused !== true;
}

export function selectPosition(state: PlayerSnapshot | null): number | null {
  return state?.playback.positionSeconds ?? null;
}

export function selectDuration(state: PlayerSnapshot | null): number | null {
  return state?.playback.durationSeconds ?? null;
}

export function selectVolume(state: PlayerSnapshot | null): number {
  return state?.playback.volume ?? 100;
}

export function selectMuted(state: PlayerSnapshot | null): boolean {
  return state?.playback.muted ?? false;
}

/** Order settings live on the queue, which is where DEC-050 keeps them. */
export function selectShuffle(state: PlayerSnapshot | null): boolean {
  return state?.queue.shuffle ?? false;
}

export function selectRepeat(state: PlayerSnapshot | null): RepeatMode {
  return state?.queue.repeat ?? "off";
}

/**
 * Has anything played this session?
 *
 * DEC-053 hangs on this: the bar appears at the first play and stays for the
 * rest of the session, so what matters is that a track was *ever* loaded, not
 * whether one is playing now. Ending a queue must not retract the bar.
 */
export function selectHasPlayed(state: PlayerSnapshot | null): boolean {
  if (!state) return false;
  return state.playback.filePath !== null || state.queue.length > 0;
}

/** How many tracks are queued, for the panel's button and its empty state. */
export function selectQueueLength(state: PlayerSnapshot | null): number {
  return state?.queue.length ?? 0;
}

/**
 * A value that changes whenever the queue's contents might have.
 *
 * The panel holds a window rather than the whole queue, so it cannot diff the
 * items itself. This is what tells it to re-read: the length, what is playing,
 * and the ordering that produced it.
 */
export function selectQueueRevision(state: PlayerSnapshot | null): string | null {
  // Null, not a sentinel string: "no state has arrived yet" is a different
  // thing from "the queue is empty", and a panel must not ask for a window
  // before it knows there is a queue to window.
  if (!state) return null;
  const { length, currentId, shuffle, repeat } = state.queue;
  return `${length}:${currentId ?? "-"}:${shuffle ? "s" : "-"}:${repeat}`;
}
