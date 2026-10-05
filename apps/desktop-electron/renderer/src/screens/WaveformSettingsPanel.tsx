import { useEffect, useRef, useState } from "react";

import { Button, Modal, Panel } from "../components";
import { selectCurrentItem, selectPosition } from "../components/player/playerFormat";
import { usePlayerValue } from "../components/player/playerStore";
import {
  ACTION_LABELS,
  PREVIEW_EMPTY_WORDS,
  analysisAction,
  analysisWords,
  deleteDataWords,
  deletedWords,
  sizeWords,
  waveformStateWords,
} from "../components/waveform/analysisWords";
import { useWaveform } from "../components/waveform/useWaveforms";
import { useWaveformAnalysis } from "../components/waveform/useWaveformAnalysis";
import { WaveformCanvas } from "../components/waveform/WaveformCanvas";
import { WAVEFORM_COLOUR_OPTIONS, useWaveformColour } from "../components/waveform/waveformColour";
import { requestWidth } from "../components/waveform/waveformLayout";
import { useScale } from "../tokens/ScaleContext";
import "./waveform-settings.css";

/** The width of a box, followed as it changes. */
function useBoxWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = box.current;
    if (!element) return undefined;
    const measure = () => setWidth(element.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [box, width];
}

/**
 * The colour choice, shown on the track in the player: the waveform a person
 * knows, rather than a made-up one, with its cues, grid and playhead.
 */
function WaveformPreview() {
  const item = usePlayerValue(selectCurrentItem);
  const position = usePlayerValue(selectPosition);
  const { scale } = useScale();
  const [box, cssWidth] = useBoxWidth();
  const width = requestWidth(cssWidth, scale, window.devicePixelRatio || 1);
  const trackId = item?.trackId ?? null;
  const entry = useWaveform(trackId, width, { marks: true });

  let words: string | null = null;
  if (!item) words = PREVIEW_EMPTY_WORDS;
  else if (trackId === null) words = "The track in the player is not in the library.";
  else if (!entry || entry.kind === "loading") words = "Reading its waveform…";
  else if (entry.kind === "unknown") words = "The track in the player is not in the library.";
  else if (entry.kind === "error") words = `Its waveform could not be read: ${entry.message}`;
  else if (entry.track.state !== "ready" || !entry.track.data) {
    words = waveformStateWords(entry.track, entry.paused);
  }
  const track = entry?.kind === "track" ? entry.track : null;

  return (
    <div className="cp-waveform-settings__preview">
      <span className="cp-waveform-settings__label">
        Preview
        {item ? <span className="cp-waveform-settings__track"> · {item.artist} – {item.title}</span> : null}
      </span>
      <div ref={box} className="cp-waveform-settings__canvas" data-testid="waveform-preview">
        {words === null && track?.data ? (
          <WaveformCanvas
            data={track.data}
            durationMs={track.duration_ms ?? 0}
            cues={track.marks?.cues}
            grid={track.marks?.grid}
            playheadMs={position === null ? null : position * 1000}
          />
        ) : (
          <p className="cp-waveform-settings__words">{words}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Settings → Waveforms (WAVE-05, DEC-116, DEC-117).
 *
 * The analysis's state in the words the Health view uses, its one button, the
 * colour choice with a preview, and "Delete waveform data…", which says what
 * it costs before it does it: the size on disk, and a whole library analysed
 * again.
 */
export function WaveformSettingsPanel() {
  const analysis = useWaveformAnalysis();
  const [mode, setMode] = useWaveformColour();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { status } = analysis;
  const action = status ? analysisAction(status) : null;

  const runAction = async () => {
    if (!action) return;
    setMessage(null);
    const refusal = action === "pause" ? await analysis.pause() : await analysis.resume();
    if (refusal) setMessage(refusal.message);
  };

  const deleteData = async () => {
    setMessage(null);
    const answer = await analysis.deleteData();
    setConfirming(false);
    if (!answer) return;
    if (answer.refusal) setMessage(answer.refusal.message);
    else setMessage(deletedWords(answer.value.waveforms, answer.value.freed_bytes));
  };

  return (
    <Panel title="Waveforms">
      <div className="cp-waveform-settings">
        {!analysis.supported ? (
          <p className="cp-waveform-settings__hint">
            Open CuePoint as a desktop app to analyse waveforms.
          </p>
        ) : (
          <div className="cp-waveform-settings__state">
            <p className="cp-waveform-settings__status" role="status" data-testid="waveform-analysis-state">
              {analysis.error ?? (status ? analysisWords(status) : "Reading the analysis…")}
            </p>
            {action ? (
              <Button variant="secondary" loading={analysis.busy} onClick={() => void runAction()}>
                {ACTION_LABELS[action]}
              </Button>
            ) : null}
          </div>
        )}

        <fieldset className="cp-waveform-settings__choice">
          <legend className="cp-waveform-settings__label">Colours</legend>
          {WAVEFORM_COLOUR_OPTIONS.map((option) => (
            <label key={option.mode} className="cp-waveform-settings__option">
              <input
                type="radio"
                name="waveform-colour"
                value={option.mode}
                checked={mode === option.mode}
                onChange={() => setMode(option.mode)}
              />
              <span>{option.label}</span>
            </label>
          ))}
          <p className="cp-waveform-settings__hint">
            Three bands draws the lows, mids and highs in colours of their own, as Rekordbox does. One
            colour draws the whole sound in one.
          </p>
        </fieldset>

        <WaveformPreview />

        {analysis.supported ? (
          <div className="cp-waveform-settings__delete">
            <Button
              variant="danger"
              disabled={analysis.busy || !status}
              onClick={() => {
                setMessage(null);
                setConfirming(true);
              }}
            >
              Delete waveform data…
            </Button>
            <p className="cp-waveform-settings__hint">
              {status ? `Waveform data takes ${sizeWords(status.store_bytes)} on disk.` : null}
            </p>
          </div>
        ) : null}

        {message ? (
          <p className="cp-waveform-settings__message" role="status">
            {message}
          </p>
        ) : null}
      </div>

      <Modal
        open={confirming}
        title="Delete waveform data?"
        onClose={() => setConfirming(false)}
        primaryAction={{
          label: "Delete waveform data",
          onClick: () => void deleteData(),
          loading: analysis.busy,
        }}
        secondaryAction={{ label: "Cancel", onClick: () => setConfirming(false) }}
      >
        {deleteDataWords(status).map((line) => (
          <p key={line} className="cp-waveform-settings__confirm">
            {line}
          </p>
        ))}
      </Modal>
    </Panel>
  );
}
