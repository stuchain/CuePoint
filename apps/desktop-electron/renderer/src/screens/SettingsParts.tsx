import type { ComponentPropsWithRef, ReactNode } from "react";

/**
 * The three pieces every Settings section is made of (area 86), in this order inside its card:
 * a status line (what stands now), the settings, and one action row of buttons. The quiet
 * "Reset {section}" is at the right of the card's title line (`PanelTools`). A section with no
 * settings has no Reset.
 */

/**
 * The one status line: body size, in the text colour; a tone only where the state means one.
 * Give it `role="status"` only for a line that changes by itself (a result, progress).
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
      {children}
    </p>
  );
}

/** A hint under a setting: small, muted, capped at 60 characters wherever it appears. */
export function SettingsHint({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <p id={id} className={`settings-hint ${className}`.trim()}>
      {children}
    </p>
  );
}

/**
 * What sits at the right of a card's title line: the saved tick, then the quiet "Reset ..." (C52).
 * Every section has its Reset here, never on the button row.
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
