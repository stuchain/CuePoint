import { useCallback, useRef, useState } from "react";
import { PixelIcon } from "../PixelIcon";
import {
  formatTime,
  formatTrackMeta,
  sameItem,
  selectCurrentItem,
  selectDuration,
  selectMuted,
  selectPlaying,
  selectPosition,
  selectRepeat,
  selectShuffle,
  selectVolume,
} from "./playerFormat";
import { nextRepeatMode, repeatLabel, saveRepeat, saveShuffle } from "./playerOrderState";
import { usePlayerValue } from "./playerStore";
import "./PlayerBar.css";

/**
 * The transport (PLAYER-06, DEC-052, DEC-053).
 *
 * What it shows comes entirely from main (DEC-050): every control sends an
 * intent and then waits to be told what happened. Nothing here sets its own
 * state optimistically, so the play button cannot show "paused" over a player
 * that never paused — which is exactly what happens when a UI guesses and the
 * command fails.
 *
 * The one exception is the seek slider *while it is being dragged*. A position
 * arriving from mpv mid-drag would yank the handle out from under the pointer,
 * so the drag holds a local preview and commits once on release — one seek, not
 * one per pixel, which also matters when the file is on a network drive.
 *
 * Shuffle, repeat and the queue panel are deliberately absent: they are
 * PLAYER-07's and PLAYER-08's, and the queue model behind them already exists.
 */

const bridge = () => window.cuepoint?.player;

export function PlayerBar() {
  const item = usePlayerValue(selectCurrentItem, sameItem);
  const playing = usePlayerValue(selectPlaying);
  const position = usePlayerValue(selectPosition);
  const duration = usePlayerValue(selectDuration);
  const volume = usePlayerValue(selectVolume);
  const muted = usePlayerValue(selectMuted);
  const shuffle = usePlayerValue(selectShuffle);
  const repeat = usePlayerValue(selectRepeat);

  // Only while dragging; null the rest of the time so the slider follows mpv.
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null);
  const scrubbing = useRef(false);

  const shownPosition = scrubSeconds ?? position ?? 0;
  const seekMax = duration && duration > 0 ? duration : 0;

  const onScrub = useCallback((value: number) => {
    scrubbing.current = true;
    setScrubSeconds(value);
  }, []);

  /**
   * Persist only what actually took effect.
   *
   * Saving before the command lands would remember a preference the player
   * never applied — the same reason nothing else here is optimistic.
   */
  const toggleShuffle = useCallback(async () => {
    const next = !shuffle;
    await bridge()?.setShuffle(next);
    saveShuffle(next);
  }, [shuffle]);

  const cycleRepeat = useCallback(async () => {
    const next = nextRepeatMode(repeat);
    await bridge()?.setRepeat(next);
    saveRepeat(next);
  }, [repeat]);

  const commitScrub = useCallback(() => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    const target = scrubSeconds;
    setScrubSeconds(null);
    if (target !== null) void bridge()?.seek(target);
  }, [scrubSeconds]);

  return (
    <div className="cp-player-bar" role="region" aria-label="Player">
      <div className="cp-player-bar__transport">
        <button
          type="button"
          className="cp-player-bar__button"
          onClick={() => void bridge()?.previous()}
          aria-label="Previous track"
        >
          <PixelIcon name="previous" />
        </button>
        <button
          type="button"
          className="cp-player-bar__button cp-player-bar__button--play"
          onClick={() => void bridge()?.toggle()}
          aria-label={playing ? "Pause" : "Play"}
          aria-pressed={playing}
        >
          <PixelIcon name={playing ? "pause" : "play"} />
        </button>
        <button
          type="button"
          className="cp-player-bar__button"
          onClick={() => void bridge()?.next()}
          aria-label="Next track"
        >
          <PixelIcon name="next" />
        </button>
      </div>

      <div className="cp-player-bar__track">
        <span className="cp-player-bar__title" title={item?.title ?? ""}>
          {item?.title || "Nothing playing"}
        </span>
        <span className="cp-player-bar__meta" title={formatTrackMeta(item)}>
          {formatTrackMeta(item)}
        </span>
      </div>

      <div className="cp-player-bar__seek">
        {/* `--font-data` (DEC-048): these are dense numerals that change every
            second, which is the case that token exists for. */}
        <span className="cp-player-bar__time">{formatTime(shownPosition)}</span>
        <input
          type="range"
          className="cp-player-bar__slider"
          min={0}
          max={seekMax || 1}
          step={0.5}
          value={Math.min(shownPosition, seekMax || 1)}
          disabled={seekMax === 0}
          onChange={(event) => onScrub(Number(event.target.value))}
          onPointerUp={commitScrub}
          onKeyUp={commitScrub}
          onBlur={commitScrub}
          aria-label="Seek"
          aria-valuetext={`${formatTime(shownPosition)} of ${formatTime(duration)}`}
        />
        <span className="cp-player-bar__time">{formatTime(duration)}</span>
      </div>

      <div className="cp-player-bar__order">
        <button
          type="button"
          className={`cp-player-bar__button${shuffle ? " cp-player-bar__button--on" : ""}`}
          onClick={() => void toggleShuffle()}
          aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
          aria-pressed={shuffle}
        >
          <PixelIcon name="shuffle" />
        </button>
        <button
          type="button"
          className={`cp-player-bar__button${repeat !== "off" ? " cp-player-bar__button--on" : ""}`}
          onClick={() => void cycleRepeat()}
          aria-label={repeatLabel(repeat)}
          aria-pressed={repeat !== "off"}
        >
          {/* Three states, three drawings (DEC-052): repeat-one is its own
              glyph rather than the loop with a badge stuck on it. */}
          <PixelIcon name={repeat === "one" ? "repeat-one" : "repeat"} />
        </button>
      </div>

      <div className="cp-player-bar__volume">
        <button
          type="button"
          className="cp-player-bar__button"
          onClick={() => void bridge()?.setMuted(!muted)}
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
        >
          <PixelIcon name={muted ? "volume-muted" : "volume"} />
        </button>
        <input
          type="range"
          className="cp-player-bar__slider cp-player-bar__slider--volume"
          min={0}
          max={100}
          step={1}
          value={muted ? 0 : volume}
          onChange={(event) => void bridge()?.setVolume(Number(event.target.value))}
          aria-label="Volume"
          aria-valuetext={`${muted ? 0 : Math.round(volume)}%`}
        />
      </div>
    </div>
  );
}
