/**
 * A Beatport candidate's cover for its row in the candidate panel, through the guarded route
 * (DEC-076): the engine decodes and re-encodes it, main hands over bytes and the preload makes
 * an object URL. The URL is released when the candidate changes or the row goes away, because
 * each one holds an image in memory. A request still in flight when the row goes away is
 * released as it arrives.
 */
import { useEffect, useState } from "react";

import type { ArtworkSize } from "../../api/cuepointBridge.types";

export function useCandidateArtwork(candidateId: number | null, size: ArtworkSize = "row"): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const bridge = window.cuepoint;
    if (candidateId == null || !bridge?.getCandidateArtwork) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let made: string | null = null;
    bridge
      .getCandidateArtwork({ candidateId, size })
      .then((object) => {
        if (cancelled) {
          if (object) bridge.releaseTrackArtwork?.(object);
          return;
        }
        made = object;
        setUrl(object);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
      if (made) bridge.releaseTrackArtwork?.(made);
      setUrl(null);
    };
  }, [candidateId, size]);

  return url;
}
