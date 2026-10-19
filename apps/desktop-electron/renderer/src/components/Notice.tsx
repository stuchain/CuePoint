import type { HTMLAttributes, ReactNode } from "react";
import { CloseButton } from "./CloseButton";
import "./Notice.css";

/**
 * The kinds a message can have, and no others (C88):
 * - `info`: something to know (blue); a box with a bar on its left edge.
 * - `warning`: something to know or do before going on (amber); the same box.
 * - `danger`: something failed or is blocked (red); the same box.
 * - `field-error`: one line of red under the field it is about, with no box.
 * `problem` is the old name of `danger` and still works; new code says `danger`.
 */
export type NoticeKind = "info" | "warning" | "danger" | "problem" | "field-error";

interface NoticeProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  kind?: NoticeKind;
  /** A bold first line, for a message that needs a name ("Could not read the file"). */
  title?: ReactNode;
  /** A button or link on the right ("Try again"); not for a field error. */
  action?: ReactNode;
  /** Shows a small close button that calls this; not for a field error. */
  onDismiss?: () => void;
  children?: ReactNode;
}

/**
 * The one message box (Notice / Callout). Danger and a field error are announced at once
 * (`role="alert"`); info and warning are a status the reader can reach in their own time.
 * `Callout` is the same component under its design name.
 */
export function Notice({ kind = "danger", title, action, onDismiss, className = "", children, ...rest }: NoticeProps) {
  const look = kind === "problem" ? "danger" : kind;
  const fieldError = look === "field-error";
  return (
    <div
      className={`cp-notice cp-notice--${look} ${className}`.trim()}
      role={look === "warning" || look === "info" ? "status" : "alert"}
      {...rest}
    >
      <div className="cp-notice__text">
        {title && !fieldError ? <p className="cp-notice__title">{title}</p> : null}
        {children}
      </div>
      {(action || onDismiss) && !fieldError ? (
        <div className="cp-notice__action">
          {action}
          {onDismiss ? <CloseButton onClick={onDismiss} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** The notice, under its design name. */
export const Callout = Notice;
