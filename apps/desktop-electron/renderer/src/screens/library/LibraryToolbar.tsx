/**
 * The row directly above the table (FLW-8, LIB-8).
 *
 * With nothing selected the left side is empty and the right shows the count
 * ("1,204 tracks", or "Showing 240 of 12,000 tracks" while a search or filter narrows
 * the view) and **Select all**. With a selection the left shows the four group
 * buttons, Play ▸, Organize ▸, Beatport ▸ and More ▸, and a "3 selected ×" button whose
 * × clears the selection. Columns… is the table header's corner button.
 *
 * Nothing moves when a selection is made or let go (DEC-112): the row has the height of
 * one line of controls whether or not the buttons are there, and whether the row takes
 * one line or two is measured from an invisible copy of the buttons as they would be
 * WITH a selection, so selecting never flips one line to two.
 *
 * Where the row does not fit on one line it takes two, laid out on purpose: the
 * four groups on the first, the "3 selected ×" button, the count and Select all on the
 * second (with nothing selected the first line is an empty spacer of the same height), the count giving way (cut short with an ellipsis) before a button would start
 * a third line (DEC-217, 2026-10-09, N2-1). Whether one line fits is measured, not
 * guessed, so it holds in any font and at any scale.
 *
 * The bar is a `role="toolbar"`: Tab reaches it once and the arrow keys move
 * between its buttons. What each group opens is `trackActions.ts`'s, the list the
 * right-click menu is built from.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PixelIcon } from "../../components/PixelIcon";

import { Button } from "../../components/Button";
import type { TrackActionGroup, TrackActionGroupId } from "./trackActions";
import { needsTwoLines } from "./toolbarLines";
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
  /**
   * Keep the row to one line, the count giving way (cut short with an ellipsis)
   * before a button wraps: the narrower bars on Discover and Similar.
   */
  oneLine?: boolean;
}

/** Why Select all is disabled once every track is. */
export const EVERYTHING_SELECTED = "Every track is selected";

/**
 * The widths the row lays out on one line: the invisible copy of the bar's buttons (as they
 * are with a selection), the count's reserve and Select all.
 */
const MEASURED =
  ".library-toolbar__measure .library-toolbar__button, .library-toolbar__count-reserve, .library-toolbar__select-all";

/**
 * Whether the row takes its two deliberate lines, measured whenever the row or
 * any of its controls changes size (a resize, a scale change, a longer count).
 */
function useTwoLines(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [twoLines, setTwoLines] = useState(false);

  useLayoutEffect(() => {
    const row = ref.current;
    if (!enabled || !row) {
      setTwoLines(false);
      return;
    }
    const check = () => {
      const style = getComputedStyle(row);
      const room =
        row.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      const widths = [...row.querySelectorAll<HTMLElement>(MEASURED)].map(
        (el) => el.getBoundingClientRect().width,
      );
      setTwoLines(needsTwoLines(widths, parseFloat(style.columnGap) || 0, room));
    };
    check();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(row);
    for (const el of row.querySelectorAll<HTMLElement>(MEASURED)) observer.observe(el);
    return () => observer.disconnect();
  }, [enabled]);

  return { ref, twoLines };
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
  oneLine = false,
}: LibraryToolbarProps) {
  const keys = useToolbarKeys(groups.length + 1);
  const none = selected === 0;
  const lines = useTwoLines(!oneLine);
  const { reset: resetKeys } = keys;

  // The bar comes back with Tab landing on its first button, not wherever the arrows left it.
  useEffect(() => {
    if (none) resetKeys();
  }, [none, resetKeys]);

  /** The × takes the bar away with focus inside it: focus goes to Select all first. */
  const clear = () => {
    lines.ref.current?.querySelector<HTMLElement>(".library-toolbar__select-all")?.focus();
    onClear();
  };

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

  const countText =
    scopeTotal > total
      ? `Showing ${total.toLocaleString()} of ${scopeTotal.toLocaleString()} tracks`
      : `${total.toLocaleString()} ${total === 1 ? "track" : "tracks"}`;
  const clearName = `Clear selection, ${selected.toLocaleString()} selected${
    describedByQuery && selected > 1 ? " (everything matching)" : ""
  }`;
  /** The widest the selected-count button gets, for the invisible copy. */
  const widest = Math.max(total, scopeTotal, selected).toLocaleString();

  return (
    <div
      ref={lines.ref}
      // One line of controls, padding and rule included, with or without the buttons (DEC-112).
      style={{
        minHeight:
          "calc(var(--control-height) + 2 * round(down, calc(var(--space-xs) / 2), 1px) + var(--hairline))",
      }}
      className={
        oneLine
          ? "library-toolbar library-toolbar--one-line"
          : lines.twoLines
            ? "library-toolbar library-toolbar--two-lines"
            : "library-toolbar"
      }
    >
      {/* The buttons as they are with a selection, drawn invisibly and out of the flow, so the
          row's lines are measured the same whether or not they show. Their words are drawn from
          attributes, so they are no text a reader or a query finds. */}
      <div className="library-toolbar__measure" aria-hidden>
        {groups.map((group) => (
          <Button
            key={group.id}
            variant="secondary"
            className="library-toolbar__button"
            tabIndex={-1}
            disabled
          >
            <span className="library-toolbar__ghost" data-text={group.label} />
            <span className="library-toolbar__arrow" />
          </Button>
        ))}
        <Button variant="secondary" className="library-toolbar__button" tabIndex={-1} disabled>
          <span className="library-toolbar__ghost" data-text={`${widest} selected`} />
          <PixelIcon name="close" className="cp-pixel-icon--text cp-pixel-icon--after" />
        </Button>
      </div>
      {/* Two lines with nothing selected: the first line is empty, and holds its height so the
          row is as high as it is with the buttons (DEC-112). */}
      {none && !oneLine && lines.twoLines && <div className="library-toolbar__spacer" aria-hidden />}
      {!none && (
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
              <span className="library-toolbar__arrow" aria-hidden />
            </Button>
          ))}
          <Button
            variant="secondary"
            className="library-toolbar__button library-toolbar__clear"
            aria-label={clearName}
            title="Clear selection"
            {...keys.buttonProps(groups.length)}
            onClick={clear}
          >
            {selected.toLocaleString()} selected
            {describedByQuery && selected > 1 && (
              // Said, not drawn: the button stays as short as "3 selected".
              <span className="library-toolbar__sr"> (everything matching)</span>
            )}
            <PixelIcon name="close" className="cp-pixel-icon--text cp-pixel-icon--after" />
          </Button>
        </div>
      )}

      <div className="library-toolbar__end">
        {/* The count keeps the width of its own form, held by an invisible copy in the same grid
            cell (drawn from an attribute, so it is no text a reader or a query finds), so the row
            is measured with it and, where its line is shorter, the count is cut with an ellipsis,
            never a button wrapped (N2-1). */}
        <span className="library-toolbar__count-box">
          <span className="library-toolbar__count-reserve" aria-hidden data-reserve={countText} />
          <span className="library-toolbar__count cp-data" role="status">
            {countText}
            {selected > 0 && (
              // Said for a screen reader, not drawn: the selected-count button shows it.
              <span className="library-toolbar__sr">
                , {selected.toLocaleString()} {selected === 1 ? "track" : "tracks"} selected
              </span>
            )}
          </span>
        </span>
        {/* Always there once there is anything to select, disabled when all is. */}
        {total > 0 && (
          <Button
            variant="secondary"
            className="library-toolbar__button library-toolbar__select-all"
            aria-disabled={selected >= total ? true : undefined}
            title={selected >= total ? EVERYTHING_SELECTED : undefined}
            onClick={() => {
              if (selected < total) onSelectAll();
            }}
          >
            Select all
          </Button>
        )}
      </div>
    </div>
  );
}
