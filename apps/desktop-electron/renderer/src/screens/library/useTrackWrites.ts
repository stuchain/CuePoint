/**
 * What CuePoint wrote into one track's file, for the Inspector (CLEAN-13).
 *
 * Only the counts: how many written values a restore would undo, and how many
 * of those the engine never saw finish (CLEAN-11's `/tags/writes`). One row is
 * asked for, because the counts are whole whatever page is read.
 */
import { useEffect, useState } from "react";

export interface TrackWritesState {
  restorable: number;
  unconfirmed: number;
  /** True when this build has no record route: say nothing. */
  unavailable: boolean;
}

const NOTHING: TrackWritesState = { restorable: 0, unconfirmed: 0, unavailable: false };

export function useTrackWrites(trackId: number | null, version = 0): TrackWritesState {
  const [state, setState] = useState<TrackWritesState>(NOTHING);

  useEffect(() => {
    const bridge = window.cuepoint?.getTagWrites;
    if (!bridge) {
      setState({ ...NOTHING, unavailable: true });
      return;
    }
    if (trackId == null) {
      setState(NOTHING);
      return;
    }
    let cancelled = false;
    bridge({ trackId, limit: 1 })
      .then((record) => {
        if (cancelled) return;
        setState({
          restorable: record.restorable,
          unconfirmed: record.restorable_unconfirmed,
          unavailable: false,
        });
      })
      .catch(() => {
        // The record is a convenience here; the Activity entry still offers it.
        if (!cancelled) setState(NOTHING);
      });
    return () => {
      cancelled = true;
    };
  }, [trackId, version]);

  return state;
}
