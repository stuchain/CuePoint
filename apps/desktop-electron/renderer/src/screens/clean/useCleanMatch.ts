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
  /** What the page says about the running match; null when none runs. */
  note: string | null;
  /** How many matches have ended while the page was open. */
  ended: number;
  /** How many have been started or resumed here, so Past searches is read again as one begins. */
  started: number;
  /** `label` is what the run is called in Past searches: the playlist, "Whole library", "1 track: …". */
  start: (key: string, selection: BatchSelection, again: boolean, label?: string) => void;
  resume: (jobId: string) => void;
}

export function useCleanMatch(onEnded: () => void): CleanMatch {
  const { push } = useToast();
  const message = useCallback((text: string, tone: CleanMessageTone) => push(text, tone), [push]);
  const jobs = useCleanJob(message);
  const active = useActiveJob().jobs.find((job) => job.type === "clean_match") ?? null;
  const [note, setNote] = useState<string | null>(null);
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
    setEnded((count) => count + 1);
    latestEnded.current();
  }, [activeId]);

  const follow = useCallback(
    (key: string, begin: () => Promise<MatchStarted>) => {
      void jobs.run<MatchStarted>(key, begin, {
        started: (answer) => {
          setStarted((count) => count + 1);
          setNote(matchRunningNote(answer));
          return matchStartedLine(answer);
        },
        succeeded: "Matching finished.",
        onEnded: () => {
          setNote(null);
          setEnded((count) => count + 1);
          latestEnded.current();
        },
      });
    },
    [jobs],
  );

  const start = useCallback(
    (key: string, selection: BatchSelection, again: boolean, label?: string) => {
      const bridge = window.cuepoint?.startCleanMatch;
      if (!bridge) {
        push(NEEDS_DESKTOP, "warning");
        return;
      }
      follow(key, () => bridge({ selection, rematch: again, ...(label ? { label: clampLabel(label) } : {}) }));
    },
    [follow, push],
  );

  // A match that stopped keeps its plan; resuming asks only about what it had
  // not reached (DEC-065).
  const resume = useCallback(
    (jobId: string) => {
      const bridge = window.cuepoint?.resumeCleanMatch;
      if (!bridge) return;
      follow("resume", () => bridge({ job_id: jobId }));
    },
    [follow],
  );

  const matching = jobs.running !== null || active !== null;
  return {
    matching,
    running: jobs.running,
    note: note ?? (active ? matchRunningNote() : null),
    ended,
    started,
    start,
    resume,
  };
}
