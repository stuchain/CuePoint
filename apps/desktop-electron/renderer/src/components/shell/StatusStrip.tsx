import { useEffect, useRef, useState } from "react";
import type { EngineJobSummary } from "../../api/cuepointBridge.types";
import { useLeaveGhost } from "../../tokens/useLeaveGhost";
import { Hint } from "../Hint";
import { PixelSpinner } from "../PixelSpinner";
import { UpdateStatusItem } from "../updates/UpdateStatusItem";
import { ActivityPanel } from "./ActivityPanel";
import { modifierName } from "./platformKeys";
import { jobLabel, jobPercent, jobStopLabel, jobTitle, useActiveJob } from "./useActiveJob";
import { useEngineStatus } from "./useEngineStatus";
import { usePlayerStatusMessage } from "./usePlayerStatus";
import "./StatusStrip.css";

/**
 * The shell's status strip (DEC-026).
 *
 * Two things Phase 1 built and nothing displayed: engine state, which was a
 * floating banner read once and never refreshed, and job records, which have
 * been durable since FOUNDATION-07 without ever being shown. Both live here
 * now, in a strip that is always on screen.
 *
 * `EngineStatusBanner` is not rendered alongside this — its markup moved here
 * and the floating banner is gone, so there is one place that reports engine
 * state rather than two that can disagree.
 *
 * Clicking through to the Activity panel is the other half of DEC-026: the
 * strip is the only entry point to a feed that has been recorded since Phase 1
 * and never shown.
 */
/** The Activity button's reason, with the shortcut the keyboard handler below answers to. */
function activityHint(): string {
  return `Activity: what CuePoint has done (${modifierName()}+Shift+A)`;
}

/**
 * Everything that is running, from "+N more" (STR-5).
 *
 * A popover, not a modal: it names the work and stops it, and the rest of the
 * window stays usable. It closes on Escape (returning focus to its button) and on
 * a click anywhere outside it. Fixed to the viewport because the strip clips what
 * overflows it.
 */
function RunningList({
  jobs,
  activeCount,
  button,
  onStop,
  stopping,
  canStop,
  onClose,
}: {
  jobs: EngineJobSummary[];
  activeCount: number;
  button: HTMLButtonElement | null;
  onStop: (job: EngineJobSummary) => void;
  stopping: string | null;
  canStop: (job: EngineJobSummary) => boolean;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  useLeaveGhost(box);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        button?.focus();
      }
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && (box.current?.contains(target) || button?.contains(target))) return;
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [button, onClose]);

  const rect = button?.getBoundingClientRect();
  const style = rect
    ? { left: Math.max(4, rect.left), bottom: Math.max(4, window.innerHeight - rect.top + 4) }
    : undefined;
  const hidden = activeCount - jobs.length;

  return (
    <div className="cp-status__running" role="dialog" aria-label="Running now" ref={box} style={style}>
      <ul className="cp-status__running-list">
        {jobs.map((job) => {
          const percent = jobPercent(job);
          return (
            <li className="cp-status__running-item" key={job.id}>
              <span className="cp-status__running-label" title={jobTitle(job)}>
                {jobLabel(job)}
              </span>
              {percent !== null && (
                <progress
                  className="cp-status__progress"
                  value={percent}
                  max={100}
                  aria-label={`Progress: ${jobLabel(job)}`}
                />
              )}
              {canStop(job) && (
                <button
                  type="button"
                  className="cp-status__cancel"
                  onClick={() => onStop(job)}
                  disabled={stopping === job.id}
                  aria-label={`${jobStopLabel(job)} ${jobLabel(job).toLowerCase()}`}
                >
                  {jobStopLabel(job)}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {hidden > 0 && <p className="cp-status__running-note">and {hidden} more</p>}
    </div>
  );
}

export function StatusStrip() {
  const status = useEngineStatus();
  // The message, not the snapshot: the strip must not repaint every time the
  // playback position moves (PLAYER-06).
  const playerMessage = usePlayerStatusMessage();
  const { job, jobs, activeCount } = useActiveJob();
  const [listOpen, setListOpen] = useState(false);
  // The popover belongs to "+N more"; once that is gone it must not come back
  // unasked the next time two things run.
  useEffect(() => {
    if (activeCount <= 1) setListOpen(false);
  }, [activeCount]);
  const moreButton = useRef<HTMLButtonElement | null>(null);
  // A job that finishes pulses the strip once (feedback, DEC-154).
  const [finished, setFinished] = useState(0);
  const hadJob = useRef(false);
  useEffect(() => {
    const has = job !== null;
    if (hadJob.current && !has) {
      setFinished((n) => n + 1);
      const timer = window.setTimeout(() => setFinished(0), 800);
      hadJob.current = has;
      return () => window.clearTimeout(timer);
    }
    hadJob.current = has;
  }, [job]);
  const [activityOpen, setActivityOpen] = useState(false);

  const percent = jobPercent(job);
  const connected = status?.connected === true;
  const reconnecting = status?.reconnecting === true;
  // Starting is a third state, not a flavour of offline: it ends by itself.
  const starting = status?.starting === true;
  // Offered only once the automatic attempts have given up (DEC-028): a button
  // competing with a restart already in flight helps nobody — and an engine
  // still unpacking itself is not one to restart, which is what "Restart
  // engine" offered for the first ten seconds on a Mac.
  const canRestart =
    status !== null &&
    !connected &&
    !reconnecting &&
    !starting &&
    Boolean(window.cuepoint?.restartEngine);
  const [restarting, setRestarting] = useState(false);

  const restart = async () => {
    setRestarting(true);
    try {
      await window.cuepoint?.restartEngine?.();
    } finally {
      setRestarting(false);
    }
  };

  /**
   * Stopping the work the strip is reporting (ORG-13).
   *
   * Here rather than on the page that started it, because this is where a
   * running job is visible from anywhere in the app — and because a batch over
   * everything a query matches can outlive the screen it was started from,
   * which is the whole point of it being a job. Before this only inKey had a
   * Cancel, beside its own progress, so "cancellable" was true of the engine
   * and unavailable to the user for every other job.
   *
   * Work already applied stays applied and the job reports how far it got
   * (DEC-063), so this asks rather than undoes — which is what the label says.
   */
  const [cancelling, setCancelling] = useState<string | null>(null);
  const canCancel = (candidate: EngineJobSummary) =>
    candidate.state === "running" && Boolean(window.cuepoint?.cancelJob);

  const cancel = async (target: EngineJobSummary) => {
    setCancelling(target.id);
    try {
      await window.cuepoint?.cancelJob?.(target.id);
    } catch {
      // A cancel that cannot be delivered is not worth an error of its own:
      // the job carries on and the strip keeps saying so, which is the honest
      // outcome either way.
    } finally {
      setCancelling(null);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setActivityOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    // The panel is a sibling of the strip, not a child of it. Rendered inside,
    // it inherited the strip's `white-space: nowrap` and every event summary
    // refused to wrap — a dialog silently picking up the styling of whatever
    // happened to render it.
    <>
      {/*
        The live region is only the status text. The Hint tooltip and the running
        list open from inside the strip and would otherwise be announced as
        status updates.
      */}
      <div className="cp-status" data-finished={finished > 0 ? finished % 2 : undefined}>
        <span className="cp-status__live" role="status" aria-live="polite">
        <span
          className={`cp-status__engine ${
            connected
              ? "cp-status__engine--ok"
              : reconnecting || starting
                ? "cp-status__engine--reconnecting"
                : "cp-status__engine--error"
          }`}
          // The raw reason is for the hover and Diagnostics, never the strip's
          // text (DEC-155).
          title={connected || reconnecting || starting ? undefined : status?.error}
        >
          {status === null
            ? "Connecting…"
            : connected
              ? "Ready"
              : reconnecting
                ? `Reconnecting…${
                    status.restartAttempts ? ` (attempt ${status.restartAttempts} of 3)` : ""
                  }`
                : starting
                  ? "Starting up…"
                  : "CuePoint's library service stopped"}
        </span>

        {/*
          The player speaks only when it was in use and broke (PLAYER-03).
          "Audio player unavailable" is a different sentence from "CuePoint's
          library service stopped" and must not read as one: the service being
          down stops everything, while a dead player leaves the whole library
          usable.
        */}
        {playerMessage && (
          <span className="cp-status__player cp-status__engine--error">{playerMessage}</span>
        )}
        </span>

        {canRestart && (
          <button
            type="button"
            className="cp-status__restart"
            onClick={() => void restart()}
            disabled={restarting}
          >
            {restarting ? "Restarting…" : "Restart library service"}
          </button>
        )}

        {job ? (
          <span className="cp-status__job">
            <PixelSpinner label={null} />
            {/* Focusable, so the reason it carries is shown to the keyboard too. */}
            <Hint text={jobTitle(job)}>
              <span className="cp-status__job-label" tabIndex={0} aria-live="polite">
                {jobLabel(job)}
              </span>
            </Hint>
            {percent !== null && (
              <>
                {/*
                  A progress element rather than a styled div: it reports its
                  own value to assistive technology, which a bar drawn with CSS
                  width does not.
                */}
                <progress
                  className="cp-status__progress"
                  value={percent}
                  max={100}
                  aria-label="Progress"
                />
                <span className="cp-status__percent">{percent}%</span>
              </>
            )}
            {activeCount > 1 && (
              <>
                <button
                  type="button"
                  className="cp-status__more"
                  ref={moreButton}
                  aria-expanded={listOpen}
                  aria-haspopup="dialog"
                  onClick={() => setListOpen((open) => !open)}
                >
                  +{activeCount - 1} more
                </button>
                {listOpen && (
                  <RunningList
                    jobs={jobs}
                    activeCount={activeCount}
                    button={moreButton.current}
                    onStop={(target) => void cancel(target)}
                    stopping={cancelling}
                    canStop={canCancel}
                    onClose={() => setListOpen(false)}
                  />
                )}
              </>
            )}
            {canCancel(job) && (
              <button
                type="button"
                className="cp-status__cancel"
                onClick={() => void cancel(job)}
                disabled={cancelling === job.id}
                // Named, because the strip can be reporting any of four kinds
                // of work and "Cancel" alone would not say which stops. The
                // waveform analysis's Stop is a Pause, kept across a restart
                // (WAVE-03), and says so.
                aria-label={`${jobStopLabel(job)} ${jobLabel(job).toLowerCase()}`}
              >
                {cancelling === job.id
                  ? jobStopLabel(job) === "Pause"
                    ? "Pausing…"
                    : "Stopping…"
                  : jobStopLabel(job)}
              </button>
            )}
          </span>
        ) : null}

        <UpdateStatusItem />

        <Hint text={activityHint()}>
          <button
            type="button"
            className="cp-status__activity"
            onClick={() => setActivityOpen(true)}
          >
            Activity
          </button>
        </Hint>
      </div>

      <ActivityPanel open={activityOpen} onClose={() => setActivityOpen(false)} />
    </>
  );
}
