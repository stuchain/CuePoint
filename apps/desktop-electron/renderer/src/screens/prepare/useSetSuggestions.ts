/**
 * What fits at the insertion point, asked of the engine (PREP-11, DEC-105).
 *
 * One request per gap, pool and side, and again whenever the Set is re-read,
 * because an edit anywhere can change what the neighbours are or what is
 * already in the Set. Three things make it safe to drive from a selection:
 *
 * - **A short wait before asking.** Walking the Set table with the arrow keys
 *   passes a gap a keystroke; only the one the user stops at is asked about,
 *   since the engine's worst case is 0.4 s at 50,000 tracks (PREP-04).
 * - **Only the latest answer lands.** An answer to a gap the selection has
 *   left is dropped rather than drawn under the new gap's words.
 * - **A refusal is its next step** (PREP-08): a `stale` gap means the Set
 *   changed under the view, so the page re-reads it and asks again; a Set that
 *   is gone is the page's to leave; anything else is said in the panel.
 */
import { useEffect, useRef, useState } from "react";

import type {
  SetRefusal,
  SetSuggestions,
  SetSuggestionsRequest,
} from "../../api/cuepointBridge.types";
import { reportUnexpected } from "../../reporting/reporting";

/** How long a gap must stay chosen before it is asked about. */
export const SUGGESTION_DELAY_MS = 150;

interface SetSuggestionsState {
  answer: SetSuggestions | null;
  loading: boolean;
  /** Why the list could not be read, in words, other than a refusal handled. */
  problem: string | null;
  retry: () => void;
}

interface SetSuggestionsOptions {
  /** The request for the gap, or null when there is nothing to ask. */
  request: SetSuggestionsRequest | null;
  /** Changes with every re-read of the Set: a new answer is owed. */
  revision: unknown;
  /** The Set changed under the view (`stale`): re-read it. */
  onStale: (refusal: SetRefusal) => void;
  /** The Set is gone: the page leaves. */
  onGone: (refusal: SetRefusal) => void;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function useSetSuggestions({
  request,
  revision,
  onStale,
  onGone,
}: SetSuggestionsOptions): SetSuggestionsState {
  const [answer, setAnswer] = useState<SetSuggestions | null>(null);
  const [answeredKey, setAnsweredKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef({ onStale, onGone });
  latest.current = { onStale, onGone };

  const key = request ? JSON.stringify(request) : null;

  useEffect(() => {
    const sets = window.cuepoint?.sets;
    if (!key || !sets) {
      setLoading(false);
      setProblem(null);
      return;
    }
    const asked = JSON.parse(key) as SetSuggestionsRequest;
    let current = true;
    setLoading(true);
    setProblem(null);
    const timer = window.setTimeout(() => {
      void sets
        .suggestions(asked)
        .then((reply) => {
          if (!current) return;
          setLoading(false);
          if (!reply.refusal) {
            setAnswer(reply.value);
            setAnsweredKey(key);
            return;
          }
          const refusal = reply.refusal;
          if (refusal.code === "SET_NOT_FOUND" && refusal.reason === "set") {
            latest.current.onGone(refusal);
          } else if (
            refusal.code === "SET_NOT_FOUND" ||
            (refusal.code === "SET_INSERTION_POINT_REFUSED" && refusal.reason === "stale")
          ) {
            latest.current.onStale(refusal);
          } else {
            setProblem(refusal.message);
          }
        })
        .catch((cause: unknown) => {
          reportUnexpected(cause);
          if (!current) return;
          setLoading(false);
          setProblem(messageOf(cause));
        });
    }, SUGGESTION_DELAY_MS);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [key, revision, attempt]);

  return {
    // Only the answer to the gap asked about now: never the last gap's list
    // under this gap's words.
    answer: key !== null && answeredKey === key ? answer : null,
    loading: key !== null && loading,
    problem: key !== null ? problem : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
