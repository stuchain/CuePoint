/**
 * The Inspector's waveform (WAVE-06, DEC-114).
 *
 * Under the header and its artwork, the Inspector's full width and two table
 * rows tall: the whole track with its cues, loops and beat grid, Rekordbox's
 * marks drawn read-only (DEC-118).
 *
 * **Seeking is the playing track's.** When the track shown is the one playing,
 * the playhead is drawn, laid across the duration the player reports as the
 * bar's is, and a click seeks there. Any other track's waveform is a picture,
 * and its title says so: a click does not start playback, which is the row's
 * double-click (DEC-012) and a different gesture. The bar stays the keyboard's
 * and the screen reader's seek control; this one adds a pointer target.
 *
 * Without a waveform the box says why in words. A track shown here that waits
 * for the analysis is put first in its queue.
 *
 * Under it, one line of loudness (WAVE-08): "Loudness −8.4 LUFS · Peak −0.3
 * dBFS", or why there is none. Shown, never applied. A track whose waveform is
 * stored but whose loudness is still to be measured waits for it here too, and
 * is put first in the queue as a waiting track is.
 */
import { useEffect, type MouseEvent } from "react";

import type { WaveformTrack } from "../../api/cuepointBridge.types";

import { selectCurrentItem, selectDuration, selectPosition } from "../../components/player/playerFormat";
import { usePlayerValue } from "../../components/player/playerStore";
import {
  INSPECTOR_PICTURE_TITLE,
  INSPECTOR_SEEK_TITLE,
  WAVEFORM_LOADING_WORDS,
  trackDetailsWaveformWords,
} from "../../components/waveform/analysisWords";
import { LOUDNESS_LINE_TITLE, loudnessLine, loudnessShort } from "../../components/waveform/loudnessWords";
import { useWaveform } from "../../components/waveform/useWaveforms";
import { useWaveformRequest } from "../../components/waveform/useWaveformRequest";
import { WaveformCanvas } from "../../components/waveform/WaveformCanvas";
import { useWaveformBox } from "../../components/waveform/waveformEnvironment";
import { secondsAtOffset } from "../../components/waveform/waveformLayout";
import { Hint } from "../../components/Hint";

export function TrackWaveform({
  trackId,
  loudnessInFacts = false,
  onReading,
}: {
  trackId: number;
  /**
   * The panel's facts already read the loudness value and its peak, so the line under the
   * picture is kept only for a track with no value, where it says why.
   */
  loudnessInFacts?: boolean;
  /**
   * Tells the panel this track's answer as it arrives, so its facts line reads the
   * loudness from this one request rather than asking again.
   */
  onReading?: (track: WaveformTrack | null) => void;
}) {
  const { box, width } = useWaveformBox<HTMLDivElement>();
  const entry = useWaveform(trackId, width, { marks: true, loudness: true });
  useWaveformRequest(trackId, entry, { loudness: true });

  const current = usePlayerValue(selectCurrentItem);
  const position = usePlayerValue(selectPosition);
  const duration = usePlayerValue(selectDuration);
  const playerSeconds = duration && duration > 0 ? duration : 0;
  const playing = current?.trackId === trackId && playerSeconds > 0;

  const track = entry?.kind === "track" ? entry.track : null;
  const picture = track?.state === "ready" ? track.data : null;
  const words = picture ? null : (trackDetailsWaveformWords(entry) ?? WAVEFORM_LOADING_WORDS);
  const durationMs = playing ? playerSeconds * 1000 : (track?.duration_ms ?? 0);
  const reading = track ?? null;
  useEffect(() => {
    onReading?.(reading);
  }, [onReading, reading]);
  // With the value on the facts (beside its peak, M130), what stays here is why a track has no value.
  const line = loudnessLine(track);
  const loudness = loudnessInFacts && loudnessShort(track) !== null ? null : line;
  // The third strip says what it is and what its marks are (M129, D16).
  const caption = picture
    ? [
        "Whole track",
        track?.marks?.grid?.length ? "lines mark bars" : null,
        track?.marks?.cues?.length ? "flags mark cues" : null,
      ]
        .filter(Boolean)
        .join(" \u00b7 ")
    : null;

  const seek = (event: MouseEvent<HTMLDivElement>) => {
    if (!playing || !picture) return;
    // The canvas's own box: the holder's border is not part of the drawing.
    const drawn = event.currentTarget.querySelector("canvas") ?? event.currentTarget;
    const rect = drawn.getBoundingClientRect();
    void window.cuepoint?.player?.seek(secondsAtOffset(event.clientX - rect.left, rect.width, playerSeconds));
  };

  return (
    <section className="cp-track-detail__waveform" aria-label="Waveform">
      <div
        className={`cp-track-waveform${playing && picture ? " cp-track-waveform--seekable" : ""}`}
        data-testid="inspector-waveform"
        data-playing={playing ? "true" : undefined}
        data-hint={picture ? (playing ? INSPECTOR_SEEK_TITLE : INSPECTOR_PICTURE_TITLE) : (words ?? undefined)}
        onClick={seek}
      >
        {/* The measured box is inside the frame's padding, so the canvas is drawn at its own width. */}
        <div ref={box} className="cp-track-waveform__inner">
          {picture ? (
            <WaveformCanvas
              data={picture}
              durationMs={durationMs}
              cues={track?.marks?.cues}
              grid={track?.marks?.grid}
              playheadMs={playing && position !== null ? position * 1000 : null}
            />
          ) : (
            <p className="cp-track-waveform__words">{words}</p>
          )}
        </div>
      </div>
      {caption ? (
        <p className="cp-track-waveform__loudness" data-testid="inspector-caption">
          {caption}
        </p>
      ) : null}
      {loudness ? (
        <Hint text={LOUDNESS_LINE_TITLE}>
          <p className="cp-track-waveform__loudness" data-testid="inspector-loudness">
            {loudness}
          </p>
        </Hint>
      ) : null}
    </section>
  );
}
