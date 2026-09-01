import type { ButtonHTMLAttributes } from "react";
import { PixelIcon } from "./PixelIcon";
import type { PixelIconName } from "./pixelIcons";
import "./ToolbarIcon.css";

interface ToolbarIconBaseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
}

/**
 * Exactly one of `icon` and `glyph` is required.
 *
 * Per DEC-010 only the highest-visibility icons are drawn as pixel art; the
 * glyph path stays for secondary actions, so both have to be expressible. The
 * union makes passing neither, or both, a compile error rather than a button
 * that silently renders nothing.
 */
export type ToolbarIconProps = ToolbarIconBaseProps &
  (
    | { icon: PixelIconName; glyph?: never }
    | { glyph: string; icon?: never }
  );

export function ToolbarIcon({
  label,
  icon,
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
      {icon ? (
        // No title: the button is already labelled, and a nested accessible
        // name would have screen readers announce it twice.
        <PixelIcon name={icon} />
      ) : (
        <span className="cp-toolbar-icon__glyph" aria-hidden>
          {glyph}
        </span>
      )}
    </button>
  );
}
