/**
 * The row directly above the table (FLW-8, LIB-8, LIB-10).
 *
 * The selection bar on the left, always there: Play ▸, Organize ▸, Explore ▸,
 * Beatport ▸, Fix ▸, More ▸ and Clear selection. With nothing selected its
 * buttons are disabled and say "Select tracks first", so the bar never appears
 * or vanishes and the table under it never moves (DEC-209). On the right, the
 * count ("1,204 tracks · 3 selected", or "Showing 240 of 12,000 tracks" while a search or filter narrows the view), **Select all** and **Columns…**. They replace the
 * selection strip and the Columns row this page used to stack under the table.
 *
 * The bar is a `role="toolbar"`: Tab reaches it once and the arrow keys move
 * between its buttons, disabled ones included (so a keyboard user can land on
 * a button and read why it is off; they are `aria-disabled`, not `disabled`).
 * What each group opens is `trackActions.ts`'s, the list the right-click menu
 * is built from.
 */
import { Button } from "../../components/Button";
import type { TrackActionGroup, TrackActionGroupId } from "./trackActions";
import { SELECT_TRACKS_FIRST } from "./trackActions";
import { useToolbarKeys } from "./useToolbarKeys";
import "./LibraryToolbar.css";

interface LibraryToolbarProps {
  groups: readonly TrackActionGroup[];
  /** Tracks in the view. */
  total: number;
  /** Tracks the scope holds with no search or filter; more than `total` when one narrows the view. */
  scopeTotal?: number;
  /** Tracks selected. */
  selected: number;
  /** True when the selection is "everything matching", not a list of tracks. */
  describedByQuery: boolean;
  /** The group whose menu is open, for `aria-expanded`. */
  openGroup: TrackActionGroupId | null;
  /** Open a group's menu, anchored under its button (also from the keyboard). */
  onOpenGroup: (id: TrackActionGroupId, anchor: { x: number; y: number }) => void;
  onClear: () => void;
  /** Select everything the view matches (LIB-8 keeps Select all). */
  onSelectAll: () => void;
  onColumns: () => void;
}

export function LibraryToolbar({
  groups,
  total,
  scopeTotal = total,
  selected,
  describedByQuery,
  openGroup,
  onOpenGroup,
  onClear,
  onSelectAll,
  onColumns,
}: LibraryToolbarProps) {
  const keys = useToolbarKeys(groups.length + 1);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (keys.onKeyDown(event)) return;
    if (event.key !== "ArrowDown" || keys.current >= groups.length) return;
    // A menu button opens its list on the Down arrow, as a menu bar does.
    const group = groups[keys.current]!;
    if (group.disabledReason) return;
    event.preventDefault();
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    onOpenGroup(group.id, { x: rect.left, y: rect.bottom });
  };

  const none = selected === 0;

  return (
    <div className="library-toolbar">
      <div
        ref={keys.ref}
        className="library-toolbar__bar"
        role="toolbar"
        aria-label="Selected tracks"
        onKeyDown={onKeyDown}
      >
        {groups.map((group, index) => (
          <Button
            key={group.id}
            variant="secondary"
            className="library-toolbar__button"
            aria-haspopup="menu"
            aria-expanded={openGroup === group.id}
            aria-disabled={group.disabledReason ? true : undefined}
            title={group.disabledReason ?? undefined}
            {...keys.buttonProps(index)}
            onClick={(event) => {
              if (group.disabledReason) return;
              const rect = event.currentTarget.getBoundingClientRect();
              onOpenGroup(group.id, { x: rect.left, y: rect.bottom });
            }}
          >
            {group.label}
            <span aria-hidden> ▸</span>
          </Button>
        ))}
        <Button
          variant="secondary"
          className="library-toolbar__button"
          aria-disabled={none ? true : undefined}
          title={none ? SELECT_TRACKS_FIRST : undefined}
          {...keys.buttonProps(groups.length)}
          onClick={() => {
            if (!none) onClear();
          }}
        >
          Clear selection
        </Button>
      </div>

      <div className="library-toolbar__end">
        <span className="library-toolbar__count" role="status">
          <span>
            {scopeTotal > total
              ? `Showing ${total.toLocaleString()} of ${scopeTotal.toLocaleString()} tracks`
              : `${total.toLocaleString()} ${total === 1 ? "track" : "tracks"}`}
          </span>
          {!none && (
            <>
              <span aria-hidden> · </span>
              <span>
                {selected.toLocaleString()} selected
                {describedByQuery && selected > 1 ? " (everything matching)" : ""}
              </span>
            </>
          )}
        </span>
        {total > 0 && selected < total && (
          <Button variant="secondary" className="library-toolbar__button" onClick={onSelectAll}>
            Select all
          </Button>
        )}
        <Button variant="secondary" className="library-toolbar__button" onClick={onColumns}>
          Columns…
        </Button>
      </div>
    </div>
  );
}
