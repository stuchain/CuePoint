import type { HTMLAttributes, ReactNode } from "react";
import { Card } from "./Card";
import "./Panel.css";

interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: string;
  /** At the far right of the title row (a SavedTick, a Badge): the card's unit. */
  badge?: ReactNode;
  variant?: "default" | "alt";
}

/**
 * A named section of a page (Settings, Prepare): the one Card, so every bordered block reads
 * the same (area 64). `variant="alt"` sits on the alt surface.
 */
export function Panel({ title, badge, variant = "default", className = "", children, ...rest }: PanelProps) {
  return (
    <Card
      title={title}
      unit={badge}
      headingLevel={2}
      className={`cp-panel cp-panel--${variant} ${className}`.trim()}
      headClassName="cp-panel__header"
      titleClassName="cp-panel__title"
      bodyClassName="cp-panel__body"
      {...rest}
    >
      {children}
    </Card>
  );
}
