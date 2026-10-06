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
import type { MouseEvent } from "react";

import { selectCurrentItem, selectDuration, selectPosition } from "../../components/player/playerFormat";
import { usePlayerValue } from "../../components/player/playerStore";
import {
  INSPECTOR_PICTURE_TITLE,
  INSPECTOR_SEEK_TITLE,
  WAVEFORM_LOADING_WORDS,
  waveformEntryWords,
} from "../../components/waveform/analysisWords";
import { loudnessLine } from "../../components/waveform/loudnessWords";
import { useWaveform } from "../../components/waveform/useWaveforms";
import { useWaveformRequest } from "../../components/waveform/useWaveformRequest";
import { WaveformCanvas } from "../../components/waveform/WaveformCanvas";
import { useWaveformBox } from "../../components/waveform/waveformEnvironment";
import { secondsAtOffset } from "../../components/waveform/waveformLayout";

export function TrackWaveform({ trackId }: { trackId: number }) {
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
  const words = picture ? null : (waveformEntryWords(entry) ?? WAVEFORM_LOADING_WORDS);
  const durationMs = playing ? playerSeconds * 1000 : (track?.duration_ms ?? 0);
  const loudness = loudnessLine(track);

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
        ref={box}
        className={`cp-track-waveform${playing && picture ? " cp-track-waveform--seekable" : ""}`}
        data-testid="inspector-waveform"
        data-playing={playing ? "true" : undefined}
        title={picture ? (playing ? INSPECTOR_SEEK_TITLE : INSPECTOR_PICTURE_TITLE) : (words ?? undefined)}
        onClick={seek}
      >
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
      {loudness ? (
        <p className="cp-track-waveform__loudness" data-testid="inspector-loudness">
          {loudness}
        </p>
      ) : null}
    </section>
  );
}
