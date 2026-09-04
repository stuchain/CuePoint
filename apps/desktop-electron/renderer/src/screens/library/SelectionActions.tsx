/**
 * What can be done with a selection, today (LIBUI-09, DEC-045).
 *
 * Two actions, because two is what this build has: copy the tracks, and show
 * one in the file manager. Tagging, rating and collecting arrive in Phase 6;
 * playback and its context menu in Phase 5 (DEC-013). Selection is built now
 * anyway, because retrofitting it into a virtualized table over windowed data
 * later is harder than building it once — and because a count of what you have
 * picked is useful even when there is little to do with it.
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
