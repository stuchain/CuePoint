/**
 * The Keys page's counts, asked of the engine (PAGES-16).
 *
 * One read per set of sources: `POST /api/v1/library/keys/population`. A different set of
 * sources is a different question, so the answer to the old one is dropped at once rather than
 * left on screen under the new tick, and an answer that arrives late for a question no one is
 * asking any more is ignored.
 *
 * Nothing is asked until `ready` (the page has read its source trees and pruned what a refresh
 * removed). A source the engine still says is gone (`SOURCE_NOT_FOUND`, a refusal rather than a
 * fault) is handed to `onSourceGone`; when that drops it the sources change and the question is
 * asked again, with no report.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { KeySource, KeysPopulation } from "../../api/cuepointBridge.types";
import { bridgeErrorFields } from "../../api/bridgeError";
import { reportUnexpected } from "../../reporting/reporting";

type PopulationStatus = "loading" | "ready" | "error" | "unavailable";

interface KeysPopulationState {
  status: PopulationStatus;
  data: KeysPopulation | null;
  retry: () => void;
}

export function useKeysPopulation(
  sources: readonly KeySource[],
  reloadToken: number,
  ready: boolean,
  onSourceGone: (message: string) => boolean,
): KeysPopulationState {
  const [state, setState] = useState<{ status: PopulationStatus; data: KeysPopulation | null }>({
    status: "loading",
    data: null,
  });
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((count) => count + 1), []);
  const asked = JSON.stringify(sources);
  const gone = useRef(onSourceGone);
  useEffect(() => {
    gone.current = onSourceGone;
  });

  useEffect(() => {
    const bridge = window.cuepoint?.getKeysPopulation;
    if (!bridge) {
      setState({ status: "unavailable", data: null });
      return;
    }
    setState({ status: "loading", data: null });
    if (!ready) return;
    let current = true;
    bridge({ sources: JSON.parse(asked) as KeySource[] })
      .then((data) => {
        if (current) setState({ status: "ready", data });
      })
      .catch((cause: unknown) => {
        if (
          bridgeErrorFields(cause).code === "SOURCE_NOT_FOUND" &&
          gone.current(cause instanceof Error ? cause.message : "")
        ) {
          return;
        }
        reportUnexpected(cause);
        if (current) setState({ status: "error", data: null });
      });
    return () => {
      current = false;
    };
  }, [asked, attempt, reloadToken, ready]);

  return { ...state, retry };
}
