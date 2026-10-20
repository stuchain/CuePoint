import type { ReactNode } from "react";
import { formatCount } from "../format/counts";
import { Button } from "./Button";
import { CloseButton } from "./CloseButton";
import { useDoubleClickGrace } from "../hooks/useDoubleClickGrace";
import "./SelectionBar.css";

interface SelectionBarProps {
  /** How many are selected. At 0 nothing is drawn. */
  count: number;
  /** Clears the selection (the small × beside the count). */
  onClear: () => void;
  /** The actions on the selection: standard-height grey buttons, on the right. */
  children?: ReactNode;
  /** For the grouped count; the computer's locale when left out. */
  locale?: string;
  className?: string;
  /**
   * Drawn over the bottom of a table (`TrackTable`'s `bottomBar`) instead of above it, so it never
   * moves a row: a hairline rule on top, and for a double-click's length after it appears the
   * pointer goes through it to the row, so the second click of a double-click plays the row.
   */
  overlay?: boolean;
}

/**
 * The bar directly above a list that says how many rows are selected and what can be done with
 * them (C9, C215). It is 42 high and drawn only while something is selected, so a list with no
 * selection has no empty band above it. The Library's form: "N selected" with a small close
 * button ("Clear selection") on the left, the page's actions on the right.
 */
export function SelectionBar({ count, ...rest }: SelectionBarProps) {
  if (count <= 0) return null;
  return <ShownSelectionBar count={count} {...rest} />;
}

function ShownSelectionBar({ count, onClear, children, locale, className = "", overlay = false }: SelectionBarProps) {
  const armed = useDoubleClickGrace();
  return (
    <div
      role="toolbar"
      aria-label="Selection"
      className={`cp-selection-bar${overlay ? " cp-selection-bar--overlay" : ""} ${className}`.trim()}
      data-armed={overlay && !armed ? "false" : undefined}
    >
      <div className="cp-selection-bar__count">
        <span>{formatCount(count, locale)} selected</span>
        <CloseButton aria-label="Clear selection" onClick={onClear} />
      </div>
      {children ? <div className="cp-selection-bar__actions">{children}</div> : null}
    </div>
  );
}

/** "Select all": the quiet button in a filter row, beside the count, for a list that has no bar yet. */
export function SelectAllButton({ onSelectAll, disabled = false }: { onSelectAll: () => void; disabled?: boolean }) {
  return (
    <Button variant="quiet" onClick={onSelectAll} disabled={disabled}>
      Select all
    </Button>
  );
}
