import { useState } from "react";
import { Link } from "react-router-dom";

import { Button, Modal, Panel } from "../components";
import { SavedTick, useSavedSignal } from "../components/SavedTick";
import { selectCurrentItem, selectPosition } from "../components/player/playerFormat";
import { usePlayerValue } from "../components/player/playerStore";
import {
  ACTION_LABELS,
  NOTHING_TO_ANALYZE_WORDS,
  PREVIEW_EMPTY_WORDS,
  WAVEFORM_LOADING_WORDS,
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
import {
  WAVEFORM_COLOUR_DEFAULT,
  WAVEFORM_COLOUR_OPTIONS,
  useWaveformColour,
} from "../components/waveform/waveformColour";
import { useWaveformBox } from "../components/waveform/waveformEnvironment";
import { ResetToDefaults } from "./ResetToDefaults";
import "./waveform-settings.css";

/**
 * The color choice, shown on the track in the player: the waveform a person
 * knows, rather than a made-up one, with its cues, grid and playhead.
 */
function WaveformPreview() {
  const item = usePlayerValue(selectCurrentItem);
  const position = usePlayerValue(selectPosition);
  const { box, width } = useWaveformBox<HTMLDivElement>();
  const trackId = item?.trackId ?? null;
  const entry = useWaveform(trackId, width, { marks: true });

  let words: string | null = null;
  if (!item) words = PREVIEW_EMPTY_WORDS;
  else if (trackId === null) words = "The track in the player is not in the library.";
  else if (!entry || entry.kind === "loading") words = WAVEFORM_LOADING_WORDS;
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
 * color choice with a preview, and "Delete waveform data…" under "Disk space",
 * which says what it costs before it does it: the size on disk, and a whole
 * library analyzed again (SET-6).
 */
export function WaveformSettingsPanel() {
  const analysis = useWaveformAnalysis();
  const [mode, setMode] = useWaveformColour();
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, markSaved] = useSavedSignal();
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

  const chooseMode = (next: typeof mode) => {
    setMode(next);
    markSaved();
  };

  // SET-11: the color choice is the one setting here that resets.
  const resetColors = () => {
    const before = mode;
    setMode(WAVEFORM_COLOUR_DEFAULT);
    markSaved();
    return () => {
      setMode(before);
      markSaved();
    };
  };

  const nothingToAnalyze = status?.state === "idle" && status.present === 0;

  return (
    <Panel title="Waveforms" badge={<SavedTick signal={saved} />}>
      <div className="cp-waveform-settings">
        <p className="cp-waveform-settings__hint">
          Waveforms are drawn from your audio files, in the background, a few at a time.
        </p>

        {!analysis.supported ? (
          <p className="cp-waveform-settings__hint">
            Open CuePoint as a desktop app to analyze waveforms.
          </p>
        ) : (
          <div className="cp-waveform-settings__state">
            <p className="cp-waveform-settings__status" role="status" data-testid="waveform-analysis-state">
              {analysis.error ??
                (nothingToAnalyze ? (
                  <>
                    {NOTHING_TO_ANALYZE_WORDS} <Link to="/clean">Check files on the Clean page.</Link>
                  </>
                ) : status ? (
                  analysisWords(status)
                ) : (
                  "Reading the analysis…"
                ))}
            </p>
            {action ? (
              <Button variant="secondary" loading={analysis.busy} onClick={() => void runAction()}>
                {ACTION_LABELS[action]}
              </Button>
            ) : null}
          </div>
        )}

        <fieldset className="cp-waveform-settings__choice">
          <legend className="cp-waveform-settings__label">Colors</legend>
          {WAVEFORM_COLOUR_OPTIONS.map((option) => (
            <label key={option.mode} className="cp-waveform-settings__option">
              <input
                type="radio"
                name="waveform-colour"
                value={option.mode}
                checked={mode === option.mode}
                onChange={() => chooseMode(option.mode)}
              />
              <span>{option.label}</span>
            </label>
          ))}
          <p className="cp-waveform-settings__hint">
            Three bands draws the lows, mids and highs in colors of their own, as Rekordbox does. One
            color draws the whole sound in one.
          </p>
          <div className="cp-waveform-settings__reset">
            <ResetToDefaults
              section="Waveforms"
              summary="This sets the colors to Three bands."
              onReset={resetColors}
            />
          </div>
        </fieldset>

        <WaveformPreview />

        {analysis.supported ? (
          <details className="cp-waveform-settings__disk">
            <summary>Disk space</summary>
            <div className="cp-waveform-settings__delete">
              <p className="cp-waveform-settings__hint">
                {status ? `Waveforms take ${sizeWords(status.store_bytes)}.` : null}
              </p>
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
            </div>
          </details>
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
