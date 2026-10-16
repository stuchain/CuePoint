import type { HTMLAttributes, ReactNode } from "react";
import "./Card.css";

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** The card's name, in the section type role (14, bold). Without one, no heading row is drawn. */
  title?: ReactNode;
  /**
   * What the card counts or measures, or its one link, at the far right of the title row, muted
   * ("tracks", "BPM", "Last 30 days", a LinkButton). Never put it after the title.
   */
  unit?: ReactNode;
  /** The heading level of the title: 3 (the default) under a page title, 2 on a page of cards. */
  headingLevel?: 2 | 3 | 4;
  /** Extra classes for the heading row, the title and the body (a page's own layout hooks). */
  headClassName?: string;
  titleClassName?: string;
  bodyClassName?: string;
}

/**
 * The one card (area 64): the Statistics look everywhere. A hairline box padded 12, a title row
 * with the title at the left and its unit (or one link) at the far right, then the body, 8 below.
 * Settings sections (Panel) are the same card. Use it for any bordered block that has a name;
 * a block without a name is just the box (`<Card>` with no title).
 */
export function Card({
  title,
  unit,
  headingLevel = 3,
  headClassName = "",
  titleClassName = "",
  bodyClassName = "",
  className = "",
  children,
  ...rest
}: CardProps) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  const hasHead = (title !== undefined && title !== null && title !== "") || (unit !== undefined && unit !== null);
  return (
    <section className={`cp-card ${className}`.trim()} {...rest}>
      {hasHead && (
        <div className={`cp-card__head ${headClassName}`.trim()}>
          {title ? <Heading className={`cp-card__title ${titleClassName}`.trim()}>{title}</Heading> : <span />}
          {unit !== undefined && unit !== null && <span className="cp-card__unit">{unit}</span>}
        </div>
      )}
      <div className={`cp-card__body ${bodyClassName}`.trim()}>{children}</div>
    </section>
  );
}
