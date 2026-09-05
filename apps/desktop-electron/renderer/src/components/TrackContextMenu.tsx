import { useCallback, useEffect, useRef, useState } from "react";
import "./TrackContextMenu.css";

/**
 * The track context menu (PLAYER-09, DEC-013, DEC-046).
 *
 * DEC-046 held this back from Phase 4 on purpose: a menu with two entries that
 * did nothing would have had to be taken apart again. It arrives here, with
 * playback, because DEC-013 makes Play Next and Add to Queue first-class
 * actions and a menu is where first-class actions live.
 *
 * A renderer component rather than Electron's native menu, for two reasons the
 * decision names: it can wear the pixel design system like everything else, and
 * it can be tested in jsdom instead of only in a packaged app.
 *
 * Keyboard behaviour is not an extra. The menu takes focus when it opens,
 * arrows move through it, Escape closes it and — the part that is easy to get
 * wrong — focus goes back to whatever had it before, so dismissing a menu does
 * not dump the user at the top of the page.
 */

export interface TrackContextMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Draws a divider above this entry. */
  separatorBefore?: boolean;
}

export interface TrackContextMenuProps {
  x: number;
  y: number;
  items: TrackContextMenuItem[];
  onClose: () => void;
  /** Describes what the menu acts on, for assistive technology. */
  label?: string;
}

/** Keeps the menu on screen when it opens near an edge. */
function clampToViewport(x: number, y: number, width: number, height: number) {
  const maxX = Math.max(0, window.innerWidth - width - 4);
  const maxY = Math.max(0, window.innerHeight - height - 4);
  return { left: Math.min(x, maxX), top: Math.min(y, maxY) };
}

export function TrackContextMenu({ x, y, items, onClose, label }: TrackContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [active, setActive] = useState(0);
  // Whatever had focus before, so it can have it back.
  const restoreTo = useRef<HTMLElement | null>(null);

  const enabled = items.filter((item) => !item.disabled);

  useEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    const element = menuRef.current;
    if (element) {
      const rect = element.getBoundingClientRect();
      setPosition(clampToViewport(x, y, rect.width, rect.height));
      element.focus();
    }
    return () => {
      // Focus goes home even when the menu is unmounted by something else.
      restoreTo.current?.focus?.();
    };
  }, [x, y]);

  const close = useCallback(() => onClose(), [onClose]);

  // A click anywhere else, or a scroll, dismisses it — the convention every
  // context menu follows, and the reason one never lingers over stale content.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) close();
    };
    const onScroll = () => close();
    document.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("resize", onScroll);
    window.addEventListener("blur", onScroll);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("blur", onScroll);
    };
  }, [close]);

  const choose = useCallback(
    (item: TrackContextMenuItem) => {
      if (item.disabled) return;
      // Close first: the action may open a dialog or move focus, and a menu
      // still on screen underneath it would be stranded.
      close();
      item.onSelect();
    },
    [close],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((current) => {
        const next = current + step;
        if (next < 0) return enabled.length - 1;
        if (next >= enabled.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      setActive(Math.max(0, enabled.length - 1));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const item = enabled[active];
      if (item) choose(item);
    }
  };

  return (
    <div
      ref={menuRef}
      className="cp-track-menu"
      role="menu"
      aria-label={label ?? "Track actions"}
      tabIndex={-1}
      style={{ left: position.left, top: position.top }}
      onKeyDown={onKeyDown}
      // The menu is opened by a right-click; a right-click inside it should not
      // open the browser's own on top.
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => {
        const index = enabled.indexOf(item);
        return (
          <div key={item.id} className="cp-track-menu__group">
            {item.separatorBefore && <div className="cp-track-menu__separator" role="separator" />}
            <button
              type="button"
              role="menuitem"
              className={`cp-track-menu__item${index === active ? " cp-track-menu__item--active" : ""}`}
              disabled={item.disabled}
              aria-disabled={item.disabled || undefined}
              onMouseEnter={() => index >= 0 && setActive(index)}
              onClick={() => choose(item)}
            >
              {item.label}
            </button>
          </div>
        );
      })}
    </div>
  );
}
