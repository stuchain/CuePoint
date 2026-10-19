import { isValidElement, type ReactNode } from "react";
import { Button } from "./Button";
import { PixelIcon } from "./PixelIcon";
import type { PixelIconName } from "./pixelIcons";
import "./EmptyState.css";

/** The one label for the action that fills an empty Library (G6 T9). */
export const IMPORT_COLLECTION_LABEL = "Import a Rekordbox file…";

export interface EmptyStateProps {
  /**
   * The pixel icon above the line: the page's own icon, so the empty state is recognisably this
   * page's. There is always one (area 66): without it the default is the tick for `tone="clear"`
   * and the stack for an ordinary empty list.
   */
  icon?: PixelIconName;
  /**
   * `"empty"` (the default) is nothing to show yet; `"clear"` is the all-clear, a check that
   * found nothing wrong ("No possible duplicates"): the icon is the tick, in the success colour.
   */
  tone?: "empty" | "clear";
  /**
   * What is missing, in a few words (sm, bold). Written like a label, with no full stop at the
   * end ("No possible duplicates", not "No possible duplicates."); a reason goes in `description`.
   */
  headline: string;
  /** One muted line: why, or what to do. */
  description?: ReactNode;
  /**
   * The one thing to do about it: a `{ label, onClick }` for the standard button, or any element
   * (a link, a button with a menu) to put in the slot as it is.
   */
  action?: { label: string; onClick: () => void; disabled?: boolean } | ReactNode;
  /** The short form (C140): body-size words and no icon, for an empty list inside a panel. */
  compact?: boolean;
  className?: string;
}

function isButtonSpec(action: EmptyStateProps["action"]): action is { label: string; onClick: () => void; disabled?: boolean } {
  return typeof action === "object" && action !== null && !isValidElement(action) && "label" in action && "onClick" in action;
}

/**
 * The one empty state: centred, an icon, one line, and at most one button; never a full-screen
 * splash. `description` is for a second, muted line only when the first needs a reason.
 */
export function EmptyState({ icon, tone = "empty", headline, description, action, compact = false, className = "" }: EmptyStateProps) {
  const drawn: PixelIconName = icon ?? (tone === "clear" ? "clean" : "collections");
  return (
    <div className={`cp-empty-state${tone === "clear" ? " cp-empty-state--clear" : ""}${compact ? " cp-empty-state--compact" : ""} ${className}`.trim()}>
      {compact ? null : (
        <span className="cp-empty-state__icon" aria-hidden>
          <PixelIcon name={drawn} />
        </span>
      )}
      <p className="cp-empty-state__headline">{headline}</p>
      {description && <p className="cp-empty-state__description">{description}</p>}
      {isButtonSpec(action) ? (
        <Button variant="secondary" onClick={action.onClick} disabled={action.disabled}>
          {action.label}
        </Button>
      ) : (
        action
      )}
    </div>
  );
}
