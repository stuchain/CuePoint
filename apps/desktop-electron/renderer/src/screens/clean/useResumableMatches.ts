/**
 * The matches that stopped with tracks left (CLEAN-14, DEC-065).
 *
 * A match the user stopped, or one CuePoint's closing cut short, keeps its
 * plan: resuming asks Beatport only about the tracks it had not reached. The
 * engine has answered which ones can be resumed since CLEAN-11; this is what
 * lets the review page offer it. Read again whenever `version` changes — the
 * page bumps it when a match ends — and never guessed: a build without the
 * route offers nothing.
 */
import { useEffect, useState } from "react";

import type { ResumableMatch } from "../../api/cuepointBridge.types";

export interface ResumableMatchesState {
  /** Newest first, as the engine lists them. */
  jobs: ResumableMatch[];
  total: number;
}

const NONE: ResumableMatchesState = { jobs: [], total: 0 };

export function useResumableMatches(version = 0): ResumableMatchesState {
  const [state, setState] = useState<ResumableMatchesState>(NONE);

  useEffect(() => {
    const read = window.cuepoint?.getResumableMatches;
    if (!read) {
      setState(NONE);
      return;
    }
    let cancelled = false;
    read()
      .then((answer) => {
        if (!cancelled) setState({ jobs: answer.jobs, total: answer.total });
      })
      .catch(() => {
        // An offer is a convenience; Activity still lists the interruption.
        if (!cancelled) setState(NONE);
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  return state;
}
