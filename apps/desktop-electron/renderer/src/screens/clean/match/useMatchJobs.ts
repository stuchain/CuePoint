/**
 * Past searches, read from the engine (C14, DEC-065).
 *
 * One read of `getMatchJobs`, newest first, searchable by what was matched or
 * when. Read again whenever `version` changes — the page bumps it when a match
 * ends — and never guessed: a build without the route lists nothing and says
 * so (`available`).
 */
import { useCallback, useEffect, useState } from "react";

import type { MatchRun } from "../../../api/cuepointBridge.types";
import { reportUnexpected } from "../../../reporting/reporting";

export const MATCH_JOBS_LIMIT = 20;

interface MatchJobsState {
  runs: MatchRun[];
  total: number;
  loading: boolean;
  error: string | null;
  /** False when this build cannot list them. */
  available: boolean;
  reload: () => void;
}

export function useMatchJobs(query = "", version = 0): MatchJobsState {
  const [runs, setRuns] = useState<MatchRun[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);
  const available = Boolean(window.cuepoint?.getMatchJobs);

  useEffect(() => {
    const read = window.cuepoint?.getMatchJobs;
    if (!read) {
      setRuns([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const q = query.trim();
    read({ limit: MATCH_JOBS_LIMIT, ...(q ? { q } : {}) })
      .then((answer) => {
        if (cancelled) return;
        setRuns(answer.jobs);
        setTotal(answer.total);
        setError(null);
      })
      .catch((cause: unknown) => {
        reportUnexpected(cause);
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, version, reloads]);

  const reload = useCallback(() => setReloads((value) => value + 1), []);
  return { runs, total, loading, error, available, reload };
}
