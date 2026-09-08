/**
 * What can be done with a selection (LIBUI-09, DEC-045, then ORG-11).
 *
 * LIBUI-09 built this with two actions, because two was what the build had:
 * copy the tracks, and show one in the file manager. It said tagging, rating
 * and collecting would arrive in Phase 6, and this is Phase 6.
 *
 * They arrive as **one button**, not five. The context menu already offers
 * every organization operation, and a toolbar with its own set of buttons
 * would be a second list to keep in step with it — so the toolbar opens the
 * same menu, built from the same array, and "one vocabulary for both surfaces"
 * is a fact rather than a promise.
 */
import { Button } from "../../components/Button";
import "./SelectionActions.css";

export interface SelectionActionsProps {
  count: number;
  /** True when the selection is "everything matching", not a list of tracks. */
  describedByQuery: boolean;
  /** Whether exactly one track is selected and its path is known. */
  revealPath: string | null;
  onCopy: () => void;
  onReveal: (path: string) => void;
  onClear: () => void;
  onSelectAll: () => void;
  /**
   * Open the organization menu, anchored under the button (ORG-11).
   *
   * Absent means the build has nothing to offer, and the button is not drawn —
   * which is what a browser-lab render without the engine gets.
   */
  onActions?: (anchor: { x: number; y: number }) => void;
  /** Tracks the query matches, for "select all". */
  total: number;
  busy?: boolean;
}

export function SelectionActions({
  count,
  describedByQuery,
  revealPath,
  onCopy,
  onReveal,
  onClear,
  onSelectAll,
  onActions,
  total,
  busy = false,
}: SelectionActionsProps) {
  if (count === 0) {
    return (
      <div className="cp-selection-actions cp-selection-actions--idle">
        <span className="cp-selection-actions__count">
          {total.toLocaleString()} {total === 1 ? "track" : "tracks"}
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
        {count.toLocaleString()} {count === 1 ? "track" : "tracks"} selected
        {describedByQuery && count > 1 ? " (everything matching)" : ""}
      </span>

      {onActions && (
        <Button
          variant="secondary"
          aria-haspopup="menu"
          onClick={(event) => {
            // Anchored under the button rather than at the pointer: this menu
            // is opened by a control with a place on the page, and the
            // keyboard opens it with no pointer position at all.
            const rect = event.currentTarget.getBoundingClientRect();
            onActions({ x: rect.left, y: rect.bottom });
          }}
        >
          Actions…
        </Button>
      )}

      <Button variant="secondary" onClick={onCopy} loading={busy}>
        Copy
      </Button>

      {/* One track, one file: revealing five folders at once is not a thing
          anyone asked for, so the action is offered only when it means one. */}
      <Button
        variant="secondary"
        disabled={revealPath === null}
        onClick={() => revealPath && onReveal(revealPath)}
      >
        Show in folder
      </Button>

      <Button variant="secondary" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
