/**
 * The Inspector's picture of a track (CLEAN-13, DEC-076).
 *
 * The file's own artwork, else Beatport's for an accepted match, as CLEAN-09's
 * guarded route decodes and shrinks it. When there is none the box says so
 * rather than collapsing, so the header does not jump between tracks.
 */
import { useTrackArtwork } from "../clean/useTrackArtwork";

export function TrackArtwork({ trackId, version }: { trackId: number; version: number }) {
  const url = useTrackArtwork(trackId, "inspector", version);
  return (
    <div className="cp-track-detail__artwork">
      {url ? (
        <img src={url} alt="Artwork" />
      ) : (
        <span className="cp-track-detail__artwork-none">No artwork</span>
      )}
    </div>
  );
}
