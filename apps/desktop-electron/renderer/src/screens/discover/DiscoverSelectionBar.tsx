/**
 * The selection bar on the pages that list library tracks outside the Library: an artist's or
 * label's library half, and Similar tracks (FLW-8, DEC-209, C9, C215).
 *
 * It is the shared `SelectionBar`: "3 selected ×" on the left, the group buttons on the right,
 * and nothing at all while nothing is selected, so a list has no empty band above it. The groups
 * come from the same list the Library uses (`trackActions.ts`), but only those that make sense
 * here: Play and More (the page entries and, where the page can copy and show a file, those
 * too). Organize is the Library's (tagging and collecting from a page would be a second
 * Library; Open in Library is one click away), and Beatport is Clean's. Each page builds a
 * group's entries when the button is pressed, because what they act on may have to be
 * gathered first, and the page's right-click menu is made of the same builder
 * (`libraryRowMenu.ts`). Select all is the page's: a quiet button in the filter row.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "../../components/Button";
import { SelectionBar } from "../../components/SelectionBar";
import { TrackContextMenu, type TrackContextMenuItem } from "../../components/TrackContextMenu";
import { reportUnexpected } from "../../reporting/reporting";
import { ACTION_GROUPS, type TrackActionGroupId } from "../library/trackActions";

interface DiscoverSelectionBarProps {
  groups: readonly TrackActionGroupId[];
  selected: number;
  /** The entries of a group, for the selection as it is now. */
  itemsFor: (group: TrackActionGroupId) => Promise<TrackContextMenuItem[]>;
  onClear: () => void;
  /** Drawn over a table's bottom rows (`TrackTable`'s `bottomBar`), not above it. */
  overlay?: boolean;
}

export function DiscoverSelectionBar({ groups, selected, itemsFor, onClear, overlay = false }: DiscoverSelectionBarProps) {
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    group: TrackActionGroupId;
    items: TrackContextMenuItem[];
  } | null>(null);

  // The entries may take a moment to gather; a page left meanwhile has no bar to open them on.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const open = useCallback(
    async (group: TrackActionGroupId, anchor: { x: number; y: number }) => {
      try {
        const items = await itemsFor(group);
        if (mounted.current && items.length > 0) setMenu({ ...anchor, group, items });
      } catch (error) {
        reportUnexpected(error);
      }
    },
    [itemsFor],
  );

  const shown = ACTION_GROUPS.filter((group) => groups.includes(group.id));

  return (
    <>
      <SelectionBar count={selected} onClear={onClear} overlay={overlay}>
        {shown.map((group) => (
          <Button
            key={group.id}
            variant="secondary"
            menu
            aria-haspopup="menu"
            aria-expanded={menu?.group === group.id}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              void open(group.id, { x: rect.left, y: rect.bottom });
            }}
          >
            {group.label}
          </Button>
        ))}
      </SelectionBar>
      {menu && (
        <TrackContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
          label={ACTION_GROUPS.find((entry) => entry.id === menu.group)?.label ?? menu.group}
        />
      )}
    </>
  );
}
