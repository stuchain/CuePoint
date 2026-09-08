import { useCallback, useEffect, useRef, useState } from "react";
import "./TrackContextMenu.css";

/**
 * The track context menu (PLAYER-09, DEC-013, DEC-046, then ORG-11).
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
 *
 * ORG-11 added **submenus**, for one reason: a rating is six choices, and six
 * more rows in a menu that already has nine is a menu nobody reads. A submenu
 * costs the keyboard nothing — ArrowRight opens, ArrowLeft closes, and the
 * arrows inside it behave exactly as they do outside — which is why it is
 * worth having rather than flattening.
 */

export interface TrackContextMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Draws a divider above this entry. */
  separatorBefore?: boolean;
  /**
   * Entries this one opens rather than an action it performs.
   *
   * An item with children never runs `onSelect`; choosing it opens the list.
   */
  items?: TrackContextMenuItem[];
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
  /** The parent entry whose children are showing, and where the keys go. */
  const [openId, setOpenId] = useState<string | null>(null);
  const [subActive, setSubActive] = useState(0);
  // Whatever had focus before, so it can have it back.
  const restoreTo = useRef<HTMLElement | null>(null);

  const enabled = items.filter((item) => !item.disabled);
  const open = openId === null ? null : items.find((item) => item.id === openId) ?? null;
  const subItems = (open?.items ?? []).filter((item) => !item.disabled);

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
      if (item.items && item.items.length > 0) {
        // A parent opens; it never acts. Closing the menu here would dismiss
        // the list the user was reaching for.
        setOpenId((current) => (current === item.id ? null : item.id));
        setSubActive(0);
        return;
      }
      // Close first: the action may open a dialog or move focus, and a menu
      // still on screen underneath it would be stranded.
      close();
      item.onSelect();
    },
    [close],
  );

  const step = (current: number, by: number, length: number) => {
    const next = current + by;
    if (next < 0) return length - 1;
    if (next >= length) return 0;
    return next;
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (open) {
      // Every key belongs to the open list while one is open, so the parent
      // menu never moves underneath it.
      if (event.key === "Escape" || event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        setOpenId(null);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setSubActive((current) =>
          step(current, event.key === "ArrowDown" ? 1 : -1, subItems.length),
        );
        return;
      }
      if (event.key === "Home" || event.key === "End") {
        event.preventDefault();
        setSubActive(event.key === "Home" ? 0 : Math.max(0, subItems.length - 1));
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const item = subItems[subActive];
        if (item) {
          close();
          item.onSelect();
        }
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => step(current, event.key === "ArrowDown" ? 1 : -1, enabled.length));
      return;
    }
    if (event.key === "ArrowRight") {
      const item = enabled[active];
      if (item?.items && item.items.length > 0) {
        event.preventDefault();
        setOpenId(item.id);
        setSubActive(0);
      }
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
        const parent = Boolean(item.items && item.items.length > 0);
        const showing = parent && openId === item.id;
        return (
          <div key={item.id} className="cp-track-menu__group">
            {item.separatorBefore && <div className="cp-track-menu__separator" role="separator" />}
            <button
              type="button"
              role="menuitem"
              className={`cp-track-menu__item${index === active ? " cp-track-menu__item--active" : ""}${parent ? " cp-track-menu__item--parent" : ""}`}
              disabled={item.disabled}
              aria-disabled={item.disabled || undefined}
              aria-haspopup={parent ? "menu" : undefined}
              aria-expanded={parent ? showing : undefined}
              onMouseEnter={() => {
                if (index >= 0) setActive(index);
                // Leaving a parent closes what it opened, so two lists are
                // never showing at once.
                if (!parent) setOpenId(null);
              }}
              onClick={() => choose(item)}
            >
              {item.label}
              {parent && (
                <span className="cp-track-menu__arrow" aria-hidden="true">
                  ▸
                </span>
              )}
            </button>
            {showing && (
              <div className="cp-track-menu__submenu" role="menu" aria-label={item.label}>
                {item.items!.map((child) => {
                  const childIndex = subItems.indexOf(child);
                  return (
                    <button
                      key={child.id}
                      type="button"
                      role="menuitem"
                      className={`cp-track-menu__item${childIndex === subActive ? " cp-track-menu__item--active" : ""}`}
                      disabled={child.disabled}
                      aria-disabled={child.disabled || undefined}
                      onMouseEnter={() => childIndex >= 0 && setSubActive(childIndex)}
                      onClick={() => {
                        if (child.disabled) return;
                        close();
                        child.onSelect();
                      }}
                    >
                      {child.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
