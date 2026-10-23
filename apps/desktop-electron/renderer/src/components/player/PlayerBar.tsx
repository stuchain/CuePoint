import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { countNoun, formatCount } from "../../format/counts";
import { Hint } from "../Hint";
import { PixelIcon } from "../PixelIcon";
import { TrackContextMenu, useMenuButton, type TrackContextMenuItem } from "../TrackContextMenu";
import { useScaleFactor } from "../../tokens/ScaleContext";
import type { RepeatMode } from "../../api/cuepointBridge.types";
import { useCompactBar } from "./useCompactBar";
import { WheelButton } from "../wheel/WheelButton";
import { waveformEntryWords } from "../waveform/analysisWords";
import { useWaveform } from "../waveform/useWaveforms";
import { useWaveformRequest } from "../waveform/useWaveformRequest";
import { WaveformCanvas } from "../waveform/WaveformCanvas";
import { useWaveformDetailSetting } from "../waveform/waveformDetailSetting";
import { useWaveformBox } from "../waveform/waveformEnvironment";
import {
  formatTime,
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
  trackFacts,
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
 * when there is none, the slider shows exactly as before, and the slider's
 * hint says why in words. A track that starts playing and waits for the
 * analysis is put first in its queue.
 */

const bridge = () => window.cuepoint?.player;

/** A pushed position this close to a committed seek counts as the seek having landed. */
const SEEK_LANDED_S = 0.75;
/** The longest a committed seek is shown before the pushed position takes over again. */
const SEEK_PENDING_MS = 1500;
/** Arrow-key step on the seek slider, in seconds (the range's own step is `any`). */
const SEEK_KEY_STEP_S = 5;

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

/**
 * One wording per control (C175): each button's tip is its spoken name, so the two are written
 * once. A shortcut is the Hint's `shortcut`, drawn after the words.
 */

/**
 * The narrowest the timeline gets, before scale (item 2). The stylesheet's floor under
 * `.cp-player-bar__wave` is this number too; at it, shuffle, repeat, the queue and the zoomed
 * waveform fold into one More menu so the timeline is not squeezed further.
 */
export const TIMELINE_MIN_PX = 96;

const REPEAT_ORDER: readonly RepeatMode[] = ["off", "all", "one"];

/** What the repeat button's short label says beside its icon (BAR-3). */
const REPEAT_SHORT: Record<string, string> = { all: "All", one: "One" };

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
  // Where the last commit sent the player, shown until main reports it (or fails to).
  const [pendingSeconds, setPendingSeconds] = useState<number | null>(null);
  const pendingSeq = useRef(0);
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shownPosition = scrubSeconds ?? pendingSeconds ?? position ?? 0;

  const clearPendingTimer = useCallback(() => {
    if (pendingTimer.current !== null) clearTimeout(pendingTimer.current);
    pendingTimer.current = null;
  }, []);
  useEffect(() => clearPendingTimer, [clearPendingTimer]);
  useEffect(() => {
    if (pendingSeconds === null) return;
    if (position !== null && Math.abs(position - pendingSeconds) <= SEEK_LANDED_S) {
      clearPendingTimer();
      setPendingSeconds(null);
    }
  }, [position, pendingSeconds, clearPendingTimer]);
  const seekMax = duration && duration > 0 ? duration : 0;

  const trackId = item?.trackId ?? null;
  const [detailOn, setDetailOn] = useWaveformDetailSetting();
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

  const chooseRepeat = useCallback(async (next: RepeatMode) => {
    try {
      await bridge()?.setRepeat(next);
    } catch {
      return;
    }
    saveRepeat(next);
  }, []);

  // At 2x in a 1264-wide window the timeline went to nothing (item 2). It keeps a floor, and once
  // it is at that floor the four utility buttons fold into one More menu; they come back once the
  // bar is wider again by the room they took, so the bar does not flicker at the edge.
  const scale = useScaleFactor();
  const compact = useCompactBar();
  const barRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef<HTMLDivElement>(null);
  const [folded, setFolded] = useState(false);
  const unfoldAt = useRef(0);
  const moreMenu = useMenuButton();
  // Why it folded: pushed onto a second row (unfold once the bar is wider by the four buttons), or
  // the timeline at its floor (unfold once the timeline has their room again, which also covers a
  // smaller text size, where the floor itself shrinks).
  const foldedBy = useRef<"wrap" | "floor">("floor");
  const foldedRoom = useRef(0);
  const measureBar = useCallback(() => {
    const bar = barRef.current;
    const timeline = bar?.querySelector<HTMLElement>(".cp-player-bar__wave");
    // Nothing laid out (a hidden window, a test without layout): leave the bar as it is.
    if (!bar || !timeline || bar.clientWidth === 0) return;
    const width = bar.clientWidth;
    // The floor as drawn (it follows --scale), or the same number from here.
    const floor = parseFloat(getComputedStyle(timeline).minWidth) || TIMELINE_MIN_PX * scale;
    if (folded) {
      const room = foldedBy.current === "wrap" ? width >= unfoldAt.current : timeline.clientWidth >= floor + foldedRoom.current;
      if (room) setFolded(false);
      return;
    }
    // At its floor, or already pushed onto a second row with the controls: fold.
    const transport = bar.querySelector<HTMLElement>(".cp-player-bar__transport");
    const controls = bar.querySelector<HTMLElement>(".cp-player-bar__controls");
    const wrapped =
      !!transport && !!controls && transport.offsetHeight > 0 && controls.offsetTop >= transport.offsetTop + transport.offsetHeight;
    if (!wrapped && timeline.clientWidth > floor + 1) return;
    foldedBy.current = wrapped ? "wrap" : "floor";
    foldedRoom.current = Math.max(1, orderRef.current?.offsetWidth ?? 0);
    unfoldAt.current = width + foldedRoom.current;
    setFolded(true);
  }, [folded, scale]);
  // A new text size measures afresh.
  const measuredScale = useRef(scale);
  useEffect(() => {
    if (measuredScale.current === scale) return;
    measuredScale.current = scale;
    setFolded(false);
  }, [scale]);
  useLayoutEffect(measureBar, [measureBar, item?.title]);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return;
    const watcher = new ResizeObserver(measureBar);
    watcher.observe(bar);
    const timeline = bar.querySelector(".cp-player-bar__wave");
    if (timeline) watcher.observe(timeline);
    return () => watcher.disconnect();
  }, [measureBar]);

  const commitScrub = useCallback(() => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    const target = scrubSeconds;
    setScrubSeconds(null);
    if (target === null) return;
    // Keep the clicked spot on the bar until main reports it, so it does not
    // flash back to the old position while the seek is on its way.
    // Only the latest commit may drop its own preview, whatever an earlier one reports late.
    const seq = (pendingSeq.current += 1);
    const drop = () => {
      if (pendingSeq.current === seq) setPendingSeconds(null);
    };
    setPendingSeconds(target);
    clearPendingTimer();
    pendingTimer.current = setTimeout(drop, SEEK_PENDING_MS);
    Promise.resolve(bridge()?.seek(target)).catch(() => {
      if (pendingSeq.current !== seq) return;
      clearPendingTimer();
      drop();
    });
  }, [scrubSeconds, clearPendingTimer]);

  /** `step="any"` leaves a key press at 1 % of the range, so step in seconds instead. */
  const onSeekKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // Shift and Ctrl/Cmd would otherwise step the browser's 1 % of the track. The
    // global Ctrl/Cmd+Arrow shortcuts already skip a focused input.
    if (event.altKey) return;
    let delta = 0;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") delta = SEEK_KEY_STEP_S;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") delta = -SEEK_KEY_STEP_S;
    if (delta === 0) return;
    event.preventDefault();
    onScrub(Math.max(0, Math.min(seekMax || 1, shownPosition + delta)));
  };

  const title = item?.title || "Nothing playing";
  // A queue item with no track id is not in the library: plain text, artist
  // included (BAR-4).
  const openableTrack = onOpenTrack && item && item.trackId !== null ? item.trackId : null;
  const facts = trackFacts(item);
  const keyText = playingKey(item);
  const artistText = facts.artist;
  // The facts line is artist · label · key · BPM · year, skipping what is missing. The artist
  // is a button when the track is in the Library; the key is the clickable chip that opens the
  // Camelot wheel (BAR-5); the rest is text.
  // The artist and label can be long and shrink to an ellipsis; the key chip, BPM and year keep
  // their room, so the chip (the player's only way to the wheel) is always visible.
  const leadParts: ReactNode[] = [];
  const tailParts: ReactNode[] = [];
  if (artistText !== "") {
    leadParts.push(
      onOpenArtist && openableTrack !== null ? (
        <Hint inline text={`Show ${artistText} in Discover`}>
          <button type="button" className="cp-player-bar__link" onClick={() => onOpenArtist(artistText)}>
            {artistText}
          </button>
        </Hint>
      ) : (
        artistText
      ),
    );
  }
  if (facts.label !== "") leadParts.push(facts.label);
  if (keyText !== null) tailParts.push(<WheelButton source="player" keyName={keyText} />);
  if (facts.bpm !== "") tailParts.push(facts.bpm);
  if (facts.year !== "") tailParts.push(facts.year);

  // The waveform's reason (WAVE-06) is the slider's Hint, on hover and on
  // keyboard focus: the slider is the one focusable piece.
  const seekReason = picture ? undefined : (waveformWords ?? undefined);

  const queueWords = queueOpen
    ? "Hide the queue"
    : `Show the queue (${countNoun(queueLength, "track")})`;

  // The strip needs a library track (`PlayerSlot`); the button still keeps the choice.
  const detailWords = `${detailOn ? "Hide" : "Show"} the zoomed waveform`;
  const detailHint =
    item !== null && trackId === null ? `${detailWords} · only for tracks in your Library` : detailWords;

  const moreBox = folded && moreMenu.open ? moreMenu.anchor.current?.getBoundingClientRect() : undefined;
  const moreItems: TrackContextMenuItem[] = [
    { id: "shuffle", label: "Shuffle", checked: shuffle, onSelect: () => void toggleShuffle() },
    {
      id: "repeat",
      label: "Repeat",
      onSelect: () => undefined,
      items: REPEAT_ORDER.map((mode) => ({
        id: `repeat-${mode}`,
        label: repeatLabel(mode),
        checked: repeat === mode,
        onSelect: () => void chooseRepeat(mode),
      })),
    },
    ...(onToggleQueue
      ? [{ id: "queue", label: `Queue (${countNoun(queueLength, "track")})`, checked: queueOpen, onSelect: onToggleQueue }]
      : []),
    // The short window draws no zoomed strip, so it offers no switch for one.
    ...(compact ? [] : [{ id: "zoom", label: "Zoomed waveform", title: detailHint, checked: detailOn, onSelect: () => setDetailOn(!detailOn) }]),
  ];

  return (
    <div className="cp-player-bar" role="region" aria-label="Player" ref={barRef}>
      <div className="cp-player-bar__transport">
        <Hint text="Previous track" shortcut="Mod+←">
          <button
            type="button"
            className="cp-player-bar__button"
            onClick={() => void bridge()?.previous()}
            disabled={item === null}
            aria-label="Previous track"
          >
            <PixelIcon name="previous" />
          </button>
        </Hint>
        <Hint text={playing ? "Pause" : "Play"} shortcut="Space">
          <button
            type="button"
            className="cp-player-bar__button cp-player-bar__button--play"
            onClick={() => void bridge()?.toggle()}
            disabled={item === null}
            aria-label={playing ? "Pause" : "Play"}
            aria-pressed={playing}
          >
            <PixelIcon name={playing ? "pause" : "play"} />
          </button>
        </Hint>
        <Hint text="Next track" shortcut="Mod+→">
          <button
            type="button"
            className="cp-player-bar__button"
            onClick={() => void bridge()?.next()}
            disabled={item === null}
            aria-label="Next track"
          >
            <PixelIcon name="next" />
          </button>
        </Hint>
      </div>

      <div className="cp-player-bar__track">
        {openableTrack !== null ? (
          <Hint inline text={`Show “${title}” in the Library`}>
            <button
              type="button"
              className="cp-player-bar__title cp-player-bar__link"
              onClick={() => onOpenTrack?.(openableTrack)}
            >
              {title}
            </button>
          </Hint>
        ) : (
          <span className="cp-player-bar__title" data-cut-hint="">
            {title}
          </span>
        )}
        <span className="cp-player-bar__meta">
          {leadParts.length > 0 && (
            <span className="cp-player-bar__meta-lead">
              {leadParts.map((part, index) => (
                <Fragment key={index}>
                  {index > 0 ? " · " : null}
                  {part}
                </Fragment>
              ))}
              {/* The separator belongs to the lead, so a lead squeezed to nothing leaves none behind. */}
              {tailParts.length > 0 ? " · " : null}
            </span>
          )}
          {tailParts.map((part, index) => (
            <span key={index} className="cp-player-bar__meta-fixed">
              {index > 0 ? " · " : null}
              {part}
            </span>
          ))}
        </span>
      </div>

      {/* Why there is no waveform is the slider's Hint, never the region's
          space, so the bar never shows an empty box (WAVE-06). No title here:
          it would show natively over the slider while Hint holds its own off. */}
      <div className="cp-player-bar__seek">
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
              step="any"
              value={Math.min(shownPosition, seekMax || 1)}
              disabled={seekMax === 0}
              onChange={(event) => onScrub(Number(event.target.value))}
              onPointerUp={commitScrub}
              onPointerCancel={commitScrub}
              onKeyDown={onSeekKeyDown}
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
      {folded && (
        <Hint text="More player controls">
          <button
            type="button"
            className={`cp-player-bar__button cp-player-bar__button--standard${shuffle || repeat !== "off" || queueOpen ? " cp-player-bar__button--on" : ""}`}
            aria-label="More player controls"
            {...moreMenu.buttonProps}
          >
            <PixelIcon name="more" />
          </button>
        </Hint>
      )}
      {folded && moreMenu.open && moreBox && (
        <TrackContextMenu
          x={moreBox.left}
          y={moreBox.top}
          anchor={moreMenu.anchor}
          onClose={moreMenu.close}
          label="More player controls"
          items={moreItems}
        />
      )}
      {!folded && (
      <div className="cp-player-bar__order" ref={orderRef}>
        <Hint text={shuffle ? "Shuffle on" : "Shuffle off"}>
          <button
            type="button"
            className={`cp-player-bar__button cp-player-bar__button--standard${shuffle ? " cp-player-bar__button--on" : ""}`}
            onClick={() => void toggleShuffle()}
            aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
            aria-pressed={shuffle}
          >
            <PixelIcon name="shuffle" />
          </button>
        </Hint>
        <Hint text={repeatLabel(repeat)}>
          <button
            type="button"
            className={`cp-player-bar__button cp-player-bar__button--standard${repeat !== "off" ? " cp-player-bar__button--on" : ""}`}
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
              className={`cp-player-bar__button cp-player-bar__button--standard${queueOpen ? " cp-player-bar__button--on" : ""}`}
              onClick={onToggleQueue}
              aria-label={queueWords}
              aria-pressed={queueOpen}
              aria-expanded={queueOpen}
            >
              <PixelIcon name="queue" />
              {queueLength > 0 && (
                <span className="cp-player-bar__count cp-data" aria-hidden="true">
                  {formatCount(queueLength)}
                </span>
              )}
            </button>
          </Hint>
        )}
        <Hint text={detailHint}>
          <button
            type="button"
            className={`cp-player-bar__button cp-player-bar__button--standard cp-player-bar__button--zoom${detailOn ? " cp-player-bar__button--on" : ""}`}
            onClick={() => setDetailOn(!detailOn)}
            aria-label={detailWords}
            aria-pressed={detailOn}
          >
            <PixelIcon name="waveform" />
          </button>
        </Hint>
      </div>
      )}

      <div className="cp-player-bar__volume">
        <Hint text={muted ? "Unmute" : "Mute"}>
          <button
            type="button"
            className="cp-player-bar__button cp-player-bar__button--standard"
            onClick={() => void bridge()?.setMuted(!muted)}
            aria-label={muted ? "Unmute" : "Mute"}
            aria-pressed={muted}
          >
            <PixelIcon name={muted ? "volume-muted" : "volume"} />
          </button>
        </Hint>
        <Hint text="Volume" shortcut="Mod+↑/↓">
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
