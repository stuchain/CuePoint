/**
 * The places a review can be scoped to (CLEAN-12).
 *
 * Read once when the queue opens: the Rekordbox playlist tree and CuePoint's
 * Collections. Either read failing leaves the whole library to review, which
 * is still the page working rather than a page that will not open.
 */
import { useEffect, useState } from "react";

import type { SelectOption } from "../../components/Select";
import { scopeOptions } from "./cleanRules";

export function useScopeOptions(): SelectOption[] {
  const [options, setOptions] = useState<SelectOption[]>(() => scopeOptions([], []));

  useEffect(() => {
    const bridge = window.cuepoint;
    let cancelled = false;
    void Promise.all([
      bridge?.getLibraryPlaylists?.().catch(() => null) ?? Promise.resolve(null),
      bridge?.getCollections?.().catch(() => null) ?? Promise.resolve(null),
    ]).then(([playlists, collections]) => {
      if (cancelled) return;
      setOptions(scopeOptions(playlists?.playlists ?? [], collections?.collections ?? []));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return options;
}
