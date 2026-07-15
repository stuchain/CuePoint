import type { HTMLAttributes, ReactNode } from "react";
import "./Panel.css";

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  title?: string;
  badge?: ReactNode;
  variant?: "default" | "alt";
}

export function Panel({
  title,
  badge,
  variant = "default",
  className = "",
  children,
  ...rest
}: PanelProps) {
  return (
    <section
      className={`cp-panel cp-panel--${variant} ${className}`.trim()}
      {...rest}
    >
      {(title || badge) && (
        <header className="cp-panel__header">
          {title && <h2 className="cp-panel__title">{title}</h2>}
          {badge}
        </header>
      )}
      <div className="cp-panel__body">{children}</div>
    </section>
  );
}
