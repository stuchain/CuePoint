import { PixelIcon } from "./PixelIcon";
import "./ArtworkPlaceholder.css";

/**
 * The one stand-in for artwork that is not there: a quiet square with a pixel waveform. It fills
 * the box it is put in, so the layout does not jump between a track with a picture and one without.
 */
export function ArtworkPlaceholder({ className = "", label = "No artwork" }: { className?: string; label?: string }) {
  return (
    <div className={`cp-artwork-placeholder ${className}`.trim()} role="img" aria-label={label}>
      <PixelIcon name="waveform" size="lg" />
    </div>
  );
}
