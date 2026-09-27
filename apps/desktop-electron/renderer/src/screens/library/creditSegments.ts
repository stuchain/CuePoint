/**
 * A credit as text with each artist in it a link (DISCOVER-11).
 *
 * The engine splits "Mara Veil, DJEFF feat. Kiko" into its three artists
 * (`split_credit`, DISCOVER-03) and says which page each opens. The Inspector
 * still shows the credit as it was written — the comma and the "feat." are
 * the track's, not CuePoint's — so each name is found in the text, in order,
 * and becomes a link where it stands.
 *
 * A name the text does not spell as the split did (whitespace the split
 * collapsed, say) is added after it, so no artist the engine named is lost.
 */
import type { TrackCreditLink } from "../../api/cuepointBridge.types";

export interface CreditSegment {
  text: string;
  /** Present when this part of the credit is a name to link. */
  link?: TrackCreditLink;
}

export function creditSegments(
  credit: string,
  links: readonly TrackCreditLink[],
): CreditSegment[] {
  const segments: CreditSegment[] = [];
  const unplaced: TrackCreditLink[] = [];
  let at = 0;
  for (const link of links) {
    const found = link.name === "" ? -1 : credit.indexOf(link.name, at);
    if (found === -1) {
      unplaced.push(link);
      continue;
    }
    if (found > at) segments.push({ text: credit.slice(at, found) });
    segments.push({ text: link.name, link });
    at = found + link.name.length;
  }
  if (at < credit.length) segments.push({ text: credit.slice(at) });
  for (const link of unplaced) {
    if (segments.length > 0) segments.push({ text: ", " });
    segments.push({ text: link.name, link });
  }
  return segments;
}
