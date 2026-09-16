/**
 * Starting a Clean job and waiting for it to end (CLEAN-12).
 *
 * The page starts matches, file checks, duplicate scans and artwork reads, and
 * needs to know when each ends so it can read its tables again. It does not
 * draw progress: the status strip already follows every job (SHELL-07), which
 * is `followJob`'s reason, and so is this.
 *
 * A refusal before a job exists — the library busy with another, a match with
 * nothing left to match — arrives as the engine's own sentence, which names
 * what to do. A job that fails or is stopped still changed what it reached, so
 * whoever started it is told it ended either way.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { followJob, type FinishedJob } from "../library/followJob";
import { jobErrorMessage } from "../library/libraryFormat";

export type CleanMessageTone = "info" | "success" | "warning";

export interface CleanJobOptions<Answer> {
  /** What to say once the engine has started it, from its answer. */
  started?: (answer: Answer) => string | null;
  /** What to say when it succeeds. */
  succeeded?: string;
  /** Called however it ended, once it has. */
  onEnded?: (outcome: FinishedJob) => void;
}

export interface CleanJobs {
  /** Which job this page is waiting on, by the key it was started under. */
  running: string | null;
  run: <Answer extends { job_id?: string; id?: string }>(
    key: string,
    start: () => Promise<Answer>,
    options?: CleanJobOptions<Answer>,
  ) => Promise<boolean>;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useCleanJob(
  onMessage: (message: string, tone: CleanMessageTone) => void,
): CleanJobs {
  const [running, setRunning] = useState<string | null>(null);
  const alive = useRef(true);
  const following = useRef<{ stop: () => void }[]>([]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const handle of following.current) handle.stop();
      following.current = [];
    };
  }, []);

  const run = useCallback(
    async <Answer extends { job_id?: string; id?: string }>(
      key: string,
      start: () => Promise<Answer>,
      options: CleanJobOptions<Answer> = {},
    ): Promise<boolean> => {
      setRunning(key);
      let answer: Answer;
      try {
        answer = await start();
      } catch (cause) {
        if (alive.current) setRunning(null);
        onMessage(messageOf(cause), "warning");
        return false;
      }

      const jobId = answer.job_id ?? answer.id;
      if (!jobId) {
        if (alive.current) setRunning(null);
        onMessage("The engine answered without a job to follow.", "warning");
        return false;
      }
      const line = options.started?.(answer);
      if (line) onMessage(line, "info");

      const handle = followJob(jobId);
      following.current.push(handle);
      const outcome = await handle.finished;
      following.current = following.current.filter((entry) => entry !== handle);
      if (!alive.current) return false;
      setRunning(null);
      options.onEnded?.(outcome);

      if (outcome.state === "succeeded") {
        if (options.succeeded) onMessage(options.succeeded, "success");
        return true;
      }
      if (outcome.state === "cancelled") {
        onMessage("Stopped. What it had already done stays done.", "info");
        return false;
      }
      onMessage(jobErrorMessage(outcome.error), "warning");
      return false;
    },
    [onMessage],
  );

  return { running, run };
}
