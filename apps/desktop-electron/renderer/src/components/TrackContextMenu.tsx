import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLayerStack } from "../hooks/useLayerStack";
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
 *
 * Focus moves with the highlight (M458): the arrows put real focus on the entry, so a screen
 * reader says it and a greyed entry shows its reason; Tab closes the menu; typing letters jumps to
 * the next entry that starts with them (M481). A menu opened with the pointer highlights nothing
 * until the pointer or a key does; one opened from the keyboard highlights the first entry (M293).
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
  /**
   * The top edge of the control that opened it (viewport px). A menu that does not fit under the
   * control opens above it, bottom to bottom of the gap, instead of sliding up over the control
   * itself (M290). Pass it with `x`/`y` at the control's bottom-left.
   */
  above?: number;
  /** The right edge of the control that opened it: the menu's right edge meets it (M290). */
  right?: number;
  /** True when a key opened it; left out, it is read from how the opener was focused (M293). */
  keyboard?: boolean;
}

/** The air between a menu and the control it opens from (M69, D26). */
function triggerGap(): number {
  const value = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-2xs"));
  return Number.isFinite(value) && value > 0 ? value : 2;
}

/**
 * The control a menu was opened from, when the caller did not say: the open menu button (it has
 * `aria-expanded="true"`) whose bottom-left corner is the point the menu was given. Lets a menu
 * opened "under its button" know the button's top edge, so it can open above it (M290).
 */
function findTrigger(x: number, y: number): HTMLElement | null {
  for (const element of document.querySelectorAll<HTMLElement>('[aria-expanded="true"]')) {
    const box = element.getBoundingClientRect();
    if (Math.abs(box.left - x) <= 2 && Math.abs(box.bottom - y) <= 2) return element;
  }
  return null;
}

/** Whether focus is on something a key put it on, so a menu opened from it highlights its first entry. */
function openedFromKeyboard(): boolean {
  try {
    return document.activeElement instanceof HTMLElement && document.activeElement.matches(":focus-visible");
  } catch {
    return false;
  }
}

/** The room the player bar and status strip take at the bottom (the shell measures it). */
function bottomInset(): number {
  const value = parseFloat(document.documentElement.style.getPropertyValue("--shell-bottom-inset"));
  return Number.isFinite(value) ? value : 0;
}

/**
 * Where the menu goes (M290). Under the point it was opened at when it fits there; otherwise
 * above: above the control's top edge when it has one, else flipped over the pointer, and only
 * when neither has room pushed up against the bottom. `right` meets the menu's right edge to the
 * control's, so a menu from a button at the page's end does not run past it.
 */
function placeMenu(
  x: number,
  y: number,
  width: number,
  height: number,
  options: { above?: number; right?: number; gap: number },
) {
  const limit = window.innerHeight - bottomInset() - 4;
  const left = Math.max(4, Math.min(options.right !== undefined ? options.right - width : x, window.innerWidth - width - 4));
  const below = y + options.gap;
  if (below + height <= limit) return { left, top: below };
  const from = options.above ?? y;
  const flipped = from - options.gap - height;
  if (flipped >= 4) return { left, top: flipped };
  return { left, top: Math.max(4, limit - height) };
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
 * Where a submenu goes, given the entry that opened it (ORG-13, M291).
 *
 * Beside the parent *list* (its edge, not the entry's, so the two never overlap), on whichever side
 * has room, with its first entry level with the parent entry. It moves up only by as much as it
 * overflows the bottom (above the player bar), never further.
 * Both cases are real: the menu is clamped *against* the right edge when it was
 * opened near one, so a submenu that always opened rightwards opened off
 * screen; and a menu long enough to scroll has entries near the bottom whose
 * child would start below the last visible pixel. Either way the list cannot be
 * clicked at all, which is how "rate this track" became unreachable.
 */
function placeSubmenu(parent: DOMRect, list: DOMRect, width: number, height: number, inset: number) {
  const room = window.innerWidth - list.right - 4;
  const left = room >= width ? list.right : Math.max(4, list.left - width);
  // The child's own padding and border sit above its first entry: level that entry with the parent.
  const top = parent.top - inset;
  const limit = window.innerHeight - bottomInset() - 4;
  return { left, top: Math.max(4, Math.min(top, limit - height)) };
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
    const list = parent.closest<HTMLElement>('[role="menu"]')?.getBoundingClientRect() ?? parent.getBoundingClientRect();
    const style = getComputedStyle(child);
    const inset = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.borderTopWidth) || 0);
    setPos(placeSubmenu(parent.getBoundingClientRect(), list, box.width, box.height, inset));
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

export function TrackContextMenu({
  x,
  y,
  items: given,
  onClose,
  label,
  anchor,
  above,
  right,
  keyboard,
}: TrackContextMenuProps) {
  const items = useMemo(() => arrange(given), [given]);
  const menuRef = useRef<HTMLDivElement>(null);
  // On the one stack of open layers, so Escape and Tab in a menu opened from a dialog are the
  // menu's and the dialog stays (M469).
  useLayerStack(true);
  // A menu opened by the pointer highlights nothing; one opened from the keyboard, the first entry.
  const [byKey] = useState(() => keyboard ?? openedFromKeyboard());
  // Closing leaves a still copy that fades (Opening and closing panels and dialogs).
  useLeaveGhost(menuRef);
  const [position, setPosition] = useState({ left: x, top: y });
  /** The parents whose children are showing, outermost first; the keys go to the last. */
  const [path, setPath] = useState<string[]>([]);
  /** The highlighted entry at each depth (-1: none yet); depth 0 is the menu itself. */
  const [actives, setActives] = useState<number[]>([byKey ? 0 : -1]);
  /** Entries by `depth:id`, so a key can put real focus on the highlighted one. */
  const itemEls = useRef(new Map<string, HTMLElement>());
  /** Set by a key that moved the highlight: the next commit moves focus and scrolls to it. */
  const focusActive = useRef(false);
  /** What has been typed to jump to an entry, and the timer that forgets it. */
  const typed = useRef({ text: "", timer: 0 });
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
  const depth = path.length;
  const activeAt = (at: number) => actives[at] ?? -1;
  const setActiveAt = (at: number, value: number) =>
    setActives((current) => {
      const next = current.slice(0, at);
      while (next.length < at) next.push(-1);
      next[at] = value;
      return next;
    });

  // Real focus follows the highlight when a key moved it, so a reader says the entry and a greyed
  // one shows its reason (Hint shows on keyboard focus); the entry scrolls into view (M458).
  useEffect(() => {
    if (!focusActive.current) return;
    focusActive.current = false;
    const entry = listAt(depth)[activeAt(depth)];
    const element = entry ? itemEls.current.get(`${depth}:${entry.id}`) : undefined;
    if (element) {
      element.focus();
      element.scrollIntoView?.({ block: "nearest" });
    } else {
      menuRef.current?.focus();
    }
  });
  useEffect(() => () => window.clearTimeout(typed.current.timer), []);

  // Placed before the first paint, so the menu's entrance plays where it stays rather than
  // jumping into the viewport a frame in.
  useLayoutEffect(() => {
    restoreTo.current = document.activeElement as HTMLElement | null;
    const element = menuRef.current;
    if (element) {
      const rect = element.getBoundingClientRect();
      const trigger = anchor?.current ?? findTrigger(x, y);
      const box = trigger?.getBoundingClientRect();
      const gutter = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--space-lg")) || 12;
      setPosition(
        placeMenu(x, y, rect.width, rect.height, {
          above: above ?? box?.top,
          // A menu that would run past the page's right edge meets its button's right edge instead.
          right: right ?? (box && x + rect.width > window.innerWidth - gutter ? box.right : undefined),
          gap: box || above !== undefined ? triggerGap() : 0,
        }),
      );
      element.focus();
    }
    return () => {
      // Focus goes home even when the menu is unmounted by something else.
      restoreTo.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- placed once per opening point
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

  /**
   * Open a parent listed at `at`. A parent opens; it never acts. The pointer opens it with nothing
   * highlighted inside; a key opens it with its first entry highlighted (M293).
   */
  const openParent = (item: TrackContextMenuItem, at: number, fromKey: boolean) => {
    setPath((current) => (current[at] === item.id ? current : [...current.slice(0, at), item.id]));
    setActives((current) => {
      const next = current.slice(0, at + 1);
      while (next.length < at + 1) next.push(-1);
      next[at + 1] = fromKey ? 0 : -1;
      return next;
    });
    if (fromKey) focusActive.current = true;
  };

  const choose = (item: TrackContextMenuItem, at: number, fromKey = false) => {
    if (item.disabled) return;
    if (hasChildren(item)) {
      // Closing the menu here would dismiss the list the user was reaching for.
      openParent(item, at, fromKey);
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

  /** The next entry in a direction; from nothing highlighted either arrow lands on the first (M293). */
  const step = (current: number, by: number, length: number) => {
    if (current < 0) return 0;
    const next = current + by;
    if (next < 0) return length - 1;
    if (next >= length) return 0;
    return next;
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    // Every key belongs to the deepest open list, so no list above it moves
    // underneath it. Greyed entries are walked too, so their reason can be read (M458).
    const list = listAt(depth);
    const active = activeAt(depth);

    if (event.key === "Tab") {
      // Tab leaves the menu: it closes and focus goes back to where it was (M458).
      event.preventDefault();
      close();
      return;
    }
    if (event.key === "Escape" || (event.key === "ArrowLeft" && depth > 0)) {
      event.preventDefault();
      event.stopPropagation();
      if (depth > 0) {
        setPath((current) => current.slice(0, -1));
        focusActive.current = true;
      } else close();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusActive.current = true;
      setActiveAt(depth, step(active, event.key === "ArrowDown" ? 1 : -1, list.length));
      return;
    }
    if (event.key === "ArrowRight") {
      const item = list[active];
      if (item && hasChildren(item) && !item.disabled) {
        event.preventDefault();
        openParent(item, depth, true);
      }
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      focusActive.current = true;
      setActiveAt(depth, event.key === "Home" ? 0 : Math.max(0, list.length - 1));
      return;
    }
    if (event.key === "Enter" || (event.key === " " && typed.current.text === "")) {
      event.preventDefault();
      const item = list[active];
      if (item) choose(item, depth, true);
      return;
    }
    // Type-ahead: letters build a word that jumps to the next entry starting with it (M481).
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      window.clearTimeout(typed.current.timer);
      typed.current.text += event.key.toLowerCase();
      typed.current.timer = window.setTimeout(() => {
        typed.current.text = "";
      }, 700);
      const word = typed.current.text;
      // One repeated letter cycles through the entries that start with it.
      const key = /^(.)\1+$/.test(word) ? word[0]! : word;
      const from = key.length === 1 ? active + 1 : Math.max(active, 0);
      for (let i = 0; i < list.length; i += 1) {
        const at = (from + i) % list.length;
        if (list[at]!.label.toLowerCase().startsWith(key)) {
          focusActive.current = true;
          setActiveAt(depth, at);
          break;
        }
      }
    }
  };

  const menuId = useId();

  const renderItem = (item: TrackContextMenuItem, at: number): React.ReactNode => {
    const index = listAt(at).indexOf(item);
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
            ref={(element) => {
              const key = `${at}:${item.id}`;
              if (element) itemEls.current.set(key, element);
              else itemEls.current.delete(key);
            }}
            // One entry is in the tab order, the highlighted one; Tab closes the menu anyway (M458).
            tabIndex={index === activeAt(at) ? 0 : -1}
            aria-haspopup={parent ? "menu" : undefined}
            aria-expanded={parent ? showing : undefined}
            onMouseEnter={() => {
              if (index >= 0) setActiveAt(at, index);
              // Resting on a parent opens its list; moving to another entry closes what it opened,
              // so two lists at one depth are never showing at once (M292).
              if (parent && !unavailable) openParent(item, at, false);
              else setPath((current) => (current.length > at ? current.slice(0, at) : current));
            }}
            onClick={() => choose(item, at)}
          >
            {item.checked !== undefined && (
              <span className="cp-track-menu__check" aria-hidden="true">
                {item.checked === true && <PixelIcon name="check" size="sm" />}
                {item.checked === "mixed" && <PixelIcon name="dot-half" size="sm" />}
              </span>
            )}
            <span className="cp-track-menu__label" data-cut-hint="">
              {item.label}
            </span>
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
