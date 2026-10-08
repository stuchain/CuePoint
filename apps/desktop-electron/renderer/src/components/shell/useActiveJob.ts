import { useEffect, useRef, useState } from "react";
import type {
  EngineJobSummary,
  JobStatus,
} from "../../api/cuepointBridge.types";

/**
 * How often the strip asks what background work is running.
 *
 * This one *is* an HTTP round trip, unlike the engine-status read, so it is
 * deliberately not tight — the strip is mounted for the life of the app, and a
 * permanent component polling hard is permanent load. It only has to notice
 * that a job *started*; once one is found, progress arrives over SSE rather
 * than by polling.
 *
 * Two seconds rather than four because four is long enough to look broken:
 * starting a match and glancing at the strip should not need a wait. It is
 * still a discovery poll, so a job shorter than the interval can finish
 * unseen — a demo run completes in about 300ms and is often missed entirely.
 * That is acceptable: the jobs worth reporting are the ones that take long
 * enough to want reporting on.
 */
export const JOB_POLL_MS = 2000;

interface ActiveJobState {
  job: EngineJobSummary | null;
  /** Active jobs in total, so the strip can say "+2 more" rather than lying. */
  activeCount: number;
  /** The active jobs the poll listed (at most five), the first being `job` (STR-5). */
  jobs: EngineJobSummary[];
  /** True once the first poll has answered, so "no jobs" can be told from "not asked yet". */
  loaded: boolean;
}

const EMPTY: ActiveJobState = { job: null, activeCount: 0, jobs: [], loaded: false };

/** Percent complete for a job, or null when it cannot be known yet. */
export function jobPercent(job: EngineJobSummary | null): number | null {
  const progress = job?.progress;
  if (!progress) return null;
  if (typeof progress.percentage === "number" && Number.isFinite(progress.percentage)) {
    return Math.max(0, Math.min(100, Math.round(progress.percentage)));
  }
  const done = progress.completed_tracks;
  const total = progress.total_tracks;
  if (typeof done === "number" && typeof total === "number" && total > 0) {
    return Math.max(0, Math.min(100, Math.round((done / total) * 100)));
  }
  return null;
}

/**
 * What each job type is called while it runs.
 *
 * The strip said "Matching" for every job, which was true while matching was
 * the only kind. A Rekordbox import (DEC-033) shares the job store, the
 * progress shape and this strip, so the only thing that had to change to make
 * it read correctly was the verb.
 *
 * The two halves of a refresh are named apart on purpose (LIBRARY-10). One
 * reads and one deletes, and a strip that called both "Refreshing" would give
 * a user no way to tell, from the only place the app reports background work,
 * whether the irreversible half had started.
 */
const JOB_VERBS: Record<string, string> = {
  library_import: "Importing",
  library_refresh_preview: "Checking your Rekordbox export for changes",
  library_refresh_apply: "Refreshing",
  // ORG-07's batch. Without its own verb it fell through to "Working", which
  // is the fallback for a job type this build has never heard of — and this
  // build writes them.
  library_batch: "Updating tracks",
  // CLEAN-07's file check. It follows every import and refresh on its own, so
  // it appears here whether or not anyone asked for it, and has to say what it
  // is doing: "Checking" alone is already the refresh preview's verb.
  file_check: "Checking files",
  // CLEAN-08's duplicate scan, which follows every import, refresh and
  // match job on its own.
  duplicate_scan: "Finding duplicates",
  // CLEAN-09's artwork scan, which follows every whole-library file check.
  artwork_scan: "Reading artwork",
  // CLEAN-10's tag write, in its three parts. The one job that changes audio
  // files says so in words of its own, and a preview that only reads them
  // must not read as the write.
  // CLEAN-03's match over a library scope, which CLEAN-11 made startable. The
  // only match there is since inKey's file-based run retired (CLEAN-14); it
  // keeps "on Beatport" because that is where the work is happening.
  clean_match: "Matching on Beatport",
  tag_write_preview: "Reading tags",
  tag_write: "Writing tags",
  tag_restore: "Restoring tags",
  // EXPORT-05's Rekordbox export. "Exporting" alone would read as the CSV,
  // JSON and Excel export Settings offers, which is a different thing that
  // writes a different file.
  rekordbox_export: "Exporting to Rekordbox",
  // DISCOVER-03's name index, which the engine builds on its own when a
  // library predates it or its rule changed. Unasked-for, so it says plainly
  // what it is doing rather than falling through to "Working".
  credit_index: "Getting artist and label pages ready",
  // WAVE-04's one-time read of a library's cue points and beat grids, which
  // the engine starts on its own the first time it opens a library imported
  // before they were read.
  marks_backfill: "Reading your cue points",
  // Discover's three Beatport jobs (DISCOVER-04 to DISCOVER-06, started over
  // DISCOVER-09's routes). Each spends requests on the user's token, so the
  // strip says Beatport, as the match does.
  discovery: "Discovering on Beatport",
  beatport_playlist: "Making a playlist on Beatport",
  beatport_resolve: "Linking tracks to Beatport",
  // WAVE-03's waveform analysis, which starts on its own after every file
  // check and can run for hours on a large library.
  waveform_analysis: "Analyzing waveforms",
};

/**
 * Jobs whose Stop is a Pause (WAVE-03).
 *
 * Stopping the waveform analysis records that it is paused, so it stays paused
 * across a restart; a button that said "Stop" would promise less than it does.
 */
const PAUSED_BY_STOP: ReadonlySet<string> = new Set(["waveform_analysis"]);

/**
 * Jobs whose progress names the stage they are in, in the engine's words.
 *
 * A discovery run counts charts, then labels, then releases (DISCOVER-05), and
 * a push creates its playlist and then adds tracks (DISCOVER-06): "3/10" means
 * nothing without which. For these the stage is the label, and the verb above
 * stands in until the first progress arrives.
 */
const STAGED_JOBS: ReadonlySet<string> = new Set(["discovery", "beatport_playlist"]);

/** "120 of 4,000": every count is written in words, in the American style (STR-3). */
function countInWords(done: number, total: number): string {
  return `${done.toLocaleString("en-US")} of ${total.toLocaleString("en-US")}`;
}

/** A short description of what a job is doing, for the strip. */
export function jobLabel(job: EngineJobSummary | null): string {
  if (!job) return "";
  const done = job.progress?.completed_tracks;
  const total = job.progress?.total_tracks;
  const known = typeof done === "number" && typeof total === "number" && total > 0;
  const stage = job.progress?.status_message;
  // An unknown type falls back to "Working on it" rather than to "Matching": a
  // job this build has not heard of is not necessarily a match, and guessing
  // wrong tells the user something untrue about their library.
  if (job.state === "queued") return known ? `Waiting to start · ${countInWords(done, total)}` : "Waiting to start";
  // A batch says how many tracks it is changing, which is its count.
  if (job.type === "library_batch" && known) return `Updating ${total.toLocaleString("en-US")} tracks`;
  const verb =
    STAGED_JOBS.has(job.type) && typeof stage === "string" && stage.trim()
      ? stage.trim()
      : (JOB_VERBS[job.type] ?? "Working on it");
  return known ? `${verb} · ${countInWords(done, total)}` : verb;
}

/** What the strip's stop button says for a job: "Pause" where stopping pauses. */
export function jobStopLabel(job: EngineJobSummary | null): string {
  return job && PAUSED_BY_STOP.has(job.type) ? "Pause" : "Stop";
}

/** A length of time in the words the strip uses: "about 6 hours". */
export function aboutDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "under a minute";
  if (minutes < 60) return `about ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `about ${hours} hour${hours === 1 ? "" : "s"}`;
}

/** What a kind of background work is for, and that the user can carry on (STR-3, DEC-132). */
export const JOB_EXPLAINERS: Record<string, string> = {
  library_import:
    "CuePoint is reading your Rekordbox collection into its library. You can keep working while it finishes.",
  library_refresh_preview:
    "CuePoint is comparing your Rekordbox export with its library. Nothing changes yet, and you can keep working.",
  library_refresh_apply:
    "CuePoint is applying the changes from your Rekordbox export. You can keep working.",
  library_batch:
    "CuePoint is changing the tracks you chose. Work already done stays done if you stop, and you can keep working.",
  file_check:
    "CuePoint is checking that each track's file is still where your library says. You can keep working.",
  duplicate_scan: "CuePoint is looking for tracks you have twice. You can keep working.",
  artwork_scan: "CuePoint is reading the artwork in your tracks. You can keep working.",
  clean_match:
    "CuePoint is looking your tracks up on Beatport to fill in what is missing. You can keep working.",
  tag_write_preview:
    "CuePoint is reading the tags in your files to show what would change. Nothing is written, and you can keep working.",
  tag_write: "CuePoint is writing tags into your audio files. Please keep CuePoint open until it finishes.",
  tag_restore:
    "CuePoint is putting the earlier tags back into your audio files. Please keep CuePoint open until it finishes.",
  rekordbox_export:
    "CuePoint is writing your changes to a Rekordbox file. You can keep working.",
  credit_index:
    "CuePoint is getting artist and label pages ready so Discover can open them. You can keep working.",
  marks_backfill:
    "CuePoint is reading the cue points and beat grids in your Rekordbox collection. You can keep working.",
  discovery: "CuePoint is searching Beatport for tracks you may like. You can keep working.",
  beatport_playlist: "CuePoint is building your playlist on Beatport. You can keep working.",
  beatport_resolve:
    "CuePoint is matching your tracks to their Beatport pages. You can keep working.",
  waveform_analysis:
    "CuePoint is drawing each track's waveform. You can keep working; it pauses itself for imports.",
};

const GENERIC_EXPLAINER = "CuePoint is working in the background. You can keep working.";

/** The plain reason for a kind of work; PAGES-05's ready note reuses it. */
export function jobExplainer(type: string): string {
  return Object.hasOwn(JOB_EXPLAINERS, type) ? JOB_EXPLAINERS[type]! : GENERIC_EXPLAINER;
}

/**
 * The strip's title for a job: what it is for, and for the waveform analysis its
 * rate and the time left (WAVE-03). The time left is the remaining tracks at the
 * rate over the last ten minutes, so the rate is that ratio read back, not a
 * second estimate.
 */
export function jobTitle(job: EngineJobSummary | null): string | undefined {
  if (!job) return undefined;
  const reason = jobExplainer(job.type);
  if (job.type !== "waveform_analysis") return reason;
  const done = job.progress?.completed_tracks;
  const total = job.progress?.total_tracks;
  const eta = job.progress?.eta_seconds;
  if (typeof done !== "number" || typeof total !== "number" || typeof eta !== "number") {
    return reason;
  }
  const remaining = total - done;
  if (!(eta > 0) || remaining <= 0) return reason;
  const perHour = Math.round((remaining * 3600) / eta);
  return `${reason} About ${perHour.toLocaleString("en-US")} an hour · ${aboutDuration(eta)} left`;
}

/**
 * The job the status strip should be showing, and how many are active.
 *
 * Discovery is a poll, because a job can be started from anywhere — another
 * screen, another window, or a previous renderer that has since reloaded — and
 * nothing broadcasts that. Progress is *not* a poll: once a job is known, the
 * existing SSE stream carries its ticks, which is both cheaper and smoother
 * than asking repeatedly.
 */
export function useActiveJob(pollMs: number = JOB_POLL_MS): ActiveJobState {
  const [state, setState] = useState<ActiveJobState>(EMPTY);
  // The job we are subscribed to, so a re-poll finding the same job does not
  // tear down and rebuild the stream.
  const subscribedTo = useRef<string | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);

  useEffect(() => {
    const list = window.cuepoint?.listJobs;
    if (!list) return;

    let cancelled = false;

    const poll = () => {
      void list({ state: "active", limit: 5 })
        .then((result) => {
          if (cancelled) return;
          // The newest running job, else the newest: background work queued
          // behind an import (waveforms wait for it) must not hide the import.
          const job = result.jobs.find((candidate) => candidate.state === "running") ?? result.jobs[0] ?? null;
          setState({ job, activeCount: result.active_count, jobs: result.jobs, loaded: true });
        })
        .catch(() => {
          // The engine being unreachable is reported by the engine-status half
          // of the strip; there is nothing useful to say about jobs meanwhile.
          if (!cancelled) setState({ ...EMPTY, loaded: true });
        });
    };

    poll();
    const timer = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollMs]);

  // Follow the current job's progress over SSE.
  useEffect(() => {
    const subscribe = window.cuepoint?.subscribeJobEvents;
    const id = state.job?.id ?? null;

    if (!subscribe || !id) {
      unsubscribe.current?.();
      unsubscribe.current = null;
      subscribedTo.current = null;
      return;
    }
    if (subscribedTo.current === id) return;

    unsubscribe.current?.();
    subscribedTo.current = id;
    unsubscribe.current = subscribe(id, (event: JobStatus) => {
      setState((prev) => {
        if (!prev.job || prev.job.id !== event.id) return prev;
        const job = {
          ...prev.job,
          state: event.state ?? prev.job.state,
          progress: event.progress ?? prev.job.progress,
        };
        return { ...prev, job, jobs: [job, ...prev.jobs.slice(1)] };
      });
    });
  }, [state.job?.id]);

  // Tear the stream down when the strip goes away, not only when the job does.
  useEffect(
    () => () => {
      unsubscribe.current?.();
      unsubscribe.current = null;
    },
    [],
  );

  return state;
}
