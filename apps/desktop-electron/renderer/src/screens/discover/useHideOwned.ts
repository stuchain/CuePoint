/** The hide switch's remembered state, shared by every page that has the switch (DSC-6). */
import { useCallback, useState } from "react";

import type { DiscoverOwnedFilter } from "../../api/cuepointBridge.types";

/** Where the switch is remembered: one value for Results and the artist and label pages. */
export const HIDE_OWNED_STORAGE_KEY = "cuepoint-discover-hide-owned";

function loadHiding(): boolean {
  try {
    return localStorage.getItem(HIDE_OWNED_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

/** The switch's state as the engine's filter: "hide" (the default) or "all". */
export function useHideOwned(): [DiscoverOwnedFilter, (hiding: boolean) => void] {
  const [hiding, setHiding] = useState(loadHiding);
  const set = useCallback((next: boolean) => {
    setHiding(next);
    try {
      localStorage.setItem(HIDE_OWNED_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // Not remembered; the switch still works for this visit.
    }
  }, []);
  return [hiding ? "hide" : "all", set];
}
