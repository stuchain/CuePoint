/**
 * "No tracks have a Beatport key yet. Keys come from matching." (DEC-201)
 *
 * Under DEC-201 a track's key is its accepted Beatport match's, or the user's
 * own correction, and Rekordbox's is never used. A library nobody has matched
 * therefore has no keys at all, and a Key column of dashes with no word of
 * explanation reads as a broken import. This is the word, on the notice line,
 * with **Match tracks…** (Clean's matching) as the next step.
 *
 * It asks the engine, over the whole library, rather than guessing from the
 * rows on screen: a note that is wrong about the user's own library is worse
 * than none, so it stays quiet when the engine cannot say.
 */
import { useEffect, useState } from "react";

import { Button } from "../../components";
import { reportUnexpected } from "../../reporting/reporting";
import { rememberKeyNoteDismissal, wasKeyNoteDismissed } from "./libraryNoticeMemory";
import "./LibraryNotice.css";

interface LibraryKeyNoteProps {
  /** The library's tracks; a library with none has a bigger thing to say. */
  trackCount: number;
  /** Open matching. Absent, the note says why and offers nothing it cannot do. */
  onMatch?: () => void;
}

export function LibraryKeyNote({ trackCount, onMatch }: LibraryKeyNoteProps) {
  const [none, setNone] = useState(false);
  const [dismissed, setDismissed] = useState(wasKeyNoteDismissed);

  useEffect(() => {
    const facet = window.cuepoint?.getLibraryFacet;
    if (!facet || trackCount <= 0) return;
    let cancelled = false;
    void facet({ field: "key", playlistId: null, collectionId: null })
      .then((answer) => {
        // The "no key" bucket is the one with a null value. An answer with no
        // buckets at all says nothing about keys, so it says nothing.
        const keyed = answer.values.some((entry) => entry.value !== null && entry.count > 0);
        if (!cancelled) setNone(answer.values.length > 0 && !keyed);
      })
      .catch((error: unknown) => {
        reportUnexpected(error);
      });
    return () => {
      cancelled = true;
    };
  }, [trackCount]);

  if (!none || dismissed) return null;

  const dismiss = () => {
    rememberKeyNoteDismissal();
    setDismissed(true);
  };

  return (
    <div className="library-notice" role="status" aria-label="No Beatport keys yet">
      <p className="library-notice__line">
        No tracks have a Beatport key yet. Keys come from matching.
      </p>
      <div className="library-notice__actions">
        {onMatch && (
          <Button variant="primary" onClick={onMatch}>
            Match tracks…
          </Button>
        )}
        <Button variant="secondary" onClick={dismiss} aria-label="Dismiss this note">
          Dismiss
        </Button>
      </div>
    </div>
  );
}
