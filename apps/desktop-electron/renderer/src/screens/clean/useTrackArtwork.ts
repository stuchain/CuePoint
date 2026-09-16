/**
 * A track's artwork thumbnail, through CLEAN-09's guarded route (DEC-076).
 *
 * The only way a picture reaches this page: the engine decodes and re-encodes
 * it, main hands over bytes, and the preload makes an object URL. A candidate's
 * Beatport image URL is never drawn directly — that would put an image no
 * guard has seen into the renderer, which DEC-076's amendment exists to rule
 * out. The URL is released when the track changes or the panel goes away,
 * because each one holds an image in memory.
 */
import { useEffect, useState } from "react";

import type { ArtworkSize } from "../../api/cuepointBridge.types";

export function useTrackArtwork(
  trackId: number | null,
  size: ArtworkSize,
  version = 0,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const bridge = window.cuepoint;
    if (trackId == null || !bridge?.getTrackArtwork) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let made: string | null = null;
    bridge
      .getTrackArtwork({ trackId, size })
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
  }, [trackId, size, version]);

  return url;
}
