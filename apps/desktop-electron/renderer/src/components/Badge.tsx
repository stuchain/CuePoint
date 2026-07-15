import type { HTMLAttributes } from "react";
import "./Badge.css";

export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "default", className = "", children, ...rest }: BadgeProps) {
  return (
    <span className={`cp-badge cp-badge--${variant} ${className}`.trim()} {...rest}>
      {children}
    </span>
  );
}
