import type { ReactNode } from "react";
import { Button } from "./Button";
import { PixelIcon } from "./PixelIcon";
import type { PixelIconName } from "./pixelIcons";
import "./EmptyState.css";

/** The one label for the action that fills an empty Library (G6 T9). */
export const IMPORT_COLLECTION_LABEL = "Import a Rekordbox file…";

export interface EmptyStateProps {
  /** The pixel icon above the line: the page's own icon, so the empty state is recognisably this page's. */
  icon?: PixelIconName;
  /** What is missing, in a few words (sm, bold). */
  headline: string;
  /** One muted line: why, or what to do. */
  description?: ReactNode;
  /** The one thing to do about it. */
  action?: { label: string; onClick: () => void; disabled?: boolean };
  className?: string;
}

/**
 * The one empty state: centred, an icon, one line, and at most one button; never a full-screen
 * splash. `description` is for a second, muted line only when the first needs a reason.
 */
export function EmptyState({ icon, headline, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`cp-empty-state ${className}`.trim()}>
      {icon && (
        <span className="cp-empty-state__icon" aria-hidden>
          <PixelIcon name={icon} />
        </span>
      )}
      <p className="cp-empty-state__headline">{headline}</p>
      {description && <p className="cp-empty-state__description">{description}</p>}
      {action && (
        <Button variant="secondary" onClick={action.onClick} disabled={action.disabled}>
          {action.label}
        </Button>
      )}
    </div>
  );
}
