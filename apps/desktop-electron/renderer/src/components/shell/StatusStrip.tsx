import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import type { EngineJobSummary } from "../../api/cuepointBridge.types";
import { useEngineOnline } from "../../api/engineOnline";
import { DISK_FULL_WORDS, useStripMessages } from "../../api/stripMessages";
import { useLayerStack } from "../../hooks/useLayerStack";
import { usePresence } from "../../tokens/usePresence";
import { Button } from "../Button";
import { Hint } from "../Hint";
import { PixelSpinner } from "../PixelSpinner";
import { UpdateStatusItem } from "../updates/UpdateStatusItem";
import { getRestoreSnapshot, stopWaiting, subscribeRestore } from "../../screens/backups/restoreStore";
import { ActivityButton } from "./ActivityButton";
import { ActivityPanel } from "./ActivityPanel";
import { closeActivity, openActivity, useActivityOpen } from "./activityState";
import { isDialogOpen } from "./shellKeyboard";
import { jobDoneLine, jobLabel, jobPercent, jobStopLabel, jobTitle, useActiveJob } from "./useActiveJob";
import { useBeatportSignIn } from "./useBeatportSignIn";
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
 * The strip is one row tall for good (M367, D25): it does not appear and vanish around a job,
 * which moved the player bar, the table's last rows and the toasts twice for every match or
 * import. At rest it says "Ready"; a job's progress, then "Done · …", take its place. At its
 * right end are the Beatport sign-in state (M522) and the Activity button (M273): Activity is a
 * dialog over the page, not a page, so its button sits beside the jobs it lists.
 */

/** How long "Done · …" stays before the strip goes back to its idle words. */
export const DONE_HOLD_MS = 30_000;

/**
 * Everything that is running, from "+N more" (STR-5).
 *
 * A popover, not a modal: it names the work and stops it, and the rest of the
 * window stays usable. It closes on Escape (returning focus to its button) and on
 * a click anywhere outside it. Fixed to the viewport because the strip clips what
 * overflows it, and kept inside the window by `--space-xs` on all four sides (M294).
 *
 * It opens above its button, so it says so (`data-placement="top"`), and when it closes it stays,
 * inert and `data-leaving`, for the length of its exit (M380). Escape is the one layer stack's
 * (M469): a dialog or menu opened over it hears the key first.
 */
function RunningList({
  jobs,
  activeCount,
  button,
  onStop,
  stopping,
  canStop,
  onClose,
  box,
  leaving,
}: {
  jobs: EngineJobSummary[];
  activeCount: number;
  button: HTMLButtonElement | null;
  onStop: (job: EngineJobSummary) => void;
  stopping: string | null;
  canStop: (job: EngineJobSummary) => boolean;
  onClose: () => void;
  /** The element that carries the exit (usePresence's ref). */
  box: RefObject<HTMLDivElement | null>;
  /** Closed, and playing its exit: it takes no key, click or focus. */
  leaving: boolean;
}) {
  const [style, setStyle] = useState<{ left: number; bottom: number; maxHeight: number } | undefined>(undefined);
  const isTop = useLayerStack(!leaving);
  const isTopRef = useRef(isTop);
  isTopRef.current = isTop;

  useEffect(() => {
    if (leaving) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isTopRef.current()) {
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
  }, [box, button, leaving, onClose]);

  // Above its button, then pulled inside the window on every side by the box's own padding
  // (`--space-xs`): at the right edge the list moves left rather than leave the window.
  useLayoutEffect(() => {
    const element = box.current;
    const rect = button?.getBoundingClientRect();
    if (!element || !rect) return;
    const gap = Number.parseFloat(getComputedStyle(element).paddingLeft) || 4;
    const width = element.offsetWidth;
    const left = Math.max(gap, Math.min(rect.left, window.innerWidth - width - gap));
    const bottom = Math.max(gap, window.innerHeight - rect.top + gap);
    setStyle({ left, bottom, maxHeight: Math.max(0, window.innerHeight - bottom - gap) });
  }, [box, button, jobs.length]);

  const hidden = activeCount - jobs.length;

  return (
    <div
      className="cp-status__running"
      role="dialog"
      aria-label="Running now"
      ref={box}
      style={style}
      data-placement="top"
      data-leaving={leaving ? "" : undefined}
      inert={leaving}
      aria-hidden={leaving || undefined}
    >
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
                  variant="quiet"
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

/** A job's progress is announced at each quarter (M468): 0 until a quarter is reached. */
export function announcedQuarter(percent: number | null): number {
  return percent === null ? 0 : Math.floor(Math.min(100, Math.max(0, percent)) / 25) * 25;
}

export function StatusStrip() {
  const status = useEngineStatus();
  // The message, not the snapshot: the strip must not repaint every time the
  // playback position moves (PLAYER-06).
  const playerMessage = usePlayerStatusMessage();
  const { job, jobs, activeCount } = useActiveJob();
  const beatport = useBeatportSignIn();
  const [listOpen, setListOpen] = useState(false);
  // The popover belongs to "+N more"; once that is gone it must not come back
  // unasked the next time two things run.
  useEffect(() => {
    if (activeCount <= 1) setListOpen(false);
  }, [activeCount]);
  const moreButton = useRef<HTMLButtonElement | null>(null);
  // The list stays for its exit after it closes (M380).
  const list = usePresence<HTMLDivElement>(listOpen && activeCount > 1);

  // A job that finishes leaves "Done · …" in its place (D25), and pulses the strip once (feedback,
  // DEC-154). A job the person stopped says "Stopped" instead.
  const [finished, setFinished] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  const lastJob = useRef<EngineJobSummary | null>(null);
  const stoppedJobs = useRef(new Set<string>());
  if (job) lastJob.current = job;
  const hadJob = useRef(false);
  useEffect(() => {
    const has = job !== null;
    if (hadJob.current && !has) {
      const ended = lastJob.current;
      setDone(jobDoneLine(ended, ended !== null && stoppedJobs.current.has(ended.id)));
      setFinished((n) => n + 1);
      const pulse = window.setTimeout(() => setFinished(0), 800);
      const hold = window.setTimeout(() => setDone(null), DONE_HOLD_MS);
      hadJob.current = has;
      return () => {
        window.clearTimeout(pulse);
        window.clearTimeout(hold);
      };
    }
    if (has) setDone(null);
    hadJob.current = has;
  }, [job]);
  const activityOpen = useActivityOpen();

  const percent = jobPercent(job);
  const { offline } = useEngineOnline();
  // A failed call can know before the poll does: offline overrides a stale "Ready".
  const connected = status?.connected === true && !offline;
  // Not answered yet, or answered "starting": one wait, one word, in the neutral look. Red is for
  // an engine that really stopped, and the banner above the page says that in full (M494, M402).
  const waiting = !connected && !offline;
  // While the banner above the page is up (`offline`: stopped, restarting, or gave up) it says
  // so in full; the strip stays quiet rather than repeat it in other words.
  // A full disk is said in the error look until something is saved again; a once-only note (an
  // unclean exit that checked out, a reopened window, an interrupted export) takes the place of
  // "Ready" for a while (HARDEN-03, HARDEN-05).
  const { diskFull, notice } = useStripMessages();
  // "Restore when done" is waiting for work to end: said here, wherever the person is, with its Cancel.
  const waitingRestore = useSyncExternalStore(subscribeRestore, getRestoreSnapshot).waiting;
  const sayDiskFull = diskFull && !offline;
  const sayNote = !sayDiskFull && connected && notice !== null;
  const engineText = sayDiskFull ? DISK_FULL_WORDS : offline ? "" : sayNote ? notice : connected ? "Ready" : "Starting…";

  // What a screen reader hears (M468): a job starting, each quarter of it, and how it ended. The
  // visible label changes with every poll and is not itself a live region.
  const [announcement, setAnnouncement] = useState("");
  const jobId = job?.id ?? null;
  const quarter = announcedQuarter(percent);
  useEffect(() => {
    if (jobId !== null && lastJob.current) setAnnouncement(`${jobLabelWithoutCount(lastJob.current)} started`);
  }, [jobId]);
  useEffect(() => {
    if (jobId !== null && quarter > 0) setAnnouncement(`${quarter}% done`);
  }, [jobId, quarter]);
  useEffect(() => {
    if (done) setAnnouncement(done);
  }, [done]);

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
    stoppedJobs.current.add(target.id);
    try {
      await window.cuepoint?.cancelJob?.(target.id);
    } catch {
      // A cancel that cannot be delivered is not worth an error of its own:
      // the job carries on and the strip keeps saying so, which is the honest
      // outcome either way.
      stoppedJobs.current.delete(target.id);
    } finally {
      setCancelling(null);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "a") {
        event.preventDefault();
        // Not over an open dialog (M473): the key belongs to the dialog.
        if (isDialogOpen()) return;
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
      <div className="cp-status" data-finished={finished > 0 ? finished % 2 : undefined}>
        {/*
          The live region is only the status text. The Hint tooltip and the running
          list open from inside the strip and would otherwise be announced as
          status updates. It is a box (flex), not `display: contents`, so the finish pulse can
          draw on it (M368).
        */}
        <span className="cp-status__live" role="status" aria-live="polite">
          {/* A hidden line for a screen reader: the start, each quarter and the finish of a job (M468). */}
          <span className="cp-visually-hidden">{announcement}</span>
          {/* "Ready" is the idle word, quiet and muted; it is not a green badge that never clears. */}
          <span
            className={`cp-status__engine ${
              sayDiskFull
                ? "cp-status__engine--error"
                : connected
                  ? "cp-status__engine--ok"
                  : waiting
                    ? "cp-status__engine--reconnecting"
                    : "cp-status__engine--error"
            }`}
            // Shown only while nothing else is being said (a job, or "Done · …"); a full disk is always said.
            hidden={(job !== null || done !== null) && connected && !sayDiskFull ? true : undefined}
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

          {!job && done && <span className="cp-status__done">{done}</span>}
          {waitingRestore && <span className="cp-status__done">{waitingRestore.line}</span>}
        </span>
        {waitingRestore && (
          <Button variant="quiet" className="cp-status__cancel" onClick={stopWaiting}>
            Cancel restore
          </Button>
        )}

        {job ? (
          <span className="cp-status__job">
            <PixelSpinner label={null} />
            {/* The reason is on hover; the label is not a tab stop and not a live region (M468). */}
            <Hint text={jobTitle(job)}>
              <span className="cp-status__job-label">{jobLabel(job)}</span>
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
                {list.present && (
                  <RunningList
                    box={list.ref}
                    leaving={list.leaving}
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

        {/* The right end: an update on its way, the Beatport sign-in state, and Activity. */}
        <span className="cp-status__tail">
          <UpdateStatusItem />
          {beatport !== null && (
            <Hint text={beatport ? "Signed in to Beatport: matching and Discover can use it" : "Sign in to Beatport in Settings to match and discover"}>
              <span className="cp-status__beatport">{beatport ? "Beatport · signed in" : "Beatport · not signed in"}</span>
            </Hint>
          )}
          <ActivityButton />
        </span>
      </div>

      <ActivityPanel open={activityOpen} onClose={closeActivity} />
    </>
  );
}

/** A job's name without its counts, for "… started". */
function jobLabelWithoutCount(job: EngineJobSummary): string {
  return jobLabel({ ...job, progress: undefined });
}
