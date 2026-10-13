/**
 * What the candidate on screen looks and sounds like (C14, DEC-076).
 *
 * **Art** comes through the guarded route: the engine fetches, checks and
 * re-encodes it, the preload hands over an object URL, and a remote URL never
 * reaches the page. It is released when the candidate changes or the card goes.
 *
 * **The preview** is played by `useBeatportPreview`, shared with Discover's
 * rows: one sound at a time across the app, stopped by a new candidate, the
 * player starting or unmount. Offline, or with no sample, the answer is null
 * and the card says so: an empty state, not an error.
 */
import { useEffect, useState } from "react";

import { useBeatportPreview, type PreviewState } from "../../../components/preview/useBeatportPreview";

export type { PreviewState };

export interface CandidateMedia {
  artwork: string | null;
  preview: PreviewState;
  /** Play the preview, or stop it when it is playing. */
  togglePreview: () => void;
  stopPreview: () => void;
  /** False when this build cannot fetch previews at all. */
  canPreview: boolean;
}

export function useCandidateMedia(candidateId: number | null): CandidateMedia {
  const [artwork, setArtwork] = useState<string | null>(null);
  const sample = useBeatportPreview(
    candidateId == null ? null : { kind: "candidate", id: candidateId },
  );

  useEffect(() => {
    const bridge = window.cuepoint;
    if (candidateId == null || !bridge?.getCandidateArtwork) {
      setArtwork(null);
      return;
    }
    let cancelled = false;
    let made: string | null = null;
    bridge
      .getCandidateArtwork({ candidateId, size: "inspector" })
      .then((url) => {
        if (cancelled) {
          if (url) bridge.releaseTrackArtwork?.(url);
          return;
        }
        made = url;
        setArtwork(url);
      })
      .catch(() => {
        if (!cancelled) setArtwork(null);
      });
    return () => {
      cancelled = true;
      if (made) bridge.releaseTrackArtwork?.(made);
      setArtwork(null);
    };
  }, [candidateId]);

  return {
    artwork,
    preview: sample.state,
    togglePreview: sample.toggle,
    stopPreview: sample.stop,
    canPreview: sample.canPreview,
  };
}
