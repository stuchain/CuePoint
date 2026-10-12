/**
 * The playhead between the player's snapshots (T4).
 *
 * Main pushes `PlaybackState.positionSeconds` four times a second
 * (`POSITION_PUSH_INTERVAL_MS`); the zoomed strip draws up to sixty frames a
 * second, so between two snapshots it extrapolates at normal speed from the
 * last. Nothing here reads a clock: every call is told the time, so a test
 * drives it with a number.
 *
 * A snapshot within `JUMP_MS` of what was predicted is the engine and the
 * extrapolation disagreeing by a few frames' worth: the difference fades out
 * over `BLEND_MS`, so the scroll never steps. Anything further is a seek or a
 * new track, and the playhead goes there at once. While paused it holds still,
 * and while hidden it returns the position it had, so nothing is drawn from a
 * clock nobody watches.
 */

/** A snapshot this near the prediction (ms) is blended in. */
export const JUMP_MS = 60;

/** How long a blended difference takes to fade (ms). */
export const BLEND_MS = 100;

export interface PlayheadClock {
  /** The player's position, `null` for none, with the time it was read. */
  snapshot(positionSeconds: number | null, playing: boolean, nowMs: number): void;
  /** Where the playhead is at `nowMs`, in milliseconds; null before any position. */
  positionMs(nowMs: number): number | null;
  /** The document hid or showed; hidden holds the position it had. */
  setHidden(hidden: boolean, nowMs: number): void;
}

export function createPlayheadClock(): PlayheadClock {
  let anchorMs: number | null = null;
  let anchorAt = 0;
  let playing = false;
  /** The difference to fade out: what was drawn minus what is true now. */
  let blendMs = 0;
  let blendAt = 0;
  let frozen: number | null = null;

  const raw = (nowMs: number): number | null => {
    if (anchorMs === null) return null;
    const elapsed = playing ? Math.max(0, nowMs - anchorAt) : 0;
    const remaining = blendMs === 0 ? 0 : blendMs * Math.max(0, 1 - (nowMs - blendAt) / BLEND_MS);
    return anchorMs + elapsed + remaining;
  };

  return {
    snapshot(positionSeconds, isPlaying, nowMs) {
      if (positionSeconds === null || !Number.isFinite(positionSeconds)) {
        anchorMs = null;
        playing = false;
        blendMs = 0;
        return;
      }
      const truth = positionSeconds * 1000;
      const predicted = playing && isPlaying ? raw(nowMs) : null;
      if (predicted !== null && Math.abs(predicted - truth) <= JUMP_MS) {
        blendMs = predicted - truth;
        blendAt = nowMs;
      } else {
        blendMs = 0;
      }
      anchorMs = truth;
      anchorAt = nowMs;
      playing = isPlaying;
    },

    positionMs(nowMs) {
      if (frozen !== null) return frozen;
      return raw(nowMs);
    },

    setHidden(hidden, nowMs) {
      frozen = hidden ? raw(nowMs) : null;
    },
  };
}
