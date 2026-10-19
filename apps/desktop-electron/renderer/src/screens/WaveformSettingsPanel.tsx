import { useId, useState } from "react";
import { Link } from "react-router-dom";

import { Button, DisclosureArrow, Loading, Modal, MoreAbout, Panel } from "../components";
import { needsDesktopApp } from "../api/userMessage";
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
import { WAVEFORM_DETAIL_DEFAULT, useWaveformDetailSetting } from "../components/waveform/waveformDetailSetting";
import { useWaveformBox } from "../components/waveform/waveformEnvironment";
import { ResetToDefaults } from "./ResetToDefaults";
import { PanelTools, SettingsActions, SettingsHint, SettingsStatus } from "./SettingsParts";
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
  const [detailOn, setDetailOn] = useWaveformDetailSetting();
  const colorsId = useId();
  const [confirming, setConfirming] = useState(false);
  const [diskOpen, setDiskOpen] = useState(false);
  const diskId = useId();
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

  const chooseDetail = (on: boolean) => {
    setDetailOn(on);
    markSaved();
  };

  // SET-11: the color choice and the zoomed strip reset; the analysis itself is not a setting.
  const resetColors = () => {
    const before = { mode, detailOn };
    setMode(WAVEFORM_COLOUR_DEFAULT);
    setDetailOn(WAVEFORM_DETAIL_DEFAULT);
    markSaved();
    return () => {
      setMode(before.mode);
      setDetailOn(before.detailOn);
      markSaved();
    };
  };

  const nothingToAnalyze = status?.state === "idle" && status.present === 0;

  return (
    <Panel
      title="Waveforms"
      badge={
        <PanelTools
          saved={<SavedTick signal={saved} />}
          reset={<ResetToDefaults section="Waveforms" onReset={resetColors} />}
        />
      }
    >
      <div className="cp-waveform-settings">
        {!analysis.supported ? (
          <SettingsStatus>{needsDesktopApp("Analyzing waveforms")}</SettingsStatus>
        ) : (
          <SettingsStatus role="status" data-testid="waveform-analysis-state">
            {analysis.error ??
              (nothingToAnalyze ? (
                <>
                  {NOTHING_TO_ANALYZE_WORDS} <Link to="/clean">Check files on the Clean page.</Link>
                </>
              ) : status ? (
                analysisWords(status)
              ) : (
                <Loading what="the analysis" />
              ))}
          </SettingsStatus>
        )}

        <fieldset className="cp-waveform-settings__choice">
          <legend id={colorsId}>Colors</legend>
          {WAVEFORM_COLOUR_OPTIONS.map((option) => (
            <label key={option.mode} className="cp-waveform-settings__option settings-check">
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
          <MoreAbout describedBy={colorsId}>
            <SettingsHint>
              Three bands draws the lows, mids and highs in colors of their own, as Rekordbox does.
              One color draws the whole sound in one.
            </SettingsHint>
          </MoreAbout>
        </fieldset>

        <div className="cp-waveform-settings__choice settings-option">
          <label className="cp-waveform-settings__option settings-check">
            <input
              type="checkbox"
              checked={detailOn}
              onChange={(event) => chooseDetail(event.target.checked)}
            />
            <span>Zoomed waveform above the player</span>
          </label>
          <SettingsHint>
            Shows about 8 seconds either side of the playhead, scrolling as the track plays, with a
            line on every beat and a stronger one on each bar. Beat lines come from the grid
            Rekordbox wrote; a track without one has none.
          </SettingsHint>
        </div>

        <WaveformPreview />

        {analysis.supported ? (
          <div className="cp-waveform-settings__disk">
            <button
              type="button"
              className="cp-waveform-settings__fold"
              aria-expanded={diskOpen}
              aria-controls={diskId}
              onClick={() => setDiskOpen((open) => !open)}
            >
              <DisclosureArrow open={diskOpen} />
              Disk space
            </button>
            {diskOpen ? (
              <div id={diskId} className="cp-waveform-settings__delete">
                <SettingsHint>{status ? `Waveforms take ${sizeWords(status.store_bytes)}.` : null}</SettingsHint>
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
            ) : null}
          </div>
        ) : null}

        {message ? <SettingsStatus role="status" className="cp-waveform-settings__message">{message}</SettingsStatus> : null}

        <SettingsActions>
          {analysis.supported && action ? (
            <Button variant="secondary" loading={analysis.busy} onClick={() => void runAction()}>
              {ACTION_LABELS[action]}
            </Button>
          ) : null}
        </SettingsActions>
      </div>

      <Modal
        open={confirming}
        title="Delete waveform data?"
        variant="danger"
        size="small"
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
