/**
 * A card's picture (DEC-076).
 *
 * Beatport's image never reaches the renderer as a URL: the engine fetches,
 * checks and re-encodes it, the preload makes an object URL of the bytes, and
 * this releases it when the card goes. A card with no picture, or whose picture
 * could not be read, is a plain tile with the card's initial; an artist's is
 * round.
 */
import { useEffect, useState } from "react";

import { ArtworkPlaceholder } from "../../components/ArtworkPlaceholder";
import type { DiscoverGroupKind } from "../../api/cuepointBridge.types";

interface GroupArtProps {
  runId: number;
  kind: DiscoverGroupKind;
  cardKey: string;
  name: string;
  hasArt: boolean;
}

export function GroupArt({ runId, kind, cardKey, name, hasArt }: GroupArtProps) {
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

  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "";
  // A chart without a cover is the shared placeholder, as in Clean and Track details; the card's
  // title is the name under it.
  if (!url && kind === "chart") {
    return (
      <span className="discover-card__art discover-card__art--placeholder" aria-hidden="true">
        <ArtworkPlaceholder label="" />
      </span>
    );
  }
  return (
    <span className={`discover-card__art discover-card__art--${kind}`} aria-hidden="true">
      {url ? <img src={url} alt="" draggable={false} /> : <span className="discover-card__initial">{initial}</span>}
    </span>
  );
}
