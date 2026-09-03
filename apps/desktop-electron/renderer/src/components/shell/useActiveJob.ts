import { useEffect, useRef, useState } from "react";
import type {
  EngineJobSummary,
  MatchJobStatus,
} from "../../api/cuepointBridge.types";

/**
 * How often the strip asks what jobs are running.
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

export interface ActiveJobState {
  job: EngineJobSummary | null;
  /** Active jobs in total, so the strip can say "1 of 3" rather than lying. */
  activeCount: number;
}

const EMPTY: ActiveJobState = { job: null, activeCount: 0 };

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
 */
const JOB_VERBS: Record<string, string> = {
  match: "Matching",
  library_import: "Importing",
};

/** A short description of what a job is doing, for the strip. */
export function jobLabel(job: EngineJobSummary | null): string {
  if (!job) return "";
  const done = job.progress?.completed_tracks;
  const total = job.progress?.total_tracks;
  const counted =
    typeof done === "number" && typeof total === "number" && total > 0
      ? ` ${done}/${total}`
      : "";
  // An unknown type falls back to "Working" rather than to "Matching": a job
  // this build has not heard of is not necessarily a match, and guessing wrong
  // tells the user something untrue about their library.
  const verb =
    job.state === "queued" ? "Queued" : (JOB_VERBS[job.type] ?? "Working");
  return `${verb}${counted}`;
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
          const job = result.jobs[0] ?? null;
          setState({ job, activeCount: result.active_count });
        })
        .catch(() => {
          // The engine being unreachable is reported by the engine-status half
          // of the strip; there is nothing useful to say about jobs meanwhile.
          if (!cancelled) setState(EMPTY);
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
    unsubscribe.current = subscribe(id, (event: MatchJobStatus & { type?: string }) => {
      setState((prev) => {
        if (!prev.job || prev.job.id !== event.id) return prev;
        return {
          ...prev,
          job: {
            ...prev.job,
            state: event.state ?? prev.job.state,
            progress: event.progress ?? prev.job.progress,
          },
        };
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
