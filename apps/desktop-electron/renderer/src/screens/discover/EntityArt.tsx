/**
 * The picture of a Beatport artist or label (DEC-318): in Following's suggestions and follow list,
 * and in the header of an Artist or Label page.
 *
 * The same road as a card's picture (`GroupArt.tsx`) and a track's cover (`TrackCover.tsx`): the
 * engine reads the picture, checks and re-encodes it (DEC-076), the preload makes an object URL of
 * the bytes and the shared cover loader asks for it once the element is on or near the screen. The
 * renderer never sees Beatport's URL.
 *
 * It asks only when the row says a picture is known or can still be asked for (`hasArt`) and the
 * caller lets it (`ask`): a page that is still being harvested for pictures waits. While the
 * picture is coming, and for a name with none or one that could not be read, the box is the same
 * neutral tone, so nothing moves when a picture arrives. The picture is decorative: the name sits
 * beside it, so it is hidden from assistive tech and has empty alt text.
 *
 * `className` names the box (its size, and its `--artist` and `--label` shapes: round for an
 * artist, square for a label); the picture fills it, cropped.
 */
import { useCallback, useRef } from "react";

import { Art } from "../../components/Art";
import type { ArtworkSize, EntityKind } from "../../api/cuepointBridge.types";
import { entityCovers } from "../../api/coverLoader";
import { useCover } from "../../api/useCover";
import "./entityArt.css";

interface EntityArtProps {
  kind: EntityKind;
  beatportId: number;
  /** Whether a picture is known or can still be asked for (the row's `has_art`). */
  hasArt: boolean;
  /** False while something else is about to keep the picture, so it is not asked for twice. */
  ask?: boolean;
  size?: ArtworkSize;
  className: string;
}

export function EntityArt({ kind, beatportId, hasArt, ask = true, size = "row", className }: EntityArtProps) {
  const id = `discover-entity:${kind}:${beatportId}:${size}`;
  const usable = hasArt && typeof window !== "undefined" && typeof window.cuepoint?.getDiscoveryEntityArt === "function";
  // `ask` gates only the request, never what is drawn: once a name's picture has been asked for
  // (or is already kept by the loader), it stays on screen when the caller holds `ask` back
  // again, as a check restarts or a page reads its rows again.
  const latched = useRef<string | null>(null);
  if (usable && ask) latched.current = id;
  if (usable && latched.current !== id && keptAnswer(id)) latched.current = id;
  const key = usable && latched.current === id ? id : null;
  const fetch = useCallback(
    () => window.cuepoint?.getDiscoveryEntityArt?.({ kind, beatport_id: beatportId, size }) ?? Promise.resolve(null),
    [beatportId, kind, size],
  );
  const { ref, url } = useCover(key, fetch, entityCovers);

  return (
    <span ref={ref} className={`discover-entity-art ${className} ${className}--${kind}`} aria-hidden="true">
      {url ? <Art src={url} alt="" draggable={false} /> : null}
    </span>
  );
}

/** Whether the shared loader already keeps an answer for `id` (a picture or "none"). */
function keptAnswer(id: string): boolean {
  const hit = entityCovers.hold(id);
  if (hit === undefined) return false;
  entityCovers.letGo(id);
  return true;
}
