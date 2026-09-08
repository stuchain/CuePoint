/**
 * One track's field history, for the Inspector (ORG-10, DEC-008).
 *
 * DEC-008 chose per-field history over an undo stack, and this is the first
 * place that promise is visible: what changed, what it was, who changed it.
 * Read-only in this phase — CuePoint's own fields are deliberately not in
 * `REVERTABLE_FIELDS`, and a revert button that worked for four fields and
 * refused for three would be worse than none.
 *
 * It re-reads after every accepted write rather than appending locally,
 * because the engine decides what counts as a change: re-saving the same note
 * writes no history at all, and a local append would show an entry that does
 * not exist.
 */
import { useEffect, useState } from "react";

import type { TrackFieldChange } from "../../api/cuepointBridge.types";

/**
 * How much history the panel asks for.
 *
 * A page, not a life story — the engine caps at 500 and defaults to 100, and a
 * track edited in a 40,000-track batch every week has more entries than
 * anybody scrolls.
 */
export const HISTORY_LIMIT = 50;

export interface TrackHistoryState {
  changes: TrackFieldChange[];
  loading: boolean;
  error: string | null;
  /** True when this build's bridge has no history route at all. */
  unavailable: boolean;
}

export function useTrackHistory(trackId: number | null, version = 0): TrackHistoryState {
  const [state, setState] = useState<TrackHistoryState>({
    changes: [],
    loading: false,
    error: null,
    unavailable: false,
  });

  useEffect(() => {
    if (trackId == null) {
      setState({ changes: [], loading: false, error: null, unavailable: false });
      return;
    }
    const bridge = window.cuepoint?.getTrackHistory;
    if (!bridge) {
      setState({ changes: [], loading: false, error: null, unavailable: true });
      return;
    }

    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    void bridge({ trackId, limit: HISTORY_LIMIT })
      .then((payload) => {
        if (cancelled) return;
        setState({
          changes: payload.changes,
          loading: false,
          error: null,
          unavailable: false,
        });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          changes: [],
          loading: false,
          error: cause instanceof Error ? cause.message : String(cause),
          unavailable: false,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [trackId, version]);

  return state;
}
