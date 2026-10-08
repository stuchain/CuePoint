/**
 * Library Health (CLEAN-12, DEC-075).
 *
 * Counts, each a link. There is no score: a number to worry about replaces a
 * list of things to do (DEC-075). Each count arrives with the rule set that
 * produced it. A count that Clean has a tab for opens that tab (FLW-14):
 * missing files, duplicates and what waits for you. The rest open the Library
 * with exactly those rules — the page never builds a rule of its own, so what
 * Health says and what the click shows are one statement and cannot disagree.
 *
 * Below the counts, when each detection behind them last ran, with a button to
 * run it again. "No missing files" from a check an hour ago and from no check
 * at all are different facts, and this is where a person can tell which.
 *
 * The waveform analysis (WAVE-03) is a detection of another kind: it runs on
 * its own after every check and can take hours, so its row says how far it has
 * got and offers Pause, Resume, or "Analyze waveforms" when it is idle, rather
 * than a button that starts it once.
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import type { CleanJobStarted, HealthDetection, LibraryHealth } from "../../api/cuepointBridge.types";
import { Button, useToast } from "../../components";
import {
  ACTION_LABELS,
  analysisAction,
  analysisWords,
} from "../../components/waveform/analysisWords";
import { useWaveformAnalysis } from "../../components/waveform/useWaveformAnalysis";
import { libraryRulesState } from "../library/libraryLink";
import { formatWhen, trackCount } from "./cleanFormat";
import { CLEAN_SECTIONS, type CleanSection } from "./cleanSections";
import { useCleanJob, type CleanMessageTone } from "./useCleanJob";

/** What running each detection is called, by the job that runs it. */
const RUN_LABELS: Record<string, string> = {
  file_check: "Check every file",
  duplicate_scan: "Find duplicates",
  artwork_scan: "Read cover art",
};

/** The detection the waveform analysis's own controls stand in for. */
const WAVEFORM_ANALYSIS = "waveform_analysis";

/** What each check is for, in a line (CLN-9); the check's own name comes from the engine. */
const PURPOSES: Record<string, string> = {
  files: "Looks for tracks whose file has moved or been deleted.",
  duplicates: "Groups tracks that share a file, a Beatport track, or an artist and title.",
  artwork: "Reads the cover pictures stored inside your audio files.",
  waveforms: "Draws each track's waveform so you can see its shape before you play it.",
};

/** The counts Clean has a tab for: the tab fixes what the count says (FLW-14). */
const COUNT_TABS: Readonly<Record<string, CleanSection>> = {
  missing_files: "missing",
  duplicates: "duplicates",
  needs_review: "review",
};

/**
 * What a count means when its name alone invites a wrong guess. "No Beatport
 * key" is not "Not looked up yet": a matched track whose Beatport record has no
 * key is in the first and not the second.
 */
const COUNT_HINTS: Readonly<Record<string, string>> = {
  missing_key:
    "A matched track can still have no key, when Beatport's record has none, so this is not the same as Not looked up yet.",
};

const FINISHED_LINES: Record<string, string> = {
  file_check: "Finished checking files.",
  duplicate_scan: "Finished looking for duplicates.",
  artwork_scan: "Finished reading cover art.",
};

interface HealthViewProps {
  health: LibraryHealth | null;
  error: string | null;
  loading: boolean;
  onHealthChanged: () => void;
  /** Open one of Clean's tabs, for the counts that have one. */
  onOpenSection: (section: CleanSection) => void;
}

export function HealthView({
  health,
  error,
  loading,
  onHealthChanged,
  onOpenSection,
}: HealthViewProps) {
  const navigate = useNavigate();
  const { push } = useToast();
  const message = useCallback(
    (text: string, tone: CleanMessageTone) => push(text, tone),
    [push],
  );
  const jobs = useCleanJob(message);
  const waveforms = useWaveformAnalysis();

  const waveformStatus = waveforms.status;
  const waveformAction = waveformStatus ? analysisAction(waveformStatus) : null;
  const pressWaveforms = useCallback(async () => {
    if (waveformAction === null) return;
    const refusal =
      waveformAction === "pause" ? await waveforms.pause() : await waveforms.resume();
    if (refusal) {
      push(refusal.message, "warning");
    } else if (waveformAction === "pause") {
      push(
        "Waveform analysis paused. It stays paused, after a restart too, until you resume it.",
        "info",
      );
    }
  }, [push, waveformAction, waveforms]);

  const run = useCallback(
    (detection: HealthDetection) => {
      const bridge = window.cuepoint;
      let start: (() => Promise<CleanJobStarted>) | undefined;
      if (detection.job_type === "file_check" && bridge?.startFileCheck) {
        const begin = bridge.startFileCheck;
        start = () => begin({ selection: { query: {} } });
      } else if (detection.job_type === "duplicate_scan" && bridge?.startDuplicateScan) {
        const begin = bridge.startDuplicateScan;
        start = () => begin({});
      } else if (detection.job_type === "artwork_scan" && bridge?.startArtworkScan) {
        const begin = bridge.startArtworkScan;
        start = () => begin({ selection: { query: {} } });
      }
      if (!start) {
        push("That needs the desktop app with CuePoint's library service running.", "warning");
        return;
      }
      void jobs.run(detection.job_type, start, {
        succeeded: FINISHED_LINES[detection.job_type],
        onEnded: onHealthChanged,
      });
    },
    [jobs, onHealthChanged, push],
  );

  if (!health) {
    return (
      <div className="clean-health">
        <p className="clean-empty__hint" role={error ? "alert" : undefined}>
          {error ?? (loading ? "Counting…" : "Nothing to count.")}
        </p>
      </div>
    );
  }

  return (
    <div className="clean-health">
      {health.unavailable_roots.length > 0 && (
        <div className="clean-note">
          {health.unavailable_roots.map((root) => (
            <p key={root.root} className="clean-note__finding" role="status">
              At the last check: {root.summary}.
            </p>
          ))}
        </div>
      )}

      <p className="clean-health__intro">
        {trackCount(health.track_count)} in your library.
      </p>

      <ul className="clean-health__counts" aria-label="Library Health">
        {health.counts.map((count) => {
          const tab = COUNT_TABS[count.id];
          const tabLabel = tab ? CLEAN_SECTIONS.find((entry) => entry.id === tab)?.label : undefined;
          const hint = COUNT_HINTS[count.id];
          return (
            <li key={count.id}>
              <button
                type="button"
                className="clean-health__count"
                data-zero={count.count === 0 ? "true" : undefined}
                aria-label={`${count.count.toLocaleString()} ${count.label}: open ${tabLabel ?? "in the Library"}`}
                onClick={() =>
                  tab
                    ? onOpenSection(tab)
                    : navigate("/library", { state: libraryRulesState(count.rules) })
                }
              >
                <span className="clean-health__number">{count.count.toLocaleString()}</span>
                <span className="clean-health__label">{count.label}</span>
              </button>
              {hint && <p className="clean-health__count-hint">{hint}</p>}
            </li>
          );
        })}
      </ul>

      <h2 className="clean-health__heading">Checks</h2>
      <ul className="clean-health__detections" aria-label="Checks">
        {health.detections.map((detection) => (
          <li key={detection.id} className="clean-health__detection">
            <div className="clean-health__detection-text">
              <span className="clean-health__detection-label">{detection.label}</span>
              <span className="clean-health__detection-when">
                {detection.last_run_at
                  ? `Last run ${formatWhen(detection.last_run_at)}`
                  : "Not done yet"}
              </span>
              {PURPOSES[detection.id] && (
                <span className="clean-health__detection-purpose">{PURPOSES[detection.id]}</span>
              )}
              {detection.last_summary && (
                <span className="clean-health__detection-summary">{detection.last_summary}</span>
              )}
              {detection.job_type === WAVEFORM_ANALYSIS && waveforms.supported && (
                <span className="clean-health__detection-summary" role="status">
                  {waveformStatus
                    ? analysisWords(waveformStatus)
                    : (waveforms.error ?? "Reading the analysis…")}
                </span>
              )}
            </div>
            {detection.job_type === WAVEFORM_ANALYSIS && waveformAction !== null && (
              <Button
                variant="secondary"
                loading={waveforms.busy}
                onClick={() => void pressWaveforms()}
              >
                {ACTION_LABELS[waveformAction]}
              </Button>
            )}
            {RUN_LABELS[detection.job_type] && (
              <Button
                variant="secondary"
                loading={jobs.running === detection.job_type}
                disabled={jobs.running !== null && jobs.running !== detection.job_type}
                onClick={() => run(detection)}
              >
                {RUN_LABELS[detection.job_type]}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
