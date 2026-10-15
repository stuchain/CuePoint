import type { HTMLAttributes, ReactNode } from "react";
import "./Notice.css";

/**
 * The three looks a problem message can have, and no others:
 * - `problem`: something failed or is blocked (red); a box with a bar on its left edge.
 * - `warning`: something to know or do before going on (amber); the same box.
 * - `field-error`: one line of red under the field it is about, with no box.
 */
export type NoticeKind = "problem" | "warning" | "field-error";

interface NoticeProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  kind?: NoticeKind;
  /** A bold first line, for a problem or warning that needs a name ("Could not read the file"). */
  title?: ReactNode;
  /** A button or link on the right ("Try again"); not for a field error. */
  action?: ReactNode;
  children?: ReactNode;
}

/**
 * The one problem message (Notice / Callout). A problem and a field error are announced at
 * once (`role="alert"`); a warning is a status the reader can reach in their own time.
 * `Callout` is the same component under its design name.
 */
export function Notice({ kind = "problem", title, action, className = "", children, ...rest }: NoticeProps) {
  const fieldError = kind === "field-error";
  return (
    <div
      className={`cp-notice cp-notice--${kind} ${className}`.trim()}
      role={kind === "warning" ? "status" : "alert"}
      {...rest}
    >
      <div className="cp-notice__text">
        {title && !fieldError ? <p className="cp-notice__title">{title}</p> : null}
        {children}
      </div>
      {action && !fieldError ? <div className="cp-notice__action">{action}</div> : null}
    </div>
  );
}

/** The notice, under its design name. */
export const Callout = Notice;
