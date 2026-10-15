/**
 * A dig's results as rows of cards, read from the engine (DISCOVER-10 groups).
 *
 * Read again whenever the dig may have moved on (`version`): cards arrive while
 * it runs. A bridge this build lacks, or one that fails, reads as a dig with no
 * cards, which the page shows as the single list it always had. A dig deleted
 * under the page is reported to the caller, as the header's read does.
 */
import { useCallback, useEffect, useState } from "react";

import type { DiscoverRunGroups } from "../../api/cuepointBridge.types";
import { reportUnexpected } from "../../reporting/reporting";
import { userMessage } from "../../api/userMessage";
import { refusalText } from "./discoverFormat";

export interface RunGroupsRead {
  /** The latest answer for this dig; null before the first or when none could be read. */
  groups: DiscoverRunGroups | null;
  /** True until the first answer (or failure) for this dig. */
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useRunGroups(runId: number, version: number, onGone: () => void): RunGroupsRead {
  const [groups, setGroups] = useState<DiscoverRunGroups | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [again, setAgain] = useState(0);
  const reload = useCallback(() => setAgain((value) => value + 1), []);

  // A different dig is a different set of cards: never show one dig's over another.
  useEffect(() => {
    setGroups(null);
    setLoading(true);
    setError(null);
  }, [runId]);

  useEffect(() => {
    const bridge = window.cuepoint?.getDiscoveryRunGroups;
    if (!bridge) {
      setLoading(false);
      return;
    }
    let current = true;
    void bridge({ run_id: runId })
      .then((answer) => {
        if (!current) return;
        if (answer.refusal) {
          if (answer.refusal.code === "DISCOVERY_RUN_NOT_FOUND") onGone();
          else setError(refusalText(answer.refusal));
        } else {
          setGroups(answer.value);
          setError(null);
        }
        setLoading(false);
      })
      .catch((cause: unknown) => {
        reportUnexpected(cause);
        if (!current) return;
        setError(userMessage(cause));
        setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [runId, version, again, onGone]);

  return { groups, loading, error, reload };
}
