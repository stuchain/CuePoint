/**
 * Everything the crowd reads, in one hook.
 *
 * Live loudness readings come from `window.cuepoint.player.subscribeLevels` (subscribed only while
 * the hook is mounted, unsubscribed on unmount). The track, playing state and position come from the
 * one player store (`usePlayerValue`); the beat grid and the waveform come from `useWaveform`, which
 * shares the app's waveform cache, so the crowd asks for nothing the player bar has not.
 *
 * The scene draws every frame but React must not render every frame, so the hook returns a stable
 * `read(now)` that the animation loop calls: it returns what changed since the last call (readings
 * are handed over once) and the position extrapolated between the player's pushes.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";

import type { BeatGridMarker } from "../../api/cuepointBridge.types";
import {
  sameItem,
  selectCurrentItem,
  selectDuration,
  selectPlaying,
  selectPosition,
} from "../player/playerFormat";
import { usePlayerValue } from "../player/playerStore";
import { createPlayheadClock } from "../waveform/playheadClock";
import { useWaveform } from "../waveform/useWaveforms";
import { waveformEnergyAt } from "./crowdFallback";
import type { LevelReading } from "./crowdRules";

/**
 * The waveform asked for. The player bar's width follows its box and the strip asks for none, so
 * there is no shared width to reuse: this is one the engine answers, plenty to find a column by.
 */
export const CROWD_WAVEFORM_WIDTH = 400;

/** A reading older than this no longer says what the music is doing (ms). */
const READING_MAX_AGE_MS = 1000;

/** A new track only gets its welcome cheer if it started playing this recently (ms). */
const NEW_TRACK_WINDOW_MS = 1500;

/** Readings kept between two frames at most (30 a second for a few seconds). */
const MAX_BUFFERED = 120;

export interface CrowdFrameInputs {
  playing: boolean;
  /** A new track started playing just now, once; not one that began while the crowd was not watching. */
  newTrack: boolean;
  /** Seconds, extrapolated to `now`; null when nothing is loaded. */
  positionSec: number | null;
  grid: readonly BeatGridMarker[];
  bpm: number | null;
  /** New readings since the last call, none older than a second. */
  readings: LevelReading[];
  /** The waveform's energy at the position, for when readings stop. */
  fallbackEnergy: number | null;
}

export interface CrowdInputs {
  title: string;
  playing: boolean;
  read: (nowMs: number) => CrowdFrameInputs;
}

export function useCrowdInputs(): CrowdInputs {
  const item = usePlayerValue(selectCurrentItem, sameItem);
  const playing = usePlayerValue(selectPlaying);
  const position = usePlayerValue(selectPosition);
  const duration = usePlayerValue(selectDuration);

  const entry = useWaveform(item?.trackId ?? null, CROWD_WAVEFORM_WIDTH, { marks: true });
  const track = entry?.kind === "track" ? entry.track : null;

  const clock = useRef(createPlayheadClock());
  const buffer = useRef<LevelReading[]>([]);

  // Readings, while mounted. A bridge without the meter simply never answers.
  useEffect(() => {
    const player = window.cuepoint?.player;
    if (!player || typeof player.subscribeLevels !== "function") return undefined;
    const unsubscribe = player.subscribeLevels((reading) => {
      const t = performance.now();
      const next = buffer.current;
      next.push({ t, rmsDb: reading.rmsDb, peakDb: reading.peakDb });
      if (next.length > MAX_BUFFERED) next.splice(0, next.length - MAX_BUFFERED);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const playingSince = useRef<number | null>(null);

  // A new track starts its readings over, and is owed a welcome cheer once it plays.
  const trackKey = item?.id ?? null;
  const seenKey = useRef(trackKey);
  const owesCheer = useRef(false);
  useEffect(() => {
    buffer.current = [];
    if (trackKey !== seenKey.current) {
      seenKey.current = trackKey;
      owesCheer.current = trackKey !== null;
      playingSince.current = performance.now();
    }
  }, [trackKey]);

  // When playing last began, so a track that started while nobody drew frames is not cheered late.
  useEffect(() => {
    playingSince.current = playing ? performance.now() : null;
  }, [playing]);


  useEffect(() => {
    clock.current.snapshot(position, playing, performance.now());
  }, [position, playing]);

  // What the frame reads lives in a ref, so `read` never changes and the loop never restarts.
  const latest = useRef({ playing, track, itemBpm: item?.bpm ?? null, duration });
  latest.current = { playing, track, itemBpm: item?.bpm ?? null, duration };

  const read = useCallback((nowMs: number): CrowdFrameInputs => {
    const now = latest.current;
    const positionMs = clock.current.positionMs(nowMs);
    const positionSec = positionMs === null ? null : positionMs / 1000;
    const readings = buffer.current.filter((r) => nowMs - r.t <= READING_MAX_AGE_MS);
    buffer.current = [];
    let newTrack = false;
    if (owesCheer.current && now.playing) {
      owesCheer.current = false;
      newTrack = playingSince.current !== null && nowMs - playingSince.current <= NEW_TRACK_WINDOW_MS;
    }
    const durationSec = now.duration ?? (now.track?.duration_ms != null ? now.track.duration_ms / 1000 : null);
    return {
      playing: now.playing,
      newTrack,
      positionSec,
      grid: now.track?.marks?.grid ?? [],
      bpm: now.itemBpm,
      readings,
      fallbackEnergy: waveformEnergyAt(now.track?.data, positionSec, durationSec),
    };
  }, []);

  return useMemo(
    () => ({ title: item?.title ?? "", playing, read }),
    [item?.title, playing, read],
  );
}
