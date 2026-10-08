/**
 * The Library's selection bar on the pages that list library tracks outside the
 * Library: an artist's or label's library half, and Similar tracks (FLW-8, DEC-209).
 *
 * It is the Library's `LibraryToolbar`, drawn from the same list of groups
 * (`trackActions.ts`), always shown and disabled with "Select tracks first" until
 * something is selected. It holds only the groups that make sense here: Play, Explore
 * and, where the page can copy and show a file, More. Organize is the Library's (tagging
 * and collecting from a page would be a second Library; Open in Library is one click
 * away), and Beatport and Fix are Clean's. Each page builds a group's entries when the
 * button is pressed, because what they act on may have to be gathered first, and the
 * page's right-click menu is made of the same builder (`libraryRowMenu.ts`).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { TrackContextMenu, type TrackContextMenuItem } from "../../components/TrackContextMenu";
import { reportUnexpected } from "../../reporting/reporting";
import { LibraryToolbar } from "../library/LibraryToolbar";
import { ACTION_GROUPS, barGroups, type TrackActionGroupId } from "../library/trackActions";

interface DiscoverSelectionBarProps {
  groups: readonly TrackActionGroupId[];
  /** Tracks in the list. */
  total: number;
  selected: number;
  describedByQuery?: boolean;
  /** The entries of a group, for the selection as it is now. */
  itemsFor: (group: TrackActionGroupId) => Promise<TrackContextMenuItem[]>;
  onClear: () => void;
  onSelectAll: () => void;
  onColumns: () => void;
}

export function DiscoverSelectionBar({
  groups,
  total,
  selected,
  describedByQuery = false,
  itemsFor,
  onClear,
  onSelectAll,
  onColumns,
}: DiscoverSelectionBarProps) {
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

  return (
    <>
      <LibraryToolbar
        groups={barGroups(selected, groups)}
        total={total}
        selected={selected}
        describedByQuery={describedByQuery}
        oneLine
        openGroup={menu?.group ?? null}
        onOpenGroup={(id, anchor) => void open(id, anchor)}
        onClear={onClear}
        onSelectAll={onSelectAll}
        onColumns={onColumns}
      />
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
