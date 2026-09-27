/**
 * Starting a Discover job and hearing how it ended (DISCOVER-10).
 *
 * A run, a push and a resolve are jobs (DEC-091, DEC-099, DISCOVER-04): the
 * status strip shows their progress, so this does not. It starts one, follows
 * it to its end with the Library's `followJob`, reads what the job produced,
 * and hands both to the page — which reads its tables again and says, in its
 * own words, what happened.
 *
 * A refusal before any job exists — no token, a push of nothing, one already
 * running — is returned rather than thrown, as every Discover answer is.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  DiscoverAnswer,
  DiscoverJobStarted,
  DiscoverRefusal,
} from "../../api/cuepointBridge.types";
import { followJob, type FinishedJob } from "../library/followJob";

export interface DiscoverJob {
  /** The job being followed, while it runs. */
  jobId: string | null;
  start: (
    begin: () => Promise<DiscoverAnswer<DiscoverJobStarted>>,
  ) => Promise<DiscoverRefusal | null>;
  /** Follow a job something else started: the one a busy refusal names. */
  follow: (jobId: string) => void;
}

export function useDiscoverJob<Result>(
  onEnded: (result: Result | null, finished: FinishedJob, jobId: string) => void,
): DiscoverJob {
  const [jobId, setJobId] = useState<string | null>(null);
  const alive = useRef(true);
  const handles = useRef<Array<{ stop: () => void }>>([]);
  const ended = useRef(onEnded);
  ended.current = onEnded;
  const following = useRef<string | null>(null);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      for (const handle of handles.current) handle.stop();
      handles.current = [];
    };
  }, []);

  const follow = useCallback((id: string) => {
    if (following.current === id) return;
    following.current = id;
    setJobId(id);
    const handle = followJob(id);
    handles.current.push(handle);
    void handle.finished.then(async (finished) => {
      let result: Result | null = null;
      try {
        const answer = await window.cuepoint?.getJobResults?.(id);
        result = (answer?.result as Result | undefined) ?? null;
      } catch {
        // The job ended either way; what it produced is a detail the page
        // can do without, and the job's own error says what went wrong.
      }
      if (!alive.current) return;
      if (following.current === id) {
        following.current = null;
        setJobId(null);
      }
      ended.current(result, finished, id);
    });
  }, []);

  const start = useCallback(
    async (begin: () => Promise<DiscoverAnswer<DiscoverJobStarted>>) => {
      const answer = await begin();
      if (answer.refusal) return answer.refusal;
      follow(answer.value.id);
      return null;
    },
    [follow],
  );

  return { jobId, start, follow };
}
