/**
 * The bar directly above the table while tracks are selected (C9, C215): the shared
 * `SelectionBar` ("3 selected" with its close button) with the four groups, Play, Organize,
 * Beatport and More, as its actions. Nothing is drawn with no selection, so the table has no empty
 * band above it; Select all and the count are in the filter row (`FilterBar`'s `trailing`).
 *
 * The groups are one Tab stop and the arrow keys move between them, Down opens the group's menu.
 * What each group opens is `trackActions.ts`'s, the list the right-click menu is built from.
 */
import { useEffect } from "react";

import { Button } from "../../components/Button";
import { Hint } from "../../components/Hint";
import { SelectionBar } from "../../components/SelectionBar";
import type { TrackActionGroup, TrackActionGroupId } from "./trackActions";
import { useToolbarKeys } from "./useToolbarKeys";
import "./LibrarySelectionBar.css";

interface LibrarySelectionBarProps {
  groups: readonly TrackActionGroup[];
  /** Tracks selected. */
  selected: number;
  /** True when the selection is "everything matching", not a list of tracks. */
  describedByQuery: boolean;
  /** The group whose menu is open, for `aria-expanded`. */
  openGroup: TrackActionGroupId | null;
  /** Open a group's menu, anchored under its button (also from the keyboard). */
  onOpenGroup: (id: TrackActionGroupId, anchor: { x: number; y: number }) => void;
  onClear: () => void;
}

export function LibrarySelectionBar({
  groups,
  selected,
  describedByQuery,
  openGroup,
  onOpenGroup,
  onClear,
}: LibrarySelectionBarProps) {
  const keys = useToolbarKeys(groups.length);
  const none = selected === 0;
  const { reset: resetKeys } = keys;

  // The bar comes back with Tab landing on its first button, not wherever the arrows left it.
  useEffect(() => {
    if (none) resetKeys();
  }, [none, resetKeys]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (keys.onKeyDown(event)) return;
    if (event.key !== "ArrowDown") return;
    // A menu button opens its list on the Down arrow, as a menu bar does.
    const group = groups[keys.current];
    if (!group || group.disabledReason) return;
    event.preventDefault();
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    onOpenGroup(group.id, { x: rect.left, y: rect.bottom });
  };

  return (
    <SelectionBar count={selected} onClear={onClear}>
      <div ref={keys.ref} className="library-selection-bar__groups" onKeyDown={onKeyDown}>
        {groups.map((group, index) => (
          <Hint key={group.id} text={group.disabledReason ?? undefined}>
            <Button
              variant="secondary"
              menu
              aria-expanded={openGroup === group.id}
              aria-disabled={group.disabledReason ? true : undefined}
              {...keys.buttonProps(index)}
              onClick={(event) => {
                if (group.disabledReason) return;
                const rect = event.currentTarget.getBoundingClientRect();
                onOpenGroup(group.id, { x: rect.left, y: rect.bottom });
              }}
            >
              {group.label}
            </Button>
          </Hint>
        ))}
        {describedByQuery && selected > 1 && (
          // Said, not drawn: the bar stays as short as "3 selected".
          <span className="cp-visually-hidden" role="status">
            The selection is everything matching
          </span>
        )}
      </div>
    </SelectionBar>
  );
}
