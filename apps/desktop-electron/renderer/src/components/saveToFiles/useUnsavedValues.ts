/**
 * How many tracks hold values the files do not (G4 step 4): the number the save bar shows.
 *
 * Read on mount and whenever something announces a library change, which a save
 * and a restore both do, while the page is shown (C23). A failed read keeps the last answer, so the bar does
 * not flicker away because one poll missed.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { UnsavedValues } from "../../api/cuepointBridge.types";
import { useLibraryChanges } from "../../api/libraryChanges";
import { reportUnexpected } from "../../reporting/reporting";

export function useUnsavedValues(
  active = true,
  refreshKey = 0,
): { unsaved: UnsavedValues | null; reload: () => Promise<void> } {
  const [unsaved, setUnsaved] = useState<UnsavedValues | null>(null);
  const alive = useRef(true);
  // Only the newest read may answer: a slow earlier one must not overwrite it.
  const latest = useRef(0);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    const read = window.cuepoint?.getUnsavedValues;
    if (!read) return;
    const mine = ++latest.current;
    try {
      const answer = await read();
      if (alive.current && mine === latest.current) setUnsaved(answer);
    } catch (cause) {
      reportUnexpected(cause);
    }
  }, []);

  // A page kept mounted while hidden reads nothing until it is shown again, then reads once;
  // a page's own refreshKey reads again after a change it made without announcing one.
  useEffect(() => {
    if (active) void reload();
  }, [active, refreshKey, reload]);
  useLibraryChanges(() => {
    if (active) void reload();
  });

  return { unsaved, reload };
}
