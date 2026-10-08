import { useCallback, useRef, useState, type ReactNode } from "react";
import { Badge } from "../Badge";
import { Hint } from "../Hint";
import { PixelIcon } from "../PixelIcon";
import { modifierName } from "../shell/platformKeys";
import { toggleWheel } from "../wheel/wheelStore";
import { waveformEntryWords } from "../waveform/analysisWords";
import { useWaveform } from "../waveform/useWaveforms";
import { useWaveformRequest } from "../waveform/useWaveformRequest";
import { WaveformCanvas } from "../waveform/WaveformCanvas";
import { useWaveformBox } from "../waveform/waveformEnvironment";
import {
  formatTime,
  formatTrackMeta,
  playingKey,
  sameItem,
  selectCurrentItem,
  selectDuration,
  selectMuted,
  selectPlaying,
  selectPosition,
  selectQueueLength,
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
 *
 * **The waveform is the seek control's picture (WAVE-06, DEC-114).** Once the
 * playing track's waveform is ready it fills the seek region, laid across the
 * duration the player reports, with the played part dimmed and the playhead
 * where main says playback is (or where a drag previews). The range input
 * stays the control: it lies over the waveform, transparent, so keyboard,
 * screen reader and pointer all still go through it and the logic above, and
 * its focus ring is drawn around the waveform. Until the waveform is ready, or
 * when there is none, the slider shows exactly as before, and the region's
 * title says why in words. A track that starts playing and waits for the
 * analysis is put first in its queue.
 */

const bridge = () => window.cuepoint?.player;

interface PlayerBarProps {
  /** Whether the queue panel is open, and how to change that (PLAYER-08). */
  queueOpen?: boolean;
  onToggleQueue?: () => void;
  /**
   * Where the playing track's title and artist lead (BAR-4). Passed in by
   * `App.tsx`, which owns the routing; absent, they stay plain text.
   */
  onOpenTrack?: (trackId: number) => void;
  onOpenArtist?: (artist: string) => void;
}

/** What the repeat button's short label says beside its icon (BAR-3). */
const REPEAT_SHORT: Record<string, string> = { all: "All", one: "One" };

const REPEAT_TITLES: Record<string, string> = {
  off: "Repeat: off",
  all: "Repeat: all tracks",
  one: "Repeat: one track",
};

/**
 * The track line with its key as a button that opens the Camelot wheel (BAR-5).
 *
 * The line is joined as text (`formatTrackMeta`), so the key is found in it from
 * `from`, past the artist, rather than rebuilt: an artist named "8A" is not the key.
 */
function withKeyButton(text: string, from: number, key: string | null): ReactNode {
  const at = key === null ? -1 : text.indexOf(key, from);
  if (key === null || at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <button
        type="button"
        className="cp-player-bar__keybtn"
        data-wheel-opener=""
        title="Show this key on the Camelot wheel"
        aria-label={`Show ${key} on the Camelot wheel`}
        onClick={() => toggleWheel("player")}
      >
        {key}
      </button>
      {text.slice(at + key.length)}
    </>
  );
}

export function PlayerBar({
  queueOpen = false,
  onToggleQueue,
  onOpenTrack,
  onOpenArtist,
}: PlayerBarProps = {}) {
  const item = usePlayerValue(selectCurrentItem, sameItem);
  const playing = usePlayerValue(selectPlaying);
  const position = usePlayerValue(selectPosition);
  const duration = usePlayerValue(selectDuration);
  const volume = usePlayerValue(selectVolume);
  const muted = usePlayerValue(selectMuted);
  const shuffle = usePlayerValue(selectShuffle);
  const repeat = usePlayerValue(selectRepeat);
  const queueLength = usePlayerValue(selectQueueLength);

  // Only while dragging; null the rest of the time so the slider follows mpv.
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null);
  const scrubbing = useRef(false);

  const shownPosition = scrubSeconds ?? position ?? 0;
  const seekMax = duration && duration > 0 ? duration : 0;

  const trackId = item?.trackId ?? null;
  const wave = useWaveformBox<HTMLDivElement>();
  const waveform = useWaveform(trackId, wave.width);
  useWaveformRequest(trackId, waveform);
  const picture =
    seekMax > 0 && waveform?.kind === "track" && waveform.track.state === "ready"
      ? waveform.track.data
      : null;
  const waveformWords = waveformEntryWords(waveform);

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
    // A refusal leaves the preference where it was; it must not also surface
    // as an unhandled rejection, which is what a bare `void` here would give.
    try {
      await bridge()?.setShuffle(next);
    } catch {
      return;
    }
    saveShuffle(next);
  }, [shuffle]);

  const cycleRepeat = useCallback(async () => {
    const next = nextRepeatMode(repeat);
    try {
      await bridge()?.setRepeat(next);
    } catch {
      return;
    }
    saveRepeat(next);
  }, [repeat]);

  const commitScrub = useCallback(() => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    const target = scrubSeconds;
    setScrubSeconds(null);
    if (target !== null) void bridge()?.seek(target);
  }, [scrubSeconds]);

  const mod = modifierName();
  const title = item?.title || "Nothing playing";
  // A queue item with no track id is not in the library: plain text, artist
  // included (BAR-4).
  const openableTrack = onOpenTrack && item && item.trackId !== null ? item.trackId : null;
  const meta = formatTrackMeta(item);
  const keyText = playingKey(item);
  // The artist leads the line (`playerFormat.ts`); the button replaces just its
  // words, and what follows (key, BPM) stays text.
  const artistText = item?.artist.trim() ?? "";
  const artistSplit =
    onOpenArtist && openableTrack !== null && artistText !== "" && meta.startsWith(artistText)
      ? meta.slice(artistText.length)
      : null;

  // The seek area's title is the waveform's reason (WAVE-06); Hint shows it on
  // keyboard focus too, so it sits on the slider, the one focusable piece.
  const seekReason = picture ? undefined : (waveformWords ?? undefined);

  const queueWords = queueOpen
    ? "Hide the queue"
    : `Show the queue (${queueLength} ${queueLength === 1 ? "track" : "tracks"})`;

  return (
    <div className="cp-player-bar" role="region" aria-label="Player">
      <div className="cp-player-bar__transport">
        <Hint text={`Previous track (${mod}+←)`}>
          <button
            type="button"
            className="cp-player-bar__button"
            onClick={() => void bridge()?.previous()}
            aria-label="Previous track"
          >
            <PixelIcon name="previous" />
          </button>
        </Hint>
        <Hint text={`${playing ? "Pause" : "Play"} (Space)`}>
          <button
            type="button"
            className="cp-player-bar__button cp-player-bar__button--play"
            onClick={() => void bridge()?.toggle()}
            aria-label={playing ? "Pause" : "Play"}
            aria-pressed={playing}
          >
            <PixelIcon name={playing ? "pause" : "play"} />
          </button>
        </Hint>
        <Hint text={`Next track (${mod}+→)`}>
          <button
            type="button"
            className="cp-player-bar__button"
            onClick={() => void bridge()?.next()}
            aria-label="Next track"
          >
            <PixelIcon name="next" />
          </button>
        </Hint>
      </div>

      <div className="cp-player-bar__track">
        {openableTrack !== null ? (
          <button
            type="button"
            className="cp-player-bar__title cp-player-bar__link"
            title={`Show “${title}” in the Library`}
            onClick={() => onOpenTrack?.(openableTrack)}
          >
            {title}
          </button>
        ) : (
          <span className="cp-player-bar__title" title={item?.title ?? ""}>
            {title}
          </span>
        )}
        {artistSplit !== null ? (
          <span className="cp-player-bar__meta" title={meta}>
            <button
              type="button"
              className="cp-player-bar__link"
              title={`Show ${artistText} in Discover`}
              onClick={() => onOpenArtist?.(artistText)}
            >
              {artistText}
            </button>
            {withKeyButton(artistSplit, 0, keyText)}
          </span>
        ) : (
          <span className="cp-player-bar__meta" title={meta}>
            {withKeyButton(meta, artistText.length, keyText)}
          </span>
        )}
      </div>

      <div
        className="cp-player-bar__seek"
        // Why there is no waveform, in the title and never in the region's
        // space, so the bar never shows an empty box (WAVE-06).
        title={seekReason}
      >
        {/* `--font-data` (DEC-048): these are dense numerals that change every
            second, which is the case that token exists for. */}
        <span className="cp-player-bar__time">{formatTime(shownPosition)}</span>
        <div
          ref={wave.box}
          className={`cp-player-bar__wave${picture ? " cp-player-bar__wave--drawn" : ""}`}
          data-testid="player-waveform"
        >
          {picture && (
            <WaveformCanvas
              data={picture}
              durationMs={seekMax * 1000}
              playheadMs={shownPosition * 1000}
              className="cp-player-bar__waveform"
            />
          )}
          <Hint text={seekReason}>
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
          </Hint>
        </div>
        <span className="cp-player-bar__time">{formatTime(duration)}</span>
      </div>

      <div className="cp-player-bar__controls">
      <div className="cp-player-bar__order">
        <Hint text={shuffle ? "Shuffle: on" : "Shuffle: off"}>
          <button
            type="button"
            className={`cp-player-bar__button${shuffle ? " cp-player-bar__button--on" : ""}`}
            onClick={() => void toggleShuffle()}
            aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
            aria-pressed={shuffle}
          >
            <PixelIcon name="shuffle" />
          </button>
        </Hint>
        <Hint text={REPEAT_TITLES[repeat]}>
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
            {repeat !== "off" && (
              <span className="cp-player-bar__repeat-label" aria-hidden="true">
                {REPEAT_SHORT[repeat]}
              </span>
            )}
          </button>
        </Hint>
        {onToggleQueue && (
          <Hint text={queueWords}>
            <button
              type="button"
              className={`cp-player-bar__button${queueOpen ? " cp-player-bar__button--on" : ""}`}
              onClick={onToggleQueue}
              aria-label={queueWords}
              aria-pressed={queueOpen}
              aria-expanded={queueOpen}
            >
              <PixelIcon name="queue" />
              {queueLength > 0 && (
                <Badge className="cp-player-bar__count" aria-hidden="true">
                  {queueLength.toLocaleString()}
                </Badge>
              )}
            </button>
          </Hint>
        )}
      </div>

      <div className="cp-player-bar__volume">
        <Hint text={muted ? "Unmute" : "Mute"}>
          <button
            type="button"
            className="cp-player-bar__button"
            onClick={() => void bridge()?.setMuted(!muted)}
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={muted}
          >
            <PixelIcon name={muted ? "volume-muted" : "volume"} />
          </button>
        </Hint>
        <Hint text={`Volume (${mod}+↑/↓)`}>
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
        </Hint>
      </div>
      </div>
    </div>
  );
}
