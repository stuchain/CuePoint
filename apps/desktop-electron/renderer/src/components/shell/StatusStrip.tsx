import { useEffect, useRef, useState } from "react";
import type { EngineJobSummary } from "../../api/cuepointBridge.types";
import { useEngineOnline } from "../../api/engineOnline";
import { useLeaveGhost } from "../../tokens/useLeaveGhost";
import { shouldShowOnboarding } from "../firstRunMemory";
import { Button } from "../Button";
import { Hint } from "../Hint";
import { PixelSpinner } from "../PixelSpinner";
import { UpdateStatusItem } from "../updates/UpdateStatusItem";
import { useUpdateState } from "../updates/useUpdateState";
import { ActivityPanel } from "./ActivityPanel";
import { closeActivity, openActivity, useActivityOpen } from "./activityState";
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
              <span className="cp-status__running-label" data-cut-hint="">
                {jobLabel(job)}
              </span>
              {percent !== null && (
                <progress
                  className="cp-progress"
                  value={percent}
                  max={100}
                  aria-label={`Progress: ${jobLabel(job)}`}
                />
              )}
              {canStop(job) && (
                <Button
                  variant="secondary"
                  className="cp-status__cancel"
                  onClick={() => onStop(job)}
                  disabled={stopping === job.id}
                  aria-label={`${jobStopLabel(job)} ${jobLabel(job).toLowerCase()}`}
                >
                  {jobStopLabel(job)}
                </Button>
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
  const activityOpen = useActivityOpen();
  const update = useUpdateState();

  const percent = jobPercent(job);
  const { offline } = useEngineOnline();
  // A failed call can know before the poll does: offline overrides a stale "Ready".
  const connected = status?.connected === true && !offline;
  // Starting is a third state, not a flavour of offline: it ends by itself.
  const starting = status?.starting === true;
  // While the banner above the page is up (`offline`: stopped, restarting, or gave up) it says
  // so in full; the strip stays quiet rather than repeat it in other words.
  const engineText = offline
    ? ""
    : status === null
      ? "Connecting…"
      : connected
        ? "Ready"
        : shouldShowOnboarding()
          ? "Getting ready…"
          : "Starting up…";

  // The strip is there only while it has something to say (C231): work, a message from the
  // player, an engine that is not ready, or an update on its way. Otherwise it takes no room;
  // the live region stays mounted, so a screen reader still hears the state change. A job that
  // just finished keeps the strip up for its pulse (finished is back to 0 after it).
  const updateShown =
    update !== null &&
    (update.status === "downloading" || update.status === "ready" || update.status === "manual");
  const idle = job === null && !playerMessage && !updateShown && finished === 0 && (connected || offline);

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
        openActivity();
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
      <div
        className="cp-status"
        data-finished={finished > 0 ? finished % 2 : undefined}
        data-idle={idle ? "" : undefined}
      >
        <span className="cp-status__live" role="status" aria-live="polite">
        {/* Ready is not drawn (the strip is quiet when all is well); a screen reader still hears it. */}
        <span
          className={`cp-status__engine ${
            connected
              ? "cp-status__engine--ok cp-visually-hidden"
              : starting
                ? "cp-status__engine--reconnecting"
                : "cp-status__engine--error"
          }`}
        >
          {engineText}
        </span>

        {/*
          The player speaks only when it was in use and broke (PLAYER-03).
          "Audio player unavailable" is a different sentence from "Stopped" and
          must not read as one: the background process being down stops
          everything, while a dead player leaves the whole library usable.
        */}
        {playerMessage && (
          <span className="cp-status__player cp-status__engine--error">{playerMessage}</span>
        )}
        </span>

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
                  className="cp-progress"
                  value={percent}
                  max={100}
                  aria-label="Progress"
                />
                <span className="cp-status__percent">{percent}%</span>
              </>
            )}
            {activeCount > 1 && (
              <>
                <Button
                  variant="quiet"
                  className="cp-status__more"
                  ref={moreButton}
                  aria-expanded={listOpen}
                  aria-haspopup="dialog"
                  onClick={() => setListOpen((open) => !open)}
                >
                  +{activeCount - 1} more
                </Button>
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
              <Button
                variant="quiet"
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
              </Button>
            )}
          </span>
        ) : null}

        <UpdateStatusItem />

      </div>

      <ActivityPanel open={activityOpen} onClose={closeActivity} />
    </>
  );
}
