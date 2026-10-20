/**
 * A Beatport candidate's cover for its row in the candidate panel, through the guarded route
 * (DEC-076): the engine decodes and re-encodes it, main hands over bytes and the preload makes
 * an object URL. It goes through the shared cover loader (`coverLoader.ts`): asked for only
 * while the row is on or near the screen, a few at a time, and kept, so a panel opened again on
 * the same candidates draws them at once. Each URL holds an image in memory; the loader
 * releases it when it is evicted, never while a row draws it.
 */
import { useCallback } from "react";

import type { ArtworkSize } from "../../api/cuepointBridge.types";
import { useCover, type Cover } from "../../api/useCover";

/** `ref` goes on the candidate's row; `url` is its cover, or null for the placeholder. */
export function useCandidateArtwork(candidateId: number | null, size: ArtworkSize = "row"): Cover {
  const asks =
    candidateId != null && typeof window !== "undefined" && typeof window.cuepoint?.getCandidateArtwork === "function";
  const key = asks ? `candidate:${candidateId}:${size}` : null;
  const fetch = useCallback(
    () =>
      candidateId == null
        ? Promise.resolve(null)
        : (window.cuepoint?.getCandidateArtwork?.({ candidateId, size }) ?? Promise.resolve(null)),
    [candidateId, size],
  );
  return useCover(key, fetch);
}
