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

import type { BatchSelection, MatchStarted } from "../../api/cuepointBridge.types";
import { useToast } from "../../components";
import { useActiveJob } from "../../components/shell/useActiveJob";
import { clampLabel, matchRunningNote, matchStartedLine } from "./cleanFormat";
import { useCleanJob, type CleanMessageTone } from "./useCleanJob";
import { NEEDS_DESKTOP } from "../../api/userMessage";

export interface CleanMatch {
  /** A match is running now, started here or elsewhere. */
  matching: boolean;
  /** The key a match started here was started under, while it runs. */
  running: string | null;
  /** What the page says about the running match, one line (C22); null when none runs. */
  note: string | null;
  /** How far the running match is, when the job has said; null before that or when none runs. */
  progress: { done: number; total: number } | null;
  /** How many matches have ended while the page was open. */
  ended: number;
  /** How many have been started or resumed here, so Past searches is read again as one begins. */
  started: number;
  /** `label` is what the run is called in Past searches: the playlist, "Whole library", "1 track: …". */
  /** Resolves to whether the job started (false when the engine refused it), at the moment it does. */
  start: (key: string, selection: BatchSelection, again: boolean, label?: string) => Promise<boolean>;
  resume: (jobId: string) => void;
}

export function useCleanMatch(onEnded: () => void): CleanMatch {
  const { push } = useToast();
  const message = useCallback((text: string, tone: CleanMessageTone) => push(text, tone), [push]);
  const jobs = useCleanJob(message);
  const active = useActiveJob().jobs.find((job) => job.type === "clean_match") ?? null;
  // What the run was started with, for the note's one line; a match found already running has none.
  const [label, setLabel] = useState<string | null>(null);
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
    setLabel(null);
    setEnded((count) => count + 1);
    latestEnded.current();
  }, [activeId]);

  const follow = useCallback(
    (key: string, begin: () => Promise<MatchStarted>, onStarted?: () => void): Promise<boolean> =>
      jobs.run<MatchStarted>(key, begin, {
        started: (answer) => {
          setStarted((count) => count + 1);
          onStarted?.();
          return matchStartedLine(answer);
        },
        succeeded: "Matching finished.",
        onEnded: () => {
          setLabel(null);
          setEnded((count) => count + 1);
          latestEnded.current();
        },
      }),
    [jobs],
  );

  const start = useCallback(
    (key: string, selection: BatchSelection, again: boolean, runLabel?: string): Promise<boolean> => {
      const bridge = window.cuepoint?.startCleanMatch;
      if (!bridge) {
        push(NEEDS_DESKTOP, "warning");
        return Promise.resolve(false);
      }
      setLabel(runLabel ? clampLabel(runLabel) : null);
      return new Promise<boolean>((resolve) => {
        let began = false;
        void follow(
          key,
          () => bridge({ selection, rematch: again, ...(runLabel ? { label: clampLabel(runLabel) } : {}) }),
          () => {
            began = true;
            resolve(true);
          },
        ).then(() => {
          // Refused before a job existed: nothing runs, so the run has no name.
          if (!began) {
            setLabel(null);
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

  const matching = jobs.running !== null || active !== null;
  const done = active?.progress?.completed_tracks;
  const total = active?.progress?.total_tracks;
  const progress =
    matching && typeof done === "number" && typeof total === "number" && total > 0 ? { done, total } : null;
  return {
    matching,
    running: jobs.running,
    note: matching ? matchRunningNote(label, progress) : null,
    progress,
    ended,
    started,
    start,
    resume,
  };
}
