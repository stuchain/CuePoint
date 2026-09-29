/**
 * One Set as the Prepare page shows it, and every edit to it (PREP-10).
 *
 * The page reads three answers together: the plan (chapters, times, running
 * time), the entries (each beside the Library's own row for its track) and the
 * analysis (DEC-106's warnings). Every edit is one engine call followed by one
 * re-read of all three, as the Collections tree does it: the alternative is a
 * second copy of the rules about chapters and times in the renderer, and the
 * copy here would be the one that is wrong.
 *
 * A refusal is drawn for what it is (PREP-08):
 *
 * - `SET_NOT_FOUND` for the Set: it went in another window, or by a refresh,
 *   so the page says so and leaves (`gone`).
 * - `SET_NOT_FOUND` for a chapter or an entry, and a `stale` insertion point:
 *   something moved under the gesture, so the page says so and re-reads.
 * - Anything else (`INVALID_REQUEST`): the engine's words, and nothing moves.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  SetAnalysis,
  SetAnswer,
  SetEntries,
  SetPlan,
  SetRefusal,
  SetsBridge,
} from "../../api/cuepointBridge.types";
import { useLibraryChanges } from "../../api/libraryChanges";

export interface PreparedSet {
  setId: number;
  plan: SetPlan;
  entries: SetEntries;
  analysis: SetAnalysis;
}

export type Tone = "success" | "warning";

export interface EditOptions {
  onRefused?: (message: string) => void;
}

export interface PreparedSetOptions {
  /** The Set the page names, or null for none. */
  setId: number | null;
  onMessage: (message: string, tone: Tone) => void;
  /** The Set is gone: the page forgets it and opens another. */
  onGone: (refusal: SetRefusal) => void;
}

export interface PreparedSetController {
  /** The Set read last, only when it is the one named. */
  set: PreparedSet | null;
  loading: boolean;
  /** Why the Set could not be read, other than being gone. */
  problem: string | null;
  reload: () => void;
  /**
   * Run one edit. Answers its value, or null when it was refused or failed,
   * having said why. Every accepted edit re-reads the Set. `onRefused` takes
   * the words of a refusal a dialog shows beside its fields rather than in a
   * toast; a Set, chapter or entry that is gone is still handled here.
   */
  edit: <T>(
    run: (sets: SetsBridge) => Promise<SetAnswer<T>>,
    options?: EditOptions,
  ) => Promise<T | null>;
  /**
   * Run one Collection write on the Set's entries (adding and removing stay on
   * the Collection routes, PREP-02), which throws rather than refuses.
   */
  write: <T>(run: () => Promise<T>) => Promise<T | null>;
}

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

type Read =
  | { kind: "read"; set: PreparedSet }
  | { kind: "refused"; refusal: SetRefusal }
  | { kind: "failed"; message: string };

async function readSet(sets: SetsBridge, setId: number): Promise<Read> {
  try {
    const [plan, entries, analysis] = await Promise.all([
      sets.plan({ set_id: setId }),
      sets.entries({ set_id: setId }),
      sets.analysis({ set_id: setId }),
    ]);
    const refusal = plan.refusal ?? entries.refusal ?? analysis.refusal;
    if (refusal) return { kind: "refused", refusal };
    return {
      kind: "read",
      set: {
        setId,
        plan: plan.value as SetPlan,
        entries: entries.value as SetEntries,
        analysis: analysis.value as SetAnalysis,
      },
    };
  } catch (cause) {
    return { kind: "failed", message: messageOf(cause) };
  }
}

export function usePreparedSet({
  setId,
  onMessage,
  onGone,
}: PreparedSetOptions): PreparedSetController {
  const [set, setSet] = useState<PreparedSet | null>(null);
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [reads, setReads] = useState(0);
  // The latest callbacks, so a read in flight reports through the current page.
  const latest = useRef({ onMessage, onGone });
  latest.current = { onMessage, onGone };

  const reload = useCallback(() => setReads((n) => n + 1), []);

  useEffect(() => {
    const sets = window.cuepoint?.sets;
    if (setId === null || !sets) return;
    let current = true;
    setLoading(true);
    void readSet(sets, setId).then((result) => {
      if (!current) return;
      setLoading(false);
      if (result.kind === "read") {
        setSet(result.set);
        setProblem(null);
      } else if (result.kind === "refused" && result.refusal.code === "SET_NOT_FOUND") {
        latest.current.onGone(result.refusal);
      } else {
        setProblem(result.kind === "refused" ? result.refusal.message : result.message);
      }
    });
    return () => {
      current = false;
    };
  }, [reads, setId]);

  // A track edited anywhere — a BPM typed in the Inspector, a match applied,
  // a batch reverted — changes what this Set's rows and warnings say.
  useLibraryChanges(reload);

  const refused = useCallback(
    (refusal: SetRefusal, options?: EditOptions) => {
      if (refusal.code === "SET_NOT_FOUND" && refusal.reason === "set") {
        onGone(refusal);
        return;
      }
      const moved =
        refusal.code === "SET_NOT_FOUND" ||
        (refusal.code === "SET_INSERTION_POINT_REFUSED" && refusal.reason === "stale");
      if (moved) {
        onMessage(refusal.message, "warning");
        reload();
        return;
      }
      if (options?.onRefused) options.onRefused(refusal.message);
      else onMessage(refusal.message, "warning");
    },
    [onGone, onMessage, reload],
  );

  const edit = useCallback(
    async <T,>(
      run: (sets: SetsBridge) => Promise<SetAnswer<T>>,
      options?: EditOptions,
    ): Promise<T | null> => {
      const sets = window.cuepoint?.sets;
      if (!sets) return null;
      try {
        const answer = await run(sets);
        if (answer.refusal) {
          refused(answer.refusal, options);
          return null;
        }
        reload();
        return answer.value;
      } catch (cause) {
        onMessage(messageOf(cause), "warning");
        return null;
      }
    },
    [onMessage, refused, reload],
  );

  const write = useCallback(
    async <T,>(run: () => Promise<T>): Promise<T | null> => {
      try {
        const value = await run();
        reload();
        return value;
      } catch (cause) {
        onMessage(messageOf(cause), "warning");
        // An entry another window removed is refused as a failure here; the
        // re-read shows what is there now.
        reload();
        return null;
      }
    },
    [onMessage, reload],
  );

  return {
    set: set && set.setId === setId ? set : null,
    loading,
    problem,
    reload,
    edit,
    write,
  };
}
