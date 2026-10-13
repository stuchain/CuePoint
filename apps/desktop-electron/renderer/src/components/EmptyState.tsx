import type { ReactNode } from "react";
import { Button } from "./Button";
import "./EmptyState.css";

/** The one label for the action that fills an empty Library (G6 T9). */
export const IMPORT_COLLECTION_LABEL = "Import your Rekordbox collection…";

export interface EmptyStateProps {
  /** What is missing, in a few words (sm, bold). */
  headline: string;
  /** One muted line: why, or what to do. */
  description?: ReactNode;
  /** The one thing to do about it. */
  action?: { label: string; onClick: () => void; disabled?: boolean };
  className?: string;
}

/** The one empty state: centred at the top of the content area, never a full-screen splash. */
export function EmptyState({ headline, description, action, className = "" }: EmptyStateProps) {
  return (
    <div className={`cp-empty-state ${className}`.trim()}>
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
