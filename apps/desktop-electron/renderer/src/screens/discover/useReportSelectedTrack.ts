/**
 * Tell the header's wheel which track this page has selected (PAGES-03, DEC-157).
 *
 * Each page owns its selection and the wheel needs only the track's key, so a
 * page reports `{ id, key }` here beside its Inspector. `key` is the track's
 * Camelot code, or null when it has none. The selection going away, or the page
 * going, clears it, so the wheel never lights a track that is no longer chosen.
 *
 * `enabled` is for a page with two tables, only one of which holds the
 * selection at a time: the one that does not holds back.
 */
import { useEffect } from "react";

import { setSelectedTrack, type SelectedTrack } from "../../components/shell/selectedTrack";

export function useReportSelectedTrack(track: SelectedTrack | null, enabled = true): void {
  const { id = null, key: camelot = null } = track ?? {};
  useEffect(() => {
    if (!enabled) return;
    setSelectedTrack(id === null ? null : { id, key: camelot });
  }, [enabled, id, camelot]);
  useEffect(() => {
    if (!enabled) return;
    return () => setSelectedTrack(null);
  }, [enabled]);
}

/** A Beatport row's id in the store: apart from every library track's number. */
export function beatportSelectedId(beatportTrackId: number): string {
  return `bp-${beatportTrackId}`;
}
