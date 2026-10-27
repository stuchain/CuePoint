import type { ComponentPropsWithRef, ReactNode } from "react";

import { PixelIcon } from "../components/PixelIcon";
import type { PixelIconName } from "../components/pixelIcons";

/**
 * The three pieces every Settings section is made of (area 86), in this order inside its card:
 * a status line (what stands now), the settings, and one action row of buttons. The quiet
 * "Reset to defaults" is at the right of the card's title line (`PanelTools`), and only while a
 * value differs from its default. A section with no settings has no Reset.
 */

/** The status icon by state (M230, M34): a pixel mark in the state's colour, never a round dot. */
const STATUS_ICON: Record<"success" | "warning" | "danger", PixelIconName> = {
  success: "check",
  warning: "warning",
  danger: "warning",
};

/**
 * The one status line: body size, after a small icon tinted by the state (success: a green tick,
 * warning and danger: the mark in their colour, none: a muted square). Only a problem colours the
 * words; an all-good line stays quiet (M325). The icon is on a panel's first line only. Give it
 * `role="status"` only for a line that changes by itself (a result, progress).
 */
export function SettingsStatus({
  tone,
  className = "",
  role,
  children,
  ...rest
}: { tone?: "success" | "warning" | "danger" } & ComponentPropsWithRef<"p">) {
  return (
    <p
      role={role}
      className={`settings-status${tone ? ` settings-status--${tone}` : ""} ${className}`.trim()}
      {...rest}
    >
      <PixelIcon name={tone ? STATUS_ICON[tone] : "dot-filled"} size="sm" className="settings-status__icon" />
      {children}
    </p>
  );
}

/** A hint under a setting: the shared hint look (`cp-field__hint`), held to the field column (M236). */
export function SettingsHint({ children, className = "", ...rest }: ComponentPropsWithRef<"p"> & { children: ReactNode }) {
  return (
    <p className={`cp-field__hint settings-note ${className}`.trim()} {...rest}>
      {children}
    </p>
  );
}

/**
 * What sits at the right of a card's title line: the saved tick, then the quiet "Reset to defaults"
 * (C52). Every section has its Reset here, never on the button row.
 */
export function PanelTools({ saved, reset }: { saved?: ReactNode; reset?: ReactNode }) {
  return (
    <span className="settings-page__tools">
      {saved}
      {reset}
    </span>
  );
}

/** The one action row: the section's buttons, at the left. The section's Reset is in `PanelTools`. */
export function SettingsActions({ children }: { children?: ReactNode }) {
  return (
    <div className="settings-actions">
      <div className="settings-actions__main">{children}</div>
    </div>
  );
}
