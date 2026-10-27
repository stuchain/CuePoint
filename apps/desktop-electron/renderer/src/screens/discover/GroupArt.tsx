/**
 * A card's picture (DEC-076).
 *
 * Beatport's image never reaches the renderer as a URL: the engine fetches,
 * checks and re-encodes it, and the preload makes an object URL of the bytes.
 * The shared cover loader (`coverLoader.ts`) asks for it only once the card is
 * on or near the screen, a few at a time, and keeps it, so a card shown again
 * draws its picture at once; the loader releases it when it is evicted. A card
 * with no picture, or whose picture could not be read, is the shared
 * placeholder. Every card's picture is the same square, so nothing moves when it
 * arrives.
 *
 * "inspector" is the size asked for: a card is about 150-170 px wide at 1x
 * (more at 1.5x and on a dense screen), and "row" (108 px) would be blurry.
 */
import { useCallback } from "react";

import { ArtworkPlaceholder } from "../../components/ArtworkPlaceholder";
import { Art } from "../../components/Art";
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
  // A picture still coming is the empty tone, and fades in when it arrives (M385); a card known to
  // have none is the shared placeholder, the Track details cover. All are the card's one square
  // (M43, M175).
  const empty = !url && asks && !settled;

  return (
    <span ref={ref} className={`discover-card__art discover-card__art--${kind}`} aria-hidden="true">
      {url ? <Art src={url} alt="" draggable={false} /> : empty ? null : <ArtworkPlaceholder label="" />}
    </span>
  );
}
