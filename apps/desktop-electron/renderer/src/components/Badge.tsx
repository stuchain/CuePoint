import { useState, type HTMLAttributes } from "react";
import { useMotion } from "../tokens/MotionContext";
import "./Badge.css";

/**
 * The tones of the one chip. `neutral` (also `default`) is grey; `accent` (also `info`) is the
 * theme's violet; the other three are what a status means. `default` and `info` stay so existing
 * call sites keep working.
 */
export type BadgeVariant = "default" | "neutral" | "success" | "warning" | "danger" | "accent" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** The same as `variant`, named as the chip's design calls it. `tone` wins when both are given. */
  tone?: BadgeVariant;
}

/**
 * The one chip / badge: a tinted fill, a 1px line and bold words in a tone. Use it for every
 * status, count and tag that is a small coloured label: never a hand-made `<span>` with its own
 * colours. `Chip` is the same component under its design name.
 */
export function Badge({ variant = "default", tone, className = "", children, ...rest }: BadgeProps) {
  const look = tone ?? variant;
  // A badge that changes (its kind or its words) steps once (Changing state, PAGES-12). One that
  // is first drawn does not, so a table of badges scrolling past stays still.
  const moves = useMotion("state");
  const words = typeof children === "string" || typeof children === "number" ? String(children) : "";
  const signature = `${look}|${words}`;
  const [seen, setSeen] = useState({ signature, changes: 0 });
  if (seen.signature !== signature) {
    setSeen({ signature, changes: seen.changes + (moves ? 1 : 0) });
  }
  return (
    <span
      className={`cp-badge cp-badge--${look} ${className}`.trim()}
      // Odd and even changes name different animations, so a second change restarts it.
      data-changed={seen.changes > 0 ? seen.changes % 2 : undefined}
      {...rest}
    >
      {children}
    </span>
  );
}

/** The chip, under its design name: `<Chip tone="success">Synced</Chip>`. */
export const Chip = Badge;
export type ChipProps = BadgeProps;
