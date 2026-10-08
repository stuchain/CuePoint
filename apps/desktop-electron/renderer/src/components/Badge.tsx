import { useState, type HTMLAttributes } from "react";
import { useMotion } from "../tokens/MotionContext";
import "./Badge.css";

export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "default", className = "", children, ...rest }: BadgeProps) {
  // A badge that changes (its kind or its words) steps once (Changing state, PAGES-12). One that
  // is first drawn does not, so a table of badges scrolling past stays still.
  const moves = useMotion("state");
  const words = typeof children === "string" || typeof children === "number" ? String(children) : "";
  const signature = `${variant}|${words}`;
  const [seen, setSeen] = useState({ signature, changes: 0 });
  if (seen.signature !== signature) {
    setSeen({ signature, changes: seen.changes + (moves ? 1 : 0) });
  }
  return (
    <span
      className={`cp-badge cp-badge--${variant} ${className}`.trim()}
      // Odd and even changes name different animations, so a second change restarts it.
      data-changed={seen.changes > 0 ? seen.changes % 2 : undefined}
      {...rest}
    >
      {children}
    </span>
  );
}
