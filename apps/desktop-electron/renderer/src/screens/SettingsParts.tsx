import type { ComponentPropsWithRef, ReactNode } from "react";

/**
 * The three pieces every Settings section is made of (area 86), in this order inside its card:
 * a status line (what stands now), the settings, and one action row whose buttons are at the left
 * and the quiet "Reset {section}" at the right. A section with no settings has no Reset.
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

/** The one action row: the section's buttons at the left, its Reset (a ResetToDefaults) at the right. */
export function SettingsActions({ children, reset }: { children?: ReactNode; reset?: ReactNode }) {
  return (
    <div className="settings-actions">
      <div className="settings-actions__main">{children}</div>
      {reset ? <div className="settings-actions__reset">{reset}</div> : null}
    </div>
  );
}
