/**
 * How many tracks the view would hold with no search and no filter (LIB-8).
 *
 * The toolbar says "Showing 240 of 12,000 tracks" while a search or filter
 * narrows the view, so it needs the other number: the scope's own size. When
 * nothing narrows the view the answer is the view's own total and nothing is
 * asked; otherwise one id of the same scope is requested (the id projection), for its `total`.
 */
import { useEffect, useRef, useState } from "react";

import { browseParams, type LibraryQuery } from "./libraryQuery";

/** True when a search or a filter narrows what the scope would show. */
export function isNarrowed(query: LibraryQuery): boolean {
  return query.q.trim() !== "" || (query.filters?.rules.length ?? 0) > 0;
}

export function useScopeTotal(
  query: LibraryQuery,
  viewTotal: number,
  /** Changes when the library does, so a stale answer is asked again. */
  identity: string,
): number {
  const narrowed = isNarrowed(query);
  const [asked, setAsked] = useState<{ key: string; total: number } | null>(null);
  const { playlistId, collectionId, scope } = query;
  // The effect reads the query's scope; `key` says when that scope changed, so a
  // keystroke in the search box does not ask again.
  const queryRef = useRef(query);
  queryRef.current = query;
  const key = `${playlistId}|${collectionId}|${scope}|${identity}`;

  useEffect(() => {
    if (!narrowed) return;
    const bridge = window.cuepoint?.browseLibrary;
    if (!bridge) return;
    let live = true;
    void bridge({ ...browseParams({ ...queryRef.current, q: "", filters: null }, 0, 1), fields: "id" })
      .then((response) => {
        if (live) setAsked({ key, total: response.total });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [narrowed, key]);

  if (!narrowed) return viewTotal;
  return asked && asked.key === key ? Math.max(asked.total, viewTotal) : viewTotal;
}
