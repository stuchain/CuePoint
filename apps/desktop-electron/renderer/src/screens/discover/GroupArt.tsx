/**
 * A card's picture (DEC-076).
 *
 * Beatport's image never reaches the renderer as a URL: the engine fetches,
 * checks and re-encodes it, and the preload makes an object URL of the bytes.
 * The shared cover loader (`coverLoader.ts`) asks for it only once the card is
 * on or near the screen, a few at a time, and keeps it, so a card shown again
 * draws its picture at once; the loader releases it when it is evicted. A card
 * with no picture, or whose picture could not be read, is the shared
 * placeholder; an artist's is round. A picture still coming keeps the card's
 * square, so nothing moves when it arrives.
 *
 * "inspector" is the size asked for: a card is about 150-170 px wide at 1x
 * (more at 1.5x and on a dense screen), and "row" (108 px) would be blurry.
 */
import { useCallback } from "react";

import { ArtworkPlaceholder } from "../../components/ArtworkPlaceholder";
import type { DiscoverGroupKind } from "../../api/cuepointBridge.types";
import { useCover } from "../../api/useCover";

interface GroupArtProps {
  runId: number;
  kind: DiscoverGroupKind;
  cardKey: string;
  hasArt: boolean;
}

const SIZE = "inspector";

export function GroupArt({ runId, kind, cardKey, hasArt }: GroupArtProps) {
  const asks = hasArt && typeof window !== "undefined" && typeof window.cuepoint?.getDiscoveryGroupArt === "function";
  const key = asks ? `discover-group:${runId}:${kind}:${cardKey}:${SIZE}` : null;
  const fetch = useCallback(
    () => window.cuepoint?.getDiscoveryGroupArt?.({ run_id: runId, kind, key: cardKey, size: SIZE }) ?? Promise.resolve(null),
    [cardKey, kind, runId],
  );
  const { ref, url, settled } = useCover(key, fetch);
  // The placeholder's band only for a card known to have no picture; one still coming keeps its square.
  const placeholder = !url && (!asks || settled);

  // A card without a picture is the shared placeholder whatever its kind (an artist's stays round);
  // the card's title is the name under it, so there is no initial (C254).
  return (
    <span
      ref={ref}
      className={`discover-card__art discover-card__art--${kind}${placeholder ? " discover-card__art--placeholder" : ""}`}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" draggable={false} /> : <ArtworkPlaceholder label="" />}
    </span>
  );
}
