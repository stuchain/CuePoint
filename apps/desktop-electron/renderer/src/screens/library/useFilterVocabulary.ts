/**
 * What can be filtered, and what values a field takes (LIBUI-08, DEC-043).
 *
 * Two hooks over the two questions the filter bar asks the engine:
 *
 * `useFilterVocabulary` fetches the field list once — it changes only when
 * CuePoint itself changes — so the bar can offer exactly the fields and
 * operators the engine will accept, and no others.
 *
 * `useFacet` fetches one field's values on demand, scoped by everything in the
 * current view except that field's own rules, so choosing one genre leaves the
 * others choosable. It is asked when a value list is opened rather than
 * eagerly: a facet is a pass over the library, and there is no reason to make
 * it for a field nobody looked at.
 */
import { useCallback, useEffect, useState } from "react";

import type {
  LibraryFacet,
  LibraryFilterVocabulary,
} from "../../api/cuepointBridge.types";
import type { LibraryQuery } from "./libraryQuery";

export type VocabularyStatus = "loading" | "ready" | "error" | "unavailable";

export interface FilterVocabularyState {
  vocabulary: LibraryFilterVocabulary | null;
  status: VocabularyStatus;
  error: string | null;
}

export function useFilterVocabulary(): FilterVocabularyState {
  const [state, setState] = useState<FilterVocabularyState>({
    vocabulary: null,
    status: "loading",
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    const bridge = window.cuepoint?.getLibraryFilterFields;
    if (!bridge) {
      setState({ vocabulary: null, status: "unavailable", error: null });
      return;
    }
    void bridge()
      .then((vocabulary) => {
        if (cancelled) return;
        setState({ vocabulary, status: "ready", error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          vocabulary: null,
          status: "error",
          error: cause instanceof Error ? cause.message : String(cause),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export interface FacetState {
  facet: LibraryFacet | null;
  loading: boolean;
  error: string | null;
  /** Ask for a field's values, scoped by the current view. */
  load: (field: string) => void;
  clear: () => void;
}

export function useFacet(query: LibraryQuery): FacetState {
  const [facet, setFacet] = useState<LibraryFacet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (field: string) => {
      const bridge = window.cuepoint?.getLibraryFacet;
      if (!bridge) {
        setError("CuePoint's engine is not available in this window");
        return;
      }
      setLoading(true);
      setError(null);
      void bridge({
        field,
        q: query.q.trim() || undefined,
        playlistId: query.playlistId,
        filters: query.filters,
      })
        .then((next) => {
          // A facet for a field nobody is looking at any more is not an error,
          // just not wanted: the last field asked for is the one shown.
          setFacet(next);
          setLoading(false);
        })
        .catch((cause: unknown) => {
          setLoading(false);
          setError(cause instanceof Error ? cause.message : String(cause));
        });
    },
    [query.q, query.playlistId, query.filters],
  );

  const clear = useCallback(() => {
    setFacet(null);
    setError(null);
  }, []);

  return { facet, loading, error, load, clear };
}
