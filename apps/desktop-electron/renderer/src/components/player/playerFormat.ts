import type {
  AudioState,
  PlayerSnapshot,
  QueueItem,
  RepeatMode,
} from "../../api/cuepointBridge.types";
import { formatBpm } from "../format/bpm";
import { formatLength } from "../../format/durations";
import { camelotOf } from "../wheel/keyColour";

/**
 * Formatting and selectors for the player bar (PLAYER-06).
 *
 * Pure functions, kept out of the component so the rules that decide what the
 * bar *says* can be tested without rendering anything — the pattern
 * `libraryFormat.ts` already set for the Library page.
 */

/**
 * Seconds as `m:ss`, or `h:mm:ss` past an hour: the app's one length format (C73), so the bar,
 * the queue and the tables read alike. Unknown is the missing-value dash, not `0:00`.
 */
export const formatTime = formatLength;

/** The shared BPM format, re-exported so the player's importers stay put. */
export { formatBpm };

/** The facts under a title, each already written for the line (a missing one is an empty string). */
export interface TrackFacts {
  artist: string;
  label: string;
  /** The Camelot code ("8A"), also for a classic spelling ("Am"); text that is not a key is kept as it came. */
  key: string;
  /** "128.0 BPM". */
  bpm: string;
  year: string;
}

/**
 * The track's facts in the one order used everywhere: artist, label, key, BPM, year. A key is
 * always its Camelot code, never the raw classic spelling.
 */
export function trackFacts(item: QueueItem | null): TrackFacts {
  if (!item) return { artist: "", label: "", key: "", bpm: "", year: "" };
  const bpm = formatBpm(item.bpm);
  const key = (item.key ?? "").trim();
  return {
    artist: (item.artist ?? "").trim(),
    label: (item.label ?? "").trim(),
    key: camelotOf(key) ?? key,
    bpm: bpm ? `${bpm} BPM` : "",
    year: item.year ? String(item.year) : "",
  };
}

/**
 * The line under the title: artist · label · key · BPM · year, skipping what is missing.
 *
 * Joined here rather than in JSX so the separators cannot end up stranded
 * around a missing value — "— · 128.0" for a track with no artist.
 */
export function formatTrackMeta(item: QueueItem | null): string {
  const facts = trackFacts(item);
  return [facts.artist, facts.label, facts.key, facts.bpm, facts.year].filter(Boolean).join(" · ");
}

/** The key the player bar shows for a queue item: its Camelot key, or null (BAR-5). */
export function playingKey(item: QueueItem | null): string | null {
  const key = item?.key?.trim();
  return key ? key : null;
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

/** True while a track is loaded and paused: a start that is only waiting is neither this nor playing. */
export function selectPaused(state: PlayerSnapshot | null): boolean {
  return state?.playback.paused === true;
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

/**
 * The audio output before main has said anything (PLAYER-11).
 *
 * Every field the safe answer — the system default, shared, and exclusive
 * output assumed unsupported — so a panel rendered before the first snapshot
 * arrives shows a control that is disabled rather than one claiming a
 * capability the machine may not have.
 */
export const EMPTY_AUDIO_STATE: AudioState = {
  device: "auto",
  exclusive: false,
  activeDevice: "auto",
  activeExclusive: false,
  exclusiveSupported: false,
};

/** The audio output, for the settings panel. */
export function selectAudio(snapshot: PlayerSnapshot | null): AudioState {
  return snapshot?.audio ?? EMPTY_AUDIO_STATE;
}

/**
 * Whether what is playing differs from what was asked for (PLAYER-11).
 *
 * The settings panel says so out loud: a toggle reading "on" while the audio
 * is going out shared is the lie DEC-055 exists to prevent.
 */
export function audioFellBack(audio: AudioState): boolean {
  return audio.device !== audio.activeDevice || audio.exclusive !== audio.activeExclusive;
}
