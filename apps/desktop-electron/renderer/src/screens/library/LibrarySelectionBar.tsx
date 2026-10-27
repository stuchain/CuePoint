/**
 * The bar over the table's bottom rows while tracks are selected (C9, C215, option 1A): the shared
 * `SelectionBar` ("3 selected" with its close button) with the four groups, Play, Organize,
 * Beatport and More, as its actions. It is the table's `bottomBar`, so it never moves a row, and
 * nothing is drawn with no selection; Select all and the count are in the filter row
 * (`FilterBar`'s `trailing`).
 *
 * The groups are one Tab stop and the arrow keys move between them, Down opens the group's menu.
 * What each group opens is `trackActions.ts`'s, the list the right-click menu is built from.
 *
 * **One row, never two (M72, D11).** The buttons are measured, as the filter bar's and the player
 * bar's are: when they do not fit beside the count, the trailing groups move into More, which opens
 * them as submenus above its own entries. A menu opens above the bar's top edge (M290).
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  /**
   * Open a group's menu, anchored under its button (also from the keyboard). `above` is the bar's
   * top edge, which the menu opens above (M290); `fold` the groups More holds for want of room (M72).
   */
  onOpenGroup: (
    id: TrackActionGroupId,
    anchor: { x: number; y: number; above?: number },
    fold?: TrackActionGroupId[],
  ) => void;
  onClear: () => void;
  /** Every track the view holds, and the way to take them all: "Select all 300" in the bar (M116). */
  selectAll?: { total: number; onSelectAll: () => void };
}

export function LibrarySelectionBar({
  groups,
  selected,
  describedByQuery,
  openGroup,
  onOpenGroup,
  onClear,
  selectAll,
}: LibrarySelectionBarProps) {
  // How many of the groups before More are folded into it, counted from the end (M72).
  const [folded, setFolded] = useState(0);
  const foldable = groups.filter((group) => group.id !== "more").length;
  const hasMore = groups.some((group) => group.id === "more");
  const fold = hasMore ? Math.min(folded, foldable) : 0;
  const foldedIds: TrackActionGroupId[] = groups
    .filter((group) => group.id !== "more")
    .slice(foldable - fold)
    .map((group) => group.id);
  const shownGroups = groups.filter((group) => !foldedIds.includes(group.id));

  const keys = useToolbarKeys(shownGroups.length);
  const none = selected === 0;
  const { reset: resetKeys } = keys;

  // Each group's button at its own width, kept from when it was drawn, so a folded one still counts.
  const widths = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const row = keys.ref.current;
    const bar = row?.closest<HTMLElement>(".cp-selection-bar");
    if (!row || !bar || typeof ResizeObserver === "undefined") return;
    const measure = () => {
      for (const button of row.querySelectorAll<HTMLElement>("[data-group]")) {
        const width = button.offsetWidth;
        if (width > 0) widths.current.set(button.dataset.group ?? "", width);
      }
      const style = getComputedStyle(bar);
      const count = bar.querySelector<HTMLElement>(".cp-selection-bar__count");
      const room =
        bar.clientWidth -
        (Number.parseFloat(style.paddingLeft) || 0) -
        (Number.parseFloat(style.paddingRight) || 0) -
        (count?.offsetWidth ?? 0) -
        (Number.parseFloat(style.columnGap) || 0);
      // A bar with no layout (a test, a window not yet drawn) folds nothing.
      if (!(room > 0)) return;
      // The last button hangs past the padding by its frame's inset (L2, M56): that much more room.
      // Left out, a bar one hang short of room folded Beatport into More at 1280 wide (e2e).
      const buttons = row.querySelectorAll<HTMLElement>("[data-group]");
      const last = buttons[buttons.length - 1];
      const hang = [last, last?.parentElement]
        .filter((el): el is HTMLElement => el instanceof HTMLElement && el !== row)
        .reduce((most, el) => Math.max(most, -(Number.parseFloat(getComputedStyle(el).marginRight) || 0)), 0);
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      const order: TrackActionGroupId[] = groups.map((group) => group.id);
      const need = (k: number) => {
        const cut: TrackActionGroupId[] = order.filter((id) => id !== "more").slice(foldable - k);
        const ids = order.filter((id) => !cut.includes(id));
        const sum = ids.reduce((total, id) => total + (widths.current.get(id) ?? 0), 0);
        return sum + gap * Math.max(0, ids.length - 1);
      };
      let next = 0;
      while (next < foldable && need(next) > room + hang) next += 1;
      setFolded(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [foldable, groups, keys.ref]);

  // The bar comes back with Tab landing on its first button, not wherever the arrows left it.
  useEffect(() => {
    if (none) resetKeys();
  }, [none, resetKeys]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (keys.onKeyDown(event)) return;
    if (event.key !== "ArrowDown") return;
    // A menu button opens its list on the Down arrow, as a menu bar does.
    const group = shownGroups[keys.current];
    if (!group || group.disabledReason) return;
    event.preventDefault();
    open(group.id, event.target as HTMLElement);
  };

  /** Under the button, above the bar's top edge (M290), with what More holds for want of room. */
  const open = (id: TrackActionGroupId, button: HTMLElement) => {
    const rect = button.getBoundingClientRect();
    const barTop = button.closest(".cp-selection-bar")?.getBoundingClientRect().top;
    onOpenGroup(
      id,
      { x: rect.left, y: rect.bottom, ...(barTop !== undefined ? { above: barTop } : {}) },
      id === "more" && foldedIds.length > 0 ? foldedIds : undefined,
    );
  };

  return (
    <SelectionBar count={selected} onClear={onClear} overlay selectAll={selectAll}>
      <div ref={keys.ref} className="library-selection-bar__groups" onKeyDown={onKeyDown}>
        {shownGroups.map((group, index) => (
          <Hint key={group.id} text={group.disabledReason ?? undefined}>
            <Button
              variant="secondary"
              menu
              data-group={group.id}
              aria-expanded={openGroup === group.id}
              aria-disabled={group.disabledReason ? true : undefined}
              {...keys.buttonProps(index)}
              onClick={(event) => {
                if (group.disabledReason) return;
                open(group.id, event.currentTarget);
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
