/**
 * Library Health, read for the Clean page (CLEAN-12, DEC-075).
 *
 * One read the whole page shares: the counts Health draws, when each detection
 * last ran (which is what tells "no missing files" from "never checked"), and
 * the drives a check found disconnected. Read again after anything the page
 * starts finishes, because every job here can change a count.
 */
import { useMemo } from "react";

import type { LibraryHealth } from "../../api/cuepointBridge.types";
import { LIBRARY_HEALTH, useReportReadError, useSharedRead } from "../../api/sharedReads";
import { NEEDS_DESKTOP, userMessage } from "../../api/userMessage";

interface CleanHealth {
  health: LibraryHealth | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Read through the shared cache (C19d): the page shown again has its counts at
 * once, and Health is read again when the library announces a change or a job ends.
 * A failure behind counts already shown keeps them.
 */
export function useCleanHealth(): CleanHealth {
  const read = useSharedRead(LIBRARY_HEALTH);
  useReportReadError(read.error);

  const health = read.value ?? null;
  const error = read.unavailable
    ? NEEDS_DESKTOP
    : !read.value && read.error !== undefined
      ? userMessage(read.error)
      : null;
  const loading = !read.unavailable && read.loading;
  return useMemo(() => ({ health, error, loading, reload: read.refresh }), [health, error, loading, read.refresh]);
}
