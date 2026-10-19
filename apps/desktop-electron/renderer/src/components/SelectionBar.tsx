import type { ReactNode } from "react";
import { formatCount } from "../format/counts";
import { Button } from "./Button";
import { CloseButton } from "./CloseButton";
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
}

/**
 * The bar directly above a list that says how many rows are selected and what can be done with
 * them (C9, C215). It is 42 high and drawn only while something is selected, so a list with no
 * selection has no empty band above it. The Library's form: "N selected" with a small close
 * button ("Clear selection") on the left, the page's actions on the right.
 */
export function SelectionBar({ count, onClear, children, locale, className = "" }: SelectionBarProps) {
  if (count <= 0) return null;
  return (
    <div role="toolbar" aria-label="Selection" className={`cp-selection-bar ${className}`.trim()}>
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
