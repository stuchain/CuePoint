import type { ReactNode } from "react";
import "./ReasonLine.css";

interface ReasonLineProps {
  /** Why the button next to it is greyed, in a short plain sentence. Nothing is drawn when it is empty. */
  children?: ReactNode;
  /** Name it with the button's `aria-describedby`, so a screen reader hears it on the greyed button. */
  id?: string;
  /** `"end"` right-aligns it over a footer whose buttons are at the right (a dialog); default `"start"`. */
  align?: "start" | "end";
  className?: string;
}

/**
 * The one "why is this greyed" line (area 93): muted body-size words on one line directly above
 * the buttons they explain (a dialog's footer, an action bar). Drawn only while there is a
 * reason, so the layout does not reserve a gap for it. Replaces the per-screen notes beside
 * Export, Sync, Check for updates and the like.
 *
 *     <ReasonLine id="export-why">{unavailable ? "Choose a playlist first" : null}</ReasonLine>
 *     <Button variant="primary" disabled={unavailable} aria-describedby={unavailable ? "export-why" : undefined}>Export</Button>
 */
export function ReasonLine({ children, id, align = "start", className = "" }: ReasonLineProps) {
  if (children === undefined || children === null || children === false || children === "") return null;
  return (
    <p id={id} role="note" className={`cp-reason${align === "end" ? " cp-reason--end" : ""} ${className}`.trim()}>
      {children}
    </p>
  );
}
