/**
 * How many tracks a question matches (PAGES-07B).
 *
 * The match window and Fix values say how many tracks a choice covers before
 * anything runs. The count is the engine's, from a one-row browse of the same
 * question the batch would be asked, never counted from rows on screen. `null`
 * while it is being read, when there is nothing to ask, or when the engine
 * could not say.
 */
import { useEffect, useState } from "react";

import { browseParams, queryKey, type LibraryQuery } from "../library/libraryQuery";
import { reportUnexpected } from "../../reporting/reporting";

export function useTrackCount(query: LibraryQuery | null): number | null {
  const key = query ? queryKey(query) : null;
  const [answer, setAnswer] = useState<{ key: string; total: number } | null>(null);

  useEffect(() => {
    if (!query || key === null) return;
    const bridge = window.cuepoint?.browseLibrary;
    if (!bridge) return;
    let cancelled = false;
    bridge(browseParams(query, 0, 1))
      .then((response) => {
        if (!cancelled) setAnswer({ key, total: response.total });
      })
      .catch((cause: unknown) => reportUnexpected(cause));
    return () => {
      cancelled = true;
    };
    // The key stands for the query: a new object with the same question is not a new question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return answer !== null && answer.key === key ? answer.total : null;
}
