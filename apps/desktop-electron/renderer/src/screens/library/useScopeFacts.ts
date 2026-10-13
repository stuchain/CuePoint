/**
 * What the scope holds (K9): its size, running time, BPM range and keys, for
 * the Library header's summary line.
 *
 * The header describes the playlist or Collection you are in, not the current
 * search, so the question is asked with no search and no filter, and only when
 * the scope (or the library) changes. Typing in the search box never asks
 * again. An answer is kept with the key it was asked for, so the numbers of the
 * scope the user has just left are never shown beside the new scope's name; a
 * late answer for an old key is dropped.
 */
import { useEffect, useRef, useState } from "react";

import type { LibraryQuickFacets } from "../../api/cuepointBridge.types";
import { reportUnexpected } from "../../reporting/reporting";
import type { LibraryQuery } from "./libraryQuery";

/** Which scope to describe: the three fields of a query that name one. */
export type ScopeDescriptor = Pick<LibraryQuery, "playlistId" | "collectionId" | "scope">;

export function useScopeFacts(
  descriptor: ScopeDescriptor,
  /** Changes when the library does, so a stale answer is asked again. */
  identity: string,
): { facts: LibraryQuickFacets | null } {
  const [asked, setAsked] = useState<{ key: string; facts: LibraryQuickFacets } | null>(null);
  const { playlistId, collectionId, scope } = descriptor;
  const descriptorRef = useRef(descriptor);
  descriptorRef.current = descriptor;
  const key = `${playlistId}|${collectionId}|${scope}|${identity}`;

  useEffect(() => {
    const bridge = window.cuepoint?.getLibraryQuickFacets;
    if (!bridge) return;
    let live = true;
    const current = descriptorRef.current;
    void bridge({
      q: "",
      playlistId: current.playlistId,
      filters: null,
      ...(current.scope ? { scope: current.scope } : {}),
      collectionId: current.collectionId,
    })
      .then((facts) => {
        if (live) setAsked({ key, facts });
      })
      .catch((cause: unknown) => {
        // An engine refusal (a 4xx) is an answer, not a fault; the header then
        // shows only the count it already knows.
        const status = (cause as { status?: unknown } | null)?.status;
        if (typeof status !== "number" || status >= 500) reportUnexpected(cause);
      });
    return () => {
      live = false;
    };
  }, [key]);

  return { facts: asked && asked.key === key ? asked.facts : null };
}
