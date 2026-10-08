import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLeaveGhost } from "../tokens/useLeaveGhost";
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
 *
 * Submenus nest (FLW-8): the Library's menu shows the selection bar's groups as
 * parents, and Organize ▸ holds Rate ▸. The keys keep their meaning at every
 * depth — ArrowRight goes in, ArrowLeft or the first Escape comes back out one
 * level — and only the deepest open list takes them.
 */

export interface TrackContextMenuItem {
  id: string;
  label: string;
  /** What the entry does, for a hover; the label stays the name. */
  title?: string;
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

interface TrackContextMenuProps {
  x: number;
  y: number;
  items: TrackContextMenuItem[];
  onClose: () => void;
  /** Describes what the menu acts on, for assistive technology. */
  label?: string;
}

/** Keeps a box on screen when it opens near an edge. */
function clampToViewport(x: number, y: number, width: number, height: number) {
  const maxX = Math.max(0, window.innerWidth - width - 4);
  const maxY = Math.max(0, window.innerHeight - height - 4);
  return { left: Math.min(x, maxX), top: Math.min(y, maxY) };
}

/**
 * Where a submenu goes, given the entry that opened it (ORG-13).
 *
 * Beside its parent, on whichever side has room, and never below the window.
 * Both cases are real: the menu is clamped *against* the right edge when it was
 * opened near one, so a submenu that always opened rightwards opened off
 * screen; and a menu long enough to scroll has entries near the bottom whose
 * child would start below the last visible pixel. Either way the list cannot be
 * clicked at all, which is how "rate this track" became unreachable.
 */
function placeSubmenu(parent: DOMRect, width: number, height: number) {
  const room = window.innerWidth - parent.right - 4;
  const left = room >= width ? parent.right : Math.max(4, parent.left - width);
  return { left, top: clampToViewport(left, parent.top, width, height).top };
}

/** A list beside the entry that opened it; measured once it exists (ORG-13). */
function Submenu({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Null until measured, which is one frame; it is rendered offscreen rather
  // than at the wrong place for that frame, so the list never jumps.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // A layout effect, so the move happens before the browser paints.
  useLayoutEffect(() => {
    const child = ref.current;
    const parent = child?.parentElement?.querySelector<HTMLElement>('[role="menuitem"]');
    if (!child || !parent) return;
    const box = child.getBoundingClientRect();
    setPos(placeSubmenu(parent.getBoundingClientRect(), box.width, box.height));
  }, []);

  return (
    <div
      ref={ref}
      className="cp-track-menu__submenu"
      role="menu"
      aria-label={label}
      style={
        pos
          ? { left: pos.left, top: pos.top }
          : // Out of the way while it is measured, rather than at a guess
            // that would be visibly corrected.
            { left: 0, top: 0, visibility: "hidden" }
      }
    >
      {children}
    </div>
  );
}

const hasChildren = (item: TrackContextMenuItem | undefined) =>
  Boolean(item?.items && item.items.length > 0);

export function TrackContextMenu({ x, y, items, onClose, label }: TrackContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  // Closing leaves a still copy that fades (Opening and closing panels and dialogs).
  useLeaveGhost(menuRef);
  const [position, setPosition] = useState({ left: x, top: y });
  /** The parents whose children are showing, outermost first; the keys go to the last. */
  const [path, setPath] = useState<string[]>([]);
  /** The highlighted entry at each depth; depth 0 is the menu itself. */
  const [actives, setActives] = useState<number[]>([0]);
  // Whatever had focus before, so it can have it back.
  const restoreTo = useRef<HTMLElement | null>(null);

  /** The entries listed at a depth: every one, then the ones that can be chosen. */
  const listAt = (depth: number): TrackContextMenuItem[] => {
    let list = items;
    for (let i = 0; i < depth; i += 1) {
      list = list.find((item) => item.id === path[i])?.items ?? [];
    }
    return list;
  };
  const enabledAt = (depth: number) => listAt(depth).filter((item) => !item.disabled);
  const depth = path.length;
  const activeAt = (at: number) => actives[at] ?? 0;
  const setActiveAt = (at: number, value: number) =>
    setActives((current) => {
      const next = current.slice(0, at);
      while (next.length < at) next.push(0);
      next[at] = value;
      return next;
    });

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

  /** Open (or shut) a parent listed at `at`. A parent opens; it never acts. */
  const toggleParent = (item: TrackContextMenuItem, at: number) => {
    setPath((current) =>
      current[at] === item.id ? current.slice(0, at) : [...current.slice(0, at), item.id],
    );
    setActiveAt(at + 1, 0);
  };

  const choose = (item: TrackContextMenuItem, at: number) => {
    if (item.disabled) return;
    if (hasChildren(item)) {
      // Closing the menu here would dismiss the list the user was reaching for.
      toggleParent(item, at);
      return;
    }
    // Close first: the action may open a dialog or move focus, and a menu
    // still on screen underneath it would be stranded.
    close();
    item.onSelect();
  };

  const step = (current: number, by: number, length: number) => {
    const next = current + by;
    if (next < 0) return length - 1;
    if (next >= length) return 0;
    return next;
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Every key belongs to the deepest open list, so no list above it moves
    // underneath it.
    const enabled = enabledAt(depth);
    const active = activeAt(depth);

    if (event.key === "Escape" || (event.key === "ArrowLeft" && depth > 0)) {
      event.preventDefault();
      event.stopPropagation();
      if (depth > 0) setPath((current) => current.slice(0, -1));
      else close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveAt(depth, step(active, event.key === "ArrowDown" ? 1 : -1, enabled.length));
      return;
    }
    if (event.key === "ArrowRight") {
      const item = enabled[active];
      if (item && hasChildren(item)) {
        event.preventDefault();
        setPath((current) => [...current.slice(0, depth), item.id]);
        setActiveAt(depth + 1, 0);
      }
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveAt(depth, event.key === "Home" ? 0 : Math.max(0, enabled.length - 1));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const item = enabled[active];
      if (item) choose(item, depth);
    }
  };

  const renderList = (list: TrackContextMenuItem[], at: number): React.ReactNode =>
    list.map((item) => {
      const enabled = enabledAt(at);
      const index = enabled.indexOf(item);
      const parent = hasChildren(item);
      const showing = parent && path[at] === item.id;
      return (
        <div key={item.id} className="cp-track-menu__group">
          {item.separatorBefore && <div className="cp-track-menu__separator" role="separator" />}
          <button
            type="button"
            role="menuitem"
            className={`cp-track-menu__item${index === activeAt(at) ? " cp-track-menu__item--active" : ""}${parent ? " cp-track-menu__item--parent" : ""}`}
            disabled={item.disabled}
            aria-disabled={item.disabled || undefined}
            title={item.title}
            aria-haspopup={parent ? "menu" : undefined}
            aria-expanded={parent ? showing : undefined}
            onMouseEnter={() => {
              if (index >= 0) setActiveAt(at, index);
              // Leaving a parent closes what it opened, so two lists at one
              // depth are never showing at once.
              if (!parent) setPath((current) => (current.length > at ? current.slice(0, at) : current));
            }}
            onClick={() => choose(item, at)}
          >
            {item.label}
            {parent && (
              <span className="cp-track-menu__arrow" aria-hidden="true">
                ▸
              </span>
            )}
          </button>
          {showing && <Submenu label={item.label}>{renderList(item.items!, at + 1)}</Submenu>}
        </div>
      );
    });

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
      {renderList(items, 0)}
    </div>
  );
}
