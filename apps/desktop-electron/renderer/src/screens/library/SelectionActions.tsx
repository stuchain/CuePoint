/**
 * The selection bar of Missing files (LIBUI-09, DEC-045): the count, the page's own buttons, and
 * Clear. The page draws its buttons as children, so it decides which actions show and how they
 * fold into menus (Find it…, then the Show and Copy menus).
 */
import type { ReactNode } from "react";

import { Button } from "../../components/Button";
import "./SelectionActions.css";
import { countNoun } from "../../format/counts";

interface SelectionActionsProps {
  count: number;
  /** True when the selection is "everything matching", not a list of tracks. */
  describedByQuery: boolean;
  onClear: () => void;
  onSelectAll: () => void;
  /** Tracks the query matches, for "select all". */
  total: number;
  /** The page's own buttons, drawn between the count and Clear (Missing files: Find it…, Show, Copy). */
  children?: ReactNode;
}

export function SelectionActions({ count, describedByQuery, onClear, onSelectAll, total, children }: SelectionActionsProps) {
  if (count === 0) {
    return (
      <div className="cp-selection-actions cp-selection-actions--idle">
        <span className="cp-selection-actions__count">
          {countNoun(total, "track")}
        </span>
        {total > 0 && (
          <Button variant="secondary" onClick={onSelectAll}>
            Select all
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="cp-selection-actions" role="toolbar" aria-label="Selection">
      <span className="cp-selection-actions__count" role="status">
        {countNoun(count, "track")} selected
        {describedByQuery && count > 1 ? " (everything matching)" : ""}
      </span>

      {children}

      <Button variant="secondary" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
