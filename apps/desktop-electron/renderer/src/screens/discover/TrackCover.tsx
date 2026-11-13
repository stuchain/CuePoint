/**
 * A Beatport track's cover: the small square at the start of the Title cell of every Beatport
 * table (a dig's results, the wantlist, Artist and Label pages, Following).
 *
 * Same plumbing as a card's picture (`GroupArt.tsx`): the engine fetches, checks and re-encodes
 * Beatport's release cover (DEC-076), the preload makes an object URL of the bytes, and the shared
 * cover loader asks for it only while the row is on or near the screen, a few at a time, and keeps
 * it. A track with no cover, or one whose cover could not be read, is a neutral square, so the
 * titles of every row start in the same place. The picture is decorative (the title sits beside
 * it), so its alt text is empty.
 */
import { useCallback } from "react";

import { Art } from "../../components/Art";
import { useCover } from "../../api/useCover";
import "./trackCover.css";

interface TrackCoverProps {
  trackId: number;
  hasArt: boolean;
}

const SIZE = "row";

export function TrackCover({ trackId, hasArt }: TrackCoverProps) {
  const asks = hasArt && typeof window !== "undefined" && typeof window.cuepoint?.getDiscoveryTrackArt === "function";
  const key = asks ? `discover-track:${trackId}:${SIZE}` : null;
  const fetch = useCallback(
    () => window.cuepoint?.getDiscoveryTrackArt?.({ track_id: trackId, size: SIZE }) ?? Promise.resolve(null),
    [trackId],
  );
  const { ref, url } = useCover(key, fetch);

  return (
    <span ref={ref} className="discover-track-cover" aria-hidden="true">
      {url ? <Art src={url} alt="" draggable={false} /> : null}
    </span>
  );
}
