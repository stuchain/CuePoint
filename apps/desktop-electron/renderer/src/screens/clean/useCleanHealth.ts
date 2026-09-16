/**
 * Library Health, read for the Clean page (CLEAN-12, DEC-075).
 *
 * One read the whole page shares: the counts Health draws, when each detection
 * last ran (which is what tells "no missing files" from "never checked"), and
 * the drives a check found disconnected. Read again after anything the page
 * starts finishes, because every job here can change a count.
 */
import { useCallback, useEffect, useState } from "react";

import type { LibraryHealth } from "../../api/cuepointBridge.types";

export interface CleanHealth {
  health: LibraryHealth | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

export function useCleanHealth(): CleanHealth {
  const [health, setHealth] = useState<LibraryHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    const bridge = window.cuepoint?.getLibraryHealth;
    if (!bridge) {
      setLoading(false);
      setError("CuePoint's engine is not available in this window");
      return;
    }
    let cancelled = false;
    setLoading(true);
    bridge()
      .then((payload) => {
        if (cancelled) return;
        setHealth(payload);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reloads]);

  const reload = useCallback(() => setReloads((value) => value + 1), []);

  return { health, error, loading, reload };
}
