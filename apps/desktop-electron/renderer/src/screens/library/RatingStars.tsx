/**
 * A rating drawn as stars (C104): the earned ones filled in the text colour, the rest outlined
 * and grey. Drawn with `PixelIcon`, never typed glyphs; the words ("3 stars") are the name a
 * screen reader reads.
 */
import { PixelIcon } from "../../components/PixelIcon";
import { starsFor } from "./filterText";
import { RATING_STARS } from "./trackEdits";
import "./RatingStars.css";

interface RatingStarsProps {
  /** How many are filled, 0 to 5. */
  count: number;
  /** Outline the empty ones up to this many; 0 draws only the filled ones. */
  of?: number;
  className?: string;
}

export function RatingStars({ count, of = RATING_STARS, className = "" }: RatingStarsProps) {
  const filled = Math.max(0, Math.min(RATING_STARS, Math.round(count)));
  const total = Math.max(filled, of);
  return (
    <span className={`library-stars ${className}`.trim()} role="img" aria-label={starsFor(filled)}>
      {Array.from({ length: total }, (_, index) => (
        <PixelIcon
          key={index}
          name={index < filled ? "star" : "star-outline"}
          size="sm"
          className={index < filled ? "library-stars__on" : "library-stars__off"}
        />
      ))}
    </span>
  );
}
