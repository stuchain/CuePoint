/**
 * One track's full record, for the Inspector (LIBUI-09, DEC-047).
 *
 * Asked for when the selection changes, not held for every row: the table
 * shows a window of a library, and the panel shows one track.
 */
import { useCallback, useEffect, useState } from "react";

import type { LibraryTrackDetail } from "../../api/cuepointBridge.types";

export interface TrackDetailState {
  detail: LibraryTrackDetail | null;
  loading: boolean;
  error: string | null;
  /**
   * Read it again for the same track.
   *
   * Wanted when something outside this panel changed what it says: renaming a
   * tag in ORG-12's manager changes a chip on every track that carries it, and
   * a panel that kept the old name until the selection moved would be showing
   * a name that no longer exists.
   */
  reload: () => void;
}

export function useTrackDetail(trackId: number | null): TrackDetailState {
  const [state, setState] = useState<Omit<TrackDetailState, "reload">>({
    detail: null,
    loading: false,
    error: null,
  });
  const [reloads, setReloads] = useState(0);
  const reload = useCallback(() => setReloads((count) => count + 1), []);

  useEffect(() => {
    if (trackId == null) {
      setState({ detail: null, loading: false, error: null });
      return;
    }
    const bridge = window.cuepoint?.getLibraryTrack;
    if (!bridge) {
      setState({
        detail: null,
        loading: false,
        error: "CuePoint's engine is not available in this window",
      });
      return;
    }

    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    void bridge({ trackId })
      .then((detail) => {
        // A track nobody is looking at any more: dropped rather than shown
        // over the one that is.
        if (cancelled) return;
        setState({ detail, loading: false, error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          detail: null,
          loading: false,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [trackId, reloads]);

  return { ...state, reload };
}
