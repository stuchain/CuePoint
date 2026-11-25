/**
 * What the crowd does, from the readings (pure; the scene owns the clock and calls this each frame).
 *
 * Energy is the RMS level within `RANGE_DB` below the track's reference, its loudest level so far
 * (held for 30 s, then falling 0.5 dB a second, never under `MIN_REF_DB`), smoothed with a fast
 * attack and a slow release because the readings are sparse (as few as 9 a second). A fixed range
 * below a long reference keeps a breakdown (16 dB down) swaying however long it lasts, and the
 * floor on the reference keeps a steady quiet or ambient track from always counting as "full": it
 * bobs at most. Loud passages jump, a kick bobs, a quiet part sways; a sudden drop to near silence
 * freezes the crowd for one beat and it cheers when the music returns; a new track gets a cheer; a
 * clip makes the front row cover their ears for one beat. Beat-long holds are in milliseconds
 * (`beatMs`), so seeking never stretches them; a position jump clears them. Nothing here strobes.
 *
 * `stepCrowd` updates the state it is given in place and returns it (it runs every frame).
 */
import { LEVELS_STALE_MS } from "./crowdFallback";

/** Energy is 0 at this far below the reference and 1 at the reference (dB). */
export const RANGE_DB = 20;
/**
 * The reference is never taken to be quieter than this (dB), so a track that is quiet from the start
 * is not stretched to look full-scale. A track whose own loudest is above it keeps its own.
 */
export const MIN_REF_DB = -20;
/** The reference is held this long after its last new maximum, then falls (ms). */
export const REF_HOLD_MS = 30_000;
export const REF_FALL_DB_PER_S = 0.5;
export const ATTACK_MS = 50;
export const RELEASE_MS = 400;
export const CHEER_MS = 1500;
export const CLIP_NOTE_MS = 2000;
export const CLIP_REPEAT_MS = 10_000;
export const CLIP_DB = -0.1;
/** A position this far from where the clock expected it is a seek (s). */
export const SEEK_JUMP_S = 2;
const SWAY_BELOW = 0.3;
const JUMP_ABOVE = 0.75;
const NEAR_SILENCE = 0.05;
/** Only a level this low is silence for a drop; a breakdown is not (dB). */
const SILENCE_DB = -50;
const LOUD_MEMORY_MS = 1500;
const DEFAULT_BEAT_MS = 500;

export type CrowdMove = "idle" | "sway" | "bob" | "jump";

export interface LevelReading {
  /** When it arrived (ms, the same clock as `now`). */
  t: number;
  rmsDb: number;
  peakDb: number;
}

export interface CrowdInput {
  /** Readings that arrived since the last step. */
  readings: readonly LevelReading[];
  /** One beat at the track's tempo (ms); 500 when unknown. */
  beatMs?: number;
  /** Where the player is (s), to notice a seek. */
  positionSec?: number | null;
  isPlaying: boolean;
  /** A new track has just started playing. */
  trackChanged: boolean;
  now: number;
  /** 0..1 from the waveform, used while no live reading is fresh. */
  fallbackEnergy?: number | null;
}

export interface CrowdOutput {
  energy: number;
  move: CrowdMove;
  cheer: boolean;
  freeze: boolean;
  clip: boolean;
  clipNote: boolean;
}

export interface CrowdState {
  /** The track's loudest level so far (dB) and when it was heard. */
  refDb: number;
  refAt: number;
  energy: number;
  target: number;
  lastReadingAt: number | null;
  lastRmsDb: number;
  lastNow: number | null;
  lastPos: number | null;
  lastPlaying: boolean;
  lastLoudAt: number | null;
  dropped: boolean;
  freezeUntil: number;
  cheerUntil: number;
  earsUntil: number;
  noteUntil: number;
  lastClipAt: number | null;
}

export function createCrowdState(): CrowdState {
  return {
    refDb: -Infinity,
    refAt: 0,
    energy: 0,
    target: 0,
    lastReadingAt: null,
    lastRmsDb: 0,
    lastNow: null,
    lastPos: null,
    lastPlaying: false,
    lastLoudAt: null,
    dropped: false,
    freezeUntil: -Infinity,
    cheerUntil: -Infinity,
    earsUntil: -Infinity,
    noteUntil: -Infinity,
    lastClipAt: null,
  };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function moveForEnergy(energy: number): CrowdMove {
  if (energy < SWAY_BELOW) return "sway";
  return energy > JUMP_ABOVE ? "jump" : "bob";
}

/** The loudest so far at `now`: held, then falling. */
function decayedRef(s: CrowdState, now: number): number {
  return s.refDb - Math.max(0, (now - s.refAt - REF_HOLD_MS) / 1000) * REF_FALL_DB_PER_S;
}

/** The reference at `now`, never under the floor. */
function referenceAt(s: CrowdState, now: number): number {
  return Math.max(MIN_REF_DB, decayedRef(s, now));
}

function clearHolds(s: CrowdState): void {
  s.freezeUntil = -Infinity;
  s.earsUntil = -Infinity;
  s.dropped = false;
  s.lastLoudAt = null;
}

export function stepCrowd(s: CrowdState, input: CrowdInput): { state: CrowdState; output: CrowdOutput } {
  const { now, readings } = input;
  const beatMs = input.beatMs && input.beatMs > 0 ? input.beatMs : DEFAULT_BEAT_MS;

  if (input.trackChanged) {
    Object.assign(s, createCrowdState(), { cheerUntil: now + CHEER_MS, lastNow: now });
  }

  // A seek, either way, ends what was held for "one beat" and the loud passage it came from.
  const position = input.positionSec ?? null;
  if (position !== null && s.lastPos !== null && s.lastNow !== null) {
    const expected = s.lastPos + (s.lastPlaying ? (now - s.lastNow) / 1000 : 0);
    if (Math.abs(position - expected) > SEEK_JUMP_S) clearHolds(s);
  }
  s.lastPos = position;

  if (readings.length > 0) {
    const last = readings[readings.length - 1];
    // A reading at or over the (fallen) reference is a new maximum and restarts its hold.
    const fallen = decayedRef(s, now);
    for (const r of readings) {
      if (r.rmsDb >= fallen) {
        s.refDb = r.rmsDb;
        s.refAt = now;
      }
    }
    const top = referenceAt(s, now);
    s.target = clamp01((last.rmsDb - (top - RANGE_DB)) / RANGE_DB);
    s.lastReadingAt = last.t;
    s.lastRmsDb = last.rmsDb;
    if (readings.some((r) => r.peakDb >= CLIP_DB)) {
      if (s.lastClipAt === null || now - s.lastClipAt >= CLIP_REPEAT_MS) s.earsUntil = now + beatMs;
      s.lastClipAt = now;
      s.noteUntil = now + CLIP_NOTE_MS;
    }
  } else if (s.lastReadingAt === null || now - s.lastReadingAt > LEVELS_STALE_MS) {
    // Past a second without a reading the last one no longer stands for the music: the waveform
    // does, or silence when there is none.
    s.target = input.fallbackEnergy != null ? clamp01(input.fallbackEnergy) : 0;
  }
  const fresh = s.lastReadingAt !== null && now - s.lastReadingAt <= LEVELS_STALE_MS;

  if (!input.isPlaying) {
    // Pausing forgets the loud part and the meter: resuming must not read the gap as a drop.
    s.energy = 0;
    s.target = 0;
    s.lastLoudAt = null;
    s.lastReadingAt = null;
    s.dropped = false;
    s.lastNow = now;
    s.lastPlaying = false;
    return {
      state: s,
      output: { energy: 0, move: "idle", cheer: false, freeze: false, clip: false, clipNote: now < s.noteUntil },
    };
  }

  // Smooth towards the target: attack when rising, release when falling.
  const dt = s.lastNow === null ? 16 : Math.min(250, Math.max(0, now - s.lastNow));
  const tau = s.target > s.energy ? ATTACK_MS : RELEASE_MS;
  s.energy = clamp01(s.energy + (s.target - s.energy) * (1 - Math.exp(-dt / tau)));
  s.lastNow = now;
  s.lastPlaying = true;

  if (s.energy > JUMP_ABOVE) s.lastLoudAt = now;

  if (!s.dropped && fresh && s.lastRmsDb <= SILENCE_DB && s.target < NEAR_SILENCE && s.lastLoudAt !== null && now - s.lastLoudAt <= LOUD_MEMORY_MS) {
    s.dropped = true;
    s.freezeUntil = now + beatMs;
  } else if (s.dropped && s.target >= SWAY_BELOW) {
    s.dropped = false;
    s.cheerUntil = now + CHEER_MS;
  }

  return {
    state: s,
    output: {
      energy: s.energy,
      move: moveForEnergy(s.energy),
      cheer: now < s.cheerUntil,
      freeze: s.dropped && now < s.freezeUntil,
      clip: now < s.earsUntil,
      clipNote: now < s.noteUntil,
    },
  };
}
