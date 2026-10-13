/**
 * The playhead between the player's snapshots (T4).
 *
 * Main pushes `PlaybackState.positionSeconds` four times a second
 * (`POSITION_PUSH_INTERVAL_MS`); the zoomed strip draws up to sixty frames a
 * second, so between two snapshots it extrapolates at normal speed from the
 * last. Nothing here reads a clock: every call is told the time, so a test
 * drives it with a number.
 *
 * A snapshot close to what is drawn now is the engine and the extrapolation
 * disagreeing by a few frames' worth: the difference fades out over
 * `BLEND_MS`, so the scroll never steps. "Close" is `GLIDE_MS` for a pause, a
 * settle, a resume and the first snapshot after a resume; between two
 * playing snapshots it stays the tighter `JUMP_MS`. Anything further is a seek
 * or a new track, and the playhead goes there at once. Once settled, a paused
 * clock holds still, and while hidden it returns the position it had, so
 * nothing is drawn from a clock nobody watches.
 */

/** A snapshot this near the prediction (ms) is blended in. */
export const JUMP_MS = 60;

/** Any other snapshot this near what is drawn (ms) glides: a pause, a settle, a start. */
export const GLIDE_MS = 250;

/** How long a blended difference takes to fade (ms). */
export const BLEND_MS = 100;

/**
 * How long a pause fades (ms). The engine's settled position follows the
 * pause push by about a quarter of a second; a fade this long is still going
 * when it lands, so the settle is folded into the same glide.
 */
export const PAUSE_BLEND_MS = 300;

export interface PlayheadClock {
  /** The player's position, `null` for none, with the time it was read. */
  snapshot(positionSeconds: number | null, playing: boolean, nowMs: number, glide?: boolean): void;
  /** Where the playhead is at `nowMs`, in milliseconds; null before any position. */
  positionMs(nowMs: number): number | null;
  /** True while a glide is still fading, so a paused strip knows to draw on. */
  settling(nowMs: number): boolean;
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
  /** How long the current blend takes to fade (ms). */
  let blendLen = BLEND_MS;
  let frozen: number | null = null;
  /** The last snapshot was a start from paused: the next one is still settling in. */
  let starting = false;

  const raw = (nowMs: number): number | null => {
    if (anchorMs === null) return null;
    const elapsed = playing ? Math.max(0, nowMs - anchorAt) : 0;
    const remaining = blendMs === 0 ? 0 : blendMs * Math.max(0, 1 - (nowMs - blendAt) / blendLen);
    return anchorMs + elapsed + remaining;
  };

  return {
    snapshot(positionSeconds, isPlaying, nowMs, glide = true) {
      if (positionSeconds === null || !Number.isFinite(positionSeconds)) {
        anchorMs = null;
        playing = false;
        blendMs = 0;
        starting = false;
        return;
      }
      const truth = positionSeconds * 1000;
      const drawn = raw(nowMs);
      const limit = playing && isPlaying && !starting ? JUMP_MS : GLIDE_MS;
      if (glide && drawn !== null && Math.abs(drawn - truth) <= limit) {
        blendMs = drawn - truth;
        blendAt = nowMs;
        // A playing glide never slows the playhead below half speed.
        blendLen = isPlaying
          ? Math.max(BLEND_MS, 2 * Math.abs(blendMs))
          : playing
            ? PAUSE_BLEND_MS
            : BLEND_MS;
      } else {
        blendMs = 0;
      }
      starting = isPlaying && !playing && anchorMs !== null;
      anchorMs = truth;
      anchorAt = nowMs;
      playing = isPlaying;
    },

    positionMs(nowMs) {
      if (frozen !== null) return frozen;
      return raw(nowMs);
    },

    settling(nowMs) {
      return anchorMs !== null && blendMs !== 0 && nowMs - blendAt < blendLen;
    },

    setHidden(hidden, nowMs) {
      frozen = hidden ? raw(nowMs) : null;
    },
  };
}
