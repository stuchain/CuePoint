import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLeaveGhost } from "../tokens/useLeaveGhost";
import { Hint } from "./Hint";
import { PixelIcon } from "./PixelIcon";
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
  /**
   * Why a greyed entry is greyed ("Select one or more tracks"), in the same hover. Only shown while
   * `disabled`, and then instead of `title`. A greyed entry should always say why (area 81).
   */
  reason?: string;
  /**
   * A small group title drawn above this entry in the label style (10, bold, muted), after the
   * divider if there is one ("Add to", "Rate"). It is not an entry: arrows skip it.
   */
  groupTitle?: string;
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
  /**
   * A tickable entry (K12): present, it is a menu checkbox, and choosing it
   * runs `onSelect` and leaves the menu open so several can be toggled.
   */
  checked?: boolean | "mixed";
  /**
   * A destructive entry (Delete this dig…): drawn in the theme's danger colour, and always listed
   * last in its menu after a divider, whatever order it was given in (C16).
   */
  danger?: boolean;
  /**
   * The key that does the same thing, written as `api/keyboardShortcuts.ts` writes it ("Enter",
   * "F2"): drawn right-aligned in the muted data face. Take the words from that file, not here.
   */
  shortcut?: string;
}

interface TrackContextMenuProps {
  x: number;
  y: number;
  items: TrackContextMenuItem[];
  onClose: () => void;
  /** Describes what the menu acts on, for assistive technology. */
  label?: string;
  /**
   * The button that opened it. A press on it is not "elsewhere": the button's
   * own click toggles the menu, rather than this one closing it first and the
   * click opening it again.
   */
  anchor?: React.RefObject<HTMLElement | null>;
}

/** The room the player bar and status strip take at the bottom (the shell measures it). */
function bottomInset(): number {
  const value = parseFloat(document.documentElement.style.getPropertyValue("--shell-bottom-inset"));
  return Number.isFinite(value) ? value : 0;
}

/** Keeps a box on screen, and above the player bar, when it opens near an edge. */
function clampToViewport(x: number, y: number, width: number, height: number) {
  const maxX = Math.max(0, window.innerWidth - width - 4);
  const maxY = Math.max(0, window.innerHeight - bottomInset() - height - 4);
  return { left: Math.min(x, maxX), top: Math.min(y, maxY) };
}

/**
 * Danger entries last, after a divider, at every depth (C16); everything else keeps its order.
 * The keyboard walks the arranged list, so what is drawn is what the arrows visit.
 */
function arrange(list: TrackContextMenuItem[]): TrackContextMenuItem[] {
  const calm = list.filter((item) => !item.danger);
  const danger = list.filter((item) => item.danger);
  const ordered = danger.length > 0 && calm.length > 0 ? [...calm, { ...danger[0]!, separatorBefore: true }, ...danger.slice(1)] : list;
  return ordered.map((item) => (item.items ? { ...item, items: arrange(item.items) } : item));
}

/**
 * The state a menu button needs (C113). Spread `buttonProps` on the button and pass `anchor` and
 * `close` to the menu: a press on the button no longer closes the menu first (which made the
 * click open it again), so one click opens it and the next closes it.
 */
export function useMenuButton() {
  const anchor = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((current) => !current), []);
  return {
    anchor,
    open,
    close,
    toggle,
    buttonProps: {
      ref: anchor as React.RefObject<HTMLButtonElement | null>,
      "aria-haspopup": "menu" as const,
      "aria-expanded": open,
      onClick: toggle,
    },
  };
}

/**
 * Where a submenu goes, given the entry that opened it (ORG-13).
 *
 * Beside its parent, on whichever side has room, and never below the window.
 * Without room below, its bottom meets the parent's bottom rather than sliding up
 * over the main menu.
 * Both cases are real: the menu is clamped *against* the right edge when it was
 * opened near one, so a submenu that always opened rightwards opened off
 * screen; and a menu long enough to scroll has entries near the bottom whose
 * child would start below the last visible pixel. Either way the list cannot be
 * clicked at all, which is how "rate this track" became unreachable.
 */
function placeSubmenu(parent: DOMRect, width: number, height: number) {
  const room = window.innerWidth - parent.right - 4;
  const left = room >= width ? parent.right : Math.max(4, parent.left - width);
  const fitsBelow = parent.top + height <= window.innerHeight - 4;
  const top = fitsBelow ? parent.top : Math.max(4, parent.bottom - height);
  return { left, top: clampToViewport(left, top, width, height).top };
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

export function TrackContextMenu({ x, y, items: given, onClose, label, anchor }: TrackContextMenuProps) {
  const items = useMemo(() => arrange(given), [given]);
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
      const target = event.target as Node;
      if (anchor?.current?.contains(target)) return;
      if (!menuRef.current?.contains(target)) close();
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
  }, [anchor, close]);

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
    if (item.checked !== undefined) {
      item.onSelect();
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

  const menuId = useId();

  const renderItem = (item: TrackContextMenuItem, at: number): React.ReactNode => {
    const enabled = enabledAt(at);
    const index = enabled.indexOf(item);
    const parent = hasChildren(item);
    const showing = parent && path[at] === item.id;
    const unavailable = item.disabled === true;
    const reasonId = unavailable && item.reason ? `${menuId}-${at}-${item.id}-reason` : undefined;
    return (
      <div key={item.id} className="cp-track-menu__group">
        <Hint text={unavailable && item.reason ? item.reason : item.title}>
          {/* aria-disabled, not `disabled`: the entry stays in the order a reader walks and can say
              why it is off (aria-describedby); it still cannot be chosen (`choose` returns). */}
          <button
            type="button"
            role={item.checked === undefined ? "menuitem" : "menuitemcheckbox"}
            aria-checked={item.checked}
            className={`cp-track-menu__item${index === activeAt(at) ? " cp-track-menu__item--active" : ""}${parent ? " cp-track-menu__item--parent" : ""}${showing ? " cp-track-menu__item--open" : ""}${item.danger ? " cp-track-menu__item--danger" : ""}`}
            aria-disabled={unavailable || undefined}
            aria-describedby={reasonId}
            aria-keyshortcuts={item.shortcut}
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
            {item.checked !== undefined && (
              <span className="cp-track-menu__check" aria-hidden="true">
                {item.checked === true && <PixelIcon name="check" size="sm" />}
                {item.checked === "mixed" && <PixelIcon name="dot-half" size="sm" />}
              </span>
            )}
            {item.label}
            {item.shortcut && !parent && (
              <span className="cp-track-menu__shortcut" aria-hidden="true">
                {item.shortcut}
              </span>
            )}
            {parent && (
              <span className="cp-track-menu__arrow" aria-hidden="true">
                <PixelIcon name="chevron-right" size="sm" />
              </span>
            )}
          </button>
        </Hint>
        {reasonId && (
          <span id={reasonId} className="cp-visually-hidden">
            {item.reason}
          </span>
        )}
        {showing && <Submenu label={item.label}>{renderList(item.items!, at + 1)}</Submenu>}
      </div>
    );
  };

  /**
   * A list, with each titled group (an entry with `groupTitle` and the entries after it, up to the
   * next title or divider) wrapped as a `role="group"` named by its title, so a reader hears
   * "This page, group" and not a loose heading.
   */
  const renderList = (list: TrackContextMenuItem[], at: number): React.ReactNode => {
    const out: React.ReactNode[] = [];
    let group: { id: string; title: string; rows: React.ReactNode[] } | null = null;
    const close = () => {
      if (!group) return;
      out.push(
        <div key={`group-${group.id}`} role="group" aria-labelledby={group.id}>
          <div id={group.id} className="cp-track-menu__heading" role="presentation">
            {group.title}
          </div>
          {group.rows}
        </div>,
      );
      group = null;
    };
    for (const item of list) {
      if (item.separatorBefore || item.groupTitle) close();
      if (item.separatorBefore) {
        out.push(<div key={`sep-${item.id}`} className="cp-track-menu__separator" role="separator" />);
      }
      if (item.groupTitle) group = { id: `${menuId}-${at}-${item.id}-title`, title: item.groupTitle, rows: [] };
      (group ? group.rows : out).push(renderItem(item, at));
    }
    close();
    return out;
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
      {renderList(items, 0)}
    </div>
  );
}
