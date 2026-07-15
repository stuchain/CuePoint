import type { ButtonHTMLAttributes } from "react";
import "./ToolbarIcon.css";

export interface ToolbarIconProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  glyph: string;
  active?: boolean;
}

export function ToolbarIcon({
  label,
  glyph,
  active = false,
  className = "",
  ...rest
}: ToolbarIconProps) {
  return (
    <button
      type="button"
      className={`cp-toolbar-icon ${active ? "cp-toolbar-icon--active" : ""} ${className}`.trim()}
      aria-label={label}
      title={label}
      {...rest}
    >
      <span className="cp-toolbar-icon__glyph" aria-hidden>
        {glyph}
      </span>
    </button>
  );
}
