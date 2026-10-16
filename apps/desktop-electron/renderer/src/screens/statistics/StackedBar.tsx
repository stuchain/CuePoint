/**
 * One bar split into its parts, with a legend under it that names each part and its count.
 *
 * It is a picture of numbers the card also writes out (the legend, and the rows under it), so
 * the bar itself is one image with a spoken summary. A part with nothing in it is left out of
 * the bar and kept in the legend, so a person sees that it was counted.
 */
import { formatCount } from "../../format/counts";

export type BarTone = "success" | "warning" | "danger" | "neutral" | "muted" | "accent";

export interface BarPart {
  id: string;
  label: string;
  count: number;
  tone: BarTone;
}

export function StackedBar({
  title,
  parts,
  legend = true,
}: {
  title: string;
  parts: readonly BarPart[];
  /** False when the card's own list is the legend (Health: swatch, label, count on one line). */
  legend?: boolean;
}) {
  const total = parts.reduce((sum, part) => sum + part.count, 0);
  const spoken = parts.map((part) => `${part.label} ${formatCount(part.count)}`).join(", ");
  return (
    <div className="stacked">
      {total > 0 && (
        <div className="stacked__bar" role="img" aria-label={`${title}: ${spoken}`}>
          {parts
            .filter((part) => part.count > 0)
            .map((part) => (
              <span
                key={part.id}
                className={`stacked__part stacked__part--${part.tone}`}
                style={{ flexGrow: part.count }}
              />
            ))}
        </div>
      )}
      {legend && (
      <ul className="stacked__legend">
        {parts.map((part) => (
          <li key={part.id} className="stacked__item">
            <span className={`stacked__swatch stacked__part--${part.tone}`} aria-hidden="true" />
            {`${part.label} ${formatCount(part.count)}`}
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}
