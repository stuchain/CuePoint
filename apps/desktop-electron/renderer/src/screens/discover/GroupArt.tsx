/**
 * A card's picture (DEC-076).
 *
 * Beatport's image never reaches the renderer as a URL: the engine fetches,
 * checks and re-encodes it, the preload makes an object URL of the bytes, and
 * this releases it when the card goes. A card with no picture, or whose picture
 * could not be read, is the shared placeholder; an artist's is round.
 */
import { useEffect, useState } from "react";

import { ArtworkPlaceholder } from "../../components/ArtworkPlaceholder";
import type { DiscoverGroupKind } from "../../api/cuepointBridge.types";

interface GroupArtProps {
  runId: number;
  kind: DiscoverGroupKind;
  cardKey: string;
  hasArt: boolean;
}

export function GroupArt({ runId, kind, cardKey, hasArt }: GroupArtProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const bridge = window.cuepoint;
    if (!hasArt || !bridge?.getDiscoveryGroupArt) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let made: string | null = null;
    bridge
      .getDiscoveryGroupArt({ run_id: runId, kind, key: cardKey, size: "inspector" })
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
  }, [cardKey, hasArt, kind, runId]);

  // A card without a picture is the shared placeholder whatever its kind (an artist's stays round);
  // the card's title is the name under it, so there is no initial (C254).
  return (
    <span className={`discover-card__art discover-card__art--${kind}${url ? "" : " discover-card__art--placeholder"}`} aria-hidden="true">
      {url ? <img src={url} alt="" draggable={false} /> : <ArtworkPlaceholder label="" />}
    </span>
  );
}
