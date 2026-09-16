/**
 * Library Health (CLEAN-12, DEC-075).
 *
 * Counts, each a link. There is no score: a number to worry about replaces a
 * list of things to do (DEC-075). Each count arrives with the rule set that
 * produced it, and clicking it opens the Library with exactly those rules —
 * the page never builds a rule of its own, so what Health says and what the
 * click shows are one statement and cannot disagree.
 *
 * Below the counts, when each detection behind them last ran, with a button to
 * run it again. "No missing files" from a check an hour ago and from no check
 * at all are different facts, and this is where a person can tell which.
 */
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import type { CleanJobStarted, HealthDetection, LibraryHealth } from "../../api/cuepointBridge.types";
import { Button, useToast } from "../../components";
import { libraryRulesState } from "../library/libraryLink";
import { formatWhen, trackCount } from "./cleanFormat";
import { useCleanJob, type CleanMessageTone } from "./useCleanJob";

/** What running each detection is called, by the job that runs it. */
const RUN_LABELS: Record<string, string> = {
  file_check: "Check every file",
  duplicate_scan: "Find duplicates",
  artwork_scan: "Read artwork",
};

const FINISHED_LINES: Record<string, string> = {
  file_check: "Finished checking files.",
  duplicate_scan: "Finished looking for duplicates.",
  artwork_scan: "Finished reading artwork.",
};

export interface HealthViewProps {
  health: LibraryHealth | null;
  error: string | null;
  loading: boolean;
  onHealthChanged: () => void;
}

export function HealthView({ health, error, loading, onHealthChanged }: HealthViewProps) {
  const navigate = useNavigate();
  const { push } = useToast();
  const message = useCallback(
    (text: string, tone: CleanMessageTone) => push(text, tone),
    [push],
  );
  const jobs = useCleanJob(message);

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
        push("That needs the desktop app with the engine connected.", "warning");
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
        {trackCount(health.track_count)} in your library. Each number opens the Library on exactly
        the tracks it counts.
      </p>

      <ul className="clean-health__counts" aria-label="Library Health">
        {health.counts.map((count) => (
          <li key={count.id}>
            <button
              type="button"
              className="clean-health__count"
              data-zero={count.count === 0 ? "true" : undefined}
              aria-label={`${count.count.toLocaleString()} ${count.label}: open in the Library`}
              onClick={() => navigate("/library", { state: libraryRulesState(count.rules) })}
            >
              <span className="clean-health__number">{count.count.toLocaleString()}</span>
              <span className="clean-health__label">{count.label}</span>
            </button>
          </li>
        ))}
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
                  : "Never run"}
              </span>
              {detection.last_summary && (
                <span className="clean-health__detection-summary">{detection.last_summary}</span>
              )}
            </div>
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
