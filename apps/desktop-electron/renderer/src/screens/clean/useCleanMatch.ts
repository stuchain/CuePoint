/**
 * Running a match for the Clean page (PAGES-07B, CLN-7, DEC-065).
 *
 * The match window starts matches, Past searches resumes a stopped one and
 * matches a run again, One at a time matches a single track again, and all of
 * them are one job the status strip follows.
 * This is the one place that starts it, says what it started and where
 * progress is, and counts how many have ended so the queue is read again. A
 * match that was started before the page was opened is read from the active
 * jobs, so the note, the disabled buttons and the reload on finish survive
 * leaving the page and coming back.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { BatchSelection, MatchRun, MatchStarted } from "../../api/cuepointBridge.types";
import { useToast } from "../../components";
import { useActiveJob } from "../../components/shell/useActiveJob";
import { clampLabel, matchStartedLine } from "./cleanFormat";
import { useCleanJob, type CleanMessageTone } from "./useCleanJob";
import { NEEDS_DESKTOP, userMessage } from "../../api/userMessage";
import { announceRunEnd, type NothingFound } from "./match/matchDone";

/** What a run started from a playlist's row asks of the page (C22). */
export interface RunHooks {
  /** The job's id, once the engine has started it. */
  onJob?: (jobId: string) => void;
  /** Whether the person is somewhere other than Clean's Match: the run then ends in a toast. */
  away?: () => boolean;
  /** Review N, from that toast. */
  onReview?: (run: MatchRun) => void;
  /** The run ended with something found while the person is on Clean: land on its review. */
  onLand?: (run: MatchRun) => void;
  /** The run ended having found nothing at all: the red note. */
  onNothing?: (run: MatchRun, found: NothingFound) => void;
  /** Whether the red note can be seen as the run ends, so no toast repeats it. */
  noteVisible?: () => boolean;
}

export interface CleanMatch {
  /** A match is running now, started here or elsewhere. */
  matching: boolean;
  /** The key a match started here was started under, while it runs. */
  running: string | null;
  /** The engine's running match job, whoever started it and whichever page this was started from; null when none. */
  jobId: string | null;
  /** What this page started the running match under ("hJ"); null for one it found already running. */
  label: string | null;
  /** How far the running match is, when the job has said; null before that or when none runs. */
  progress: { done: number; total: number } | null;
  /** About how many seconds are left, once enough tracks are done to say; null before that. */
  secondsLeft: number | null;
  /** How many matches have ended while the page was open. */
  ended: number;
  /** How many have been started or resumed here, so Past searches is read again as one begins. */
  started: number;
  /** `label` is what the run is called in Past searches: the playlist, "Whole library", "1 track: …". */
  /** Resolves to whether the job started (false when the engine refused it), at the moment it does. */
  start: (
    key: string,
    selection: BatchSelection,
    again: boolean,
    label?: string,
    hooks?: RunHooks,
  ) => Promise<boolean>;
  resume: (jobId: string) => void;
  /** Stop a running match; what it had already done stays done. */
  stop: (jobId: string) => void;
}

/** Tracks that must be done before a time left is said: fewer would be a guess at one track's speed. */
export const TRACKS_BEFORE_TIME_LEFT = 3;

/**
 * About how long is left, from how long the tracks done so far took. Display only: a track takes
 * five to forty-five seconds, so it is said in minutes and only once a few are done.
 */
export function secondsLeftOf(
  progress: { done: number; total: number },
  elapsed: number | undefined,
): number | null {
  if (typeof elapsed !== "number" || !(elapsed > 0)) return null;
  if (progress.done < TRACKS_BEFORE_TIME_LEFT || progress.done >= progress.total) return null;
  return Math.round((elapsed / progress.done) * (progress.total - progress.done));
}

export function useCleanMatch(onEnded: () => void): CleanMatch {
  const { push } = useToast();
  const message = useCallback((text: string, tone: CleanMessageTone) => push(text, tone), [push]);
  const jobs = useCleanJob(message);
  const active = useActiveJob().jobs.find((job) => job.type === "clean_match") ?? null;
  // What the run was started with, for the note's one line; a match found already running has none.
  // What the run was started with, and the job it became: a name belongs to its own job only.
  const [named, setNamed] = useState<{ label: string; jobId: string | null } | null>(null);
  const [ended, setEnded] = useState(0);
  const [started, setStarted] = useState(0);

  const latestEnded = useRef(onEnded);
  latestEnded.current = onEnded;

  // A match that ends while this page is open but was not started from it has
  // no callback to say so.
  const activeId = active?.id ?? null;
  const lastActive = useRef<string | null>(null);
  useEffect(() => {
    const finished = lastActive.current !== null && activeId === null;
    lastActive.current = activeId;
    if (!finished) return;
    setNamed(null);
    setEnded((count) => count + 1);
    latestEnded.current();
  }, [activeId]);

  const follow = useCallback(
    (
      key: string,
      begin: () => Promise<MatchStarted>,
      onStarted?: (answer: MatchStarted) => void,
      announced = false,
    ): Promise<boolean> =>
      jobs.run<MatchStarted>(key, begin, {
        started: (answer) => {
          setStarted((count) => count + 1);
          onStarted?.(answer);
          return matchStartedLine(answer);
        },
        // A run that has its own notice (a playlist's row) does not also say "finished".
        succeeded: announced ? undefined : "Matching finished.",
        onEnded: () => {
          setNamed(null);
          setEnded((count) => count + 1);
          latestEnded.current();
        },
      }),
    [jobs],
  );

  const start = useCallback(
    (
      key: string,
      selection: BatchSelection,
      again: boolean,
      runLabel?: string,
      hooks?: RunHooks,
    ): Promise<boolean> => {
      const bridge = window.cuepoint?.startCleanMatch;
      if (!bridge) {
        push(NEEDS_DESKTOP, "warning");
        return Promise.resolve(false);
      }
      setNamed(runLabel ? { label: clampLabel(runLabel), jobId: null } : null);
      return new Promise<boolean>((resolve) => {
        let began = false;
        void follow(
          key,
          () => bridge({ selection, rematch: again, ...(runLabel ? { label: clampLabel(runLabel) } : {}) }),
          (answer) => {
            began = true;
            const jobId = answer.job_id ?? answer.id;
            if (jobId) {
              setNamed((was) => (was ? { ...was, jobId } : was));
              hooks?.onJob?.(jobId);
            }
            if (jobId && hooks?.away && hooks.onReview) {
              // Outside React's effects: a hidden page has those stopped, and this must still speak.
              announceRunEnd({
                jobId,
                label: runLabel ? clampLabel(runLabel) : "Matching",
                away: hooks.away,
                push,
                onReview: hooks.onReview,
                onLand: hooks.onLand,
                onNothing: hooks.onNothing,
                noteVisible: hooks.noteVisible,
              });
            }
            resolve(true);
          },
          Boolean(hooks?.away),
        ).then(() => {
          // Refused before a job existed: nothing runs, so the run has no name.
          if (!began) {
            setNamed(null);
            resolve(false);
          }
        });
      });
    },
    [follow, push],
  );

  // A match that stopped keeps its plan; resuming asks only about what it had
  // not reached (DEC-065).
  const resume = useCallback(
    (jobId: string) => {
      const bridge = window.cuepoint?.resumeCleanMatch;
      if (!bridge) return;
      void follow("resume", () => bridge({ job_id: jobId }));
    },
    [follow],
  );

  // Stopping is the status strip's own route; the run ends as cancelled and the rows read again.
  const stop = useCallback(
    (jobId: string) => {
      const cancel = window.cuepoint?.cancelJob;
      if (!cancel) {
        push(NEEDS_DESKTOP, "warning");
        return;
      }
      void cancel(jobId).catch((cause: unknown) => push(userMessage(cause), "warning"));
    },
    [push],
  );

  const matching = jobs.running !== null || active !== null;
  const done = active?.progress?.completed_tracks;
  const total = active?.progress?.total_tracks;
  const progress =
    matching && typeof done === "number" && typeof total === "number" && total > 0 ? { done, total } : null;
  return {
    matching,
    running: jobs.running,
    jobId: active?.id ?? null,
    // A name is for the job it started: another job running now (after this one ended) is not it.
    label:
      matching && named && (named.jobId === null || active === null || active.id === named.jobId)
        ? named.label
        : null,
    secondsLeft: progress ? secondsLeftOf(progress, active?.progress?.elapsed_time) : null,
    progress,
    ended,
    started,
    start,
    resume,
    stop,
  };
}
