/**
 * How many tracks hold values the files do not (G4 step 4): the number the save bar shows.
 *
 * Read on mount and whenever something announces a library change, which a save
 * and a restore both do. A failed read keeps the last answer, so the bar does
 * not flicker away because one poll missed.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { UnsavedValues } from "../../api/cuepointBridge.types";
import { useLibraryChanges } from "../../api/libraryChanges";
import { reportUnexpected } from "../../reporting/reporting";

export function useUnsavedValues(): { unsaved: UnsavedValues | null; reload: () => Promise<void> } {
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

  useEffect(() => {
    void reload();
  }, [reload]);
  useLibraryChanges(() => void reload());

  return { unsaved, reload };
}
