import { useCallback, useEffect, useRef, useState, useLayoutEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import appIcon from "../../assets/cuepoint-icon.png";
import { LIBRARY_HEALTH, useSharedRead } from "../../api/sharedReads";
import { formatCount } from "../../format/counts";
import { toCheckCount } from "../../screens/clean/cleanSections";
import { Hint } from "../Hint";
import { PixelIcon } from "../PixelIcon";
import {
  groupedDestinations,
  homeDestination,
  litDestination,
  type NavDestination,
} from "./navRegistry";
import { Kbd } from "../Kbd";
import { isDialogOpen } from "./shellKeyboard";
import { emitShellCommand, useShellCommand } from "./shellCommands";
import { reportViewState } from "../../api/menuViewState";
import { loadSidebarCollapsed, neededHeightFor, saveSidebarCollapsed, railTight } from "./sidebarState";
import { useLibraryEmpty } from "./useLibraryPresence";
import "./Sidebar.css";

/**
 * Primary navigation (DEC-020, DEC-021, DEC-022), laid out as option D of the sidebar redesign:
 * the logo and name alone on top; the Search field (K8, DEC-282) with a divider under it (C229);
 * the page entries, which alone scroll; and at the foot Settings with the collapse toggle on its
 * own row under it, in the same icon column (C228). Activity is not a page: its button is in the
 * status strip (M273, D25). The top and bottom rows stay fixed (R2-9).
 * There is no "Pages" label: it labelled nothing the rail does not show, and it moved every
 * entry when the rail was toggled (C228).
 *
 * Every entry comes from the registry, so a destination that has not been
 * built is not rendered — and enabling one later is a flag, not a change here.
 *
 * `Link` with an explicit `aria-current="page"` on the lit entry, not `NavLink`: NavLink matches
 * by path, so it would keep Discover current on an Artist page opened from the Library. In the collapsed rail that is the only thing
 * distinguishing the current page for a screen-reader user, since the labels
 * are gone. The entry lit is the page's own, or for an Artist or Similar page the page it was
 * opened from (C221).
 *
 * Each entry is one line, the label (K7), one row tall (C208). What it is for (NAV-1) is its
 * tooltip in the collapsed rail, with the label in front of it; in the open rail it is the
 * link's description only, so no tip covers the page beside the rail (N3). An empty library dims
 * nothing: each page explains itself (C144).
 */
function DestinationLink({ destination, collapsed, lit, waiting = 0 }: {
  destination: NavDestination;
  collapsed: boolean;
  /** Whether this entry is the one lit for the current page (C221). */
  lit: boolean;
  /** Tracks waiting here for a decision: the Clean entry says how many (M507). */
  waiting?: number;
}) {
  const { hint } = destination;
  const said = waiting > 0 ? `${formatCount(waiting)} to check` : "";
  return (
    <Hint
      // The tip shows only in the collapsed rail, as the brand's does: in the open rail the label
      // is on screen, and a tip to the right would cover the page's first pane row (N3).
      text={collapsed ? `${destination.label}: ${hint}${said ? `. ${said}` : ""}` : undefined}
      portal
      placement="right"
    >
      <Link
        to={destination.path}
        className={`cp-sidebar__link${lit ? " cp-sidebar__link--active" : ""}`}
        aria-current={lit ? "page" : undefined}
        // The accessible name has to survive collapsing: with labels hidden the
        // link would otherwise announce as its glyph, or as nothing at all.
        aria-label={said ? `${destination.label}, ${said}` : destination.label}
        // What the page is for still reaches a screen reader when no tip is shown (N3).
        aria-description={collapsed ? undefined : hint}
      >
        <span className="cp-sidebar__icon" aria-hidden>
          {destination.icon ? <PixelIcon name={destination.icon} /> : <span className="cp-sidebar__glyph">{destination.glyph}</span>}
        </span>
        {!collapsed && <span className="cp-sidebar__label">{destination.label}</span>}
        {!collapsed && waiting > 0 && (
          <span className="cp-sidebar__count" aria-hidden>
            {formatCount(waiting)}
          </span>
        )}
      </Link>
    </Hint>
  );
}

/** The Clean entry: the same link, with how many tracks wait for a decision beside it (M507). */
function CleanLink({ destination, collapsed, lit }: { destination: NavDestination; collapsed: boolean; lit: boolean }) {
  const read = useSharedRead(LIBRARY_HEALTH);
  const waiting = toCheckCount(read.value ?? null) ?? 0;
  return <DestinationLink destination={destination} collapsed={collapsed} lit={lit} waiting={waiting} />;
}

/** The brand (HDR-6): the pixel logo and the name, or the logo alone when the rail is closed. */
function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Hint text={collapsed ? "CuePoint" : undefined} portal placement="right">
      <Link to={homeDestination().path} className="cp-sidebar__brand" aria-label="CuePoint">
        <span className="cp-sidebar__icon cp-sidebar__logo" aria-hidden>
          <img className="cp-sidebar__logo-img" src={appIcon} alt="" draggable={false} />
        </span>
        {!collapsed && <span className="cp-sidebar__brand-name">CuePoint</span>}
      </Link>
    </Hint>
  );
}

/**
 * The Search field (K8, DEC-282, option D): a button that looks like the box you type into, a
 * magnifier, "Search library" and the shortcut muted at the right. It opens the search dialog,
 * which Ctrl+K opens too; nothing is typed here. Its name is "Search library" in both states (M393);
 * the collapsed rail shows the icon alone, and the tip says the key there.
 */
function SearchButton({ collapsed, onOpen }: { collapsed: boolean; onOpen: () => void }) {
  return (
    <Hint text="Search library" shortcut="Mod+K" portal placement="right">
      <button
        type="button"
        className={`cp-sidebar__link cp-sidebar__search${collapsed ? "" : " cp-sidebar__search--box"}`}
        // One name in the rail, the field, the dialog and the shortcuts list (M393).
        aria-label="Search library"
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        <span className="cp-sidebar__icon" aria-hidden>
          <PixelIcon name="search" />
        </span>
        {!collapsed && (
          <>
            <span className="cp-sidebar__label cp-sidebar__search-placeholder">Search library</span>
            <span className="cp-sidebar__search-keys" aria-hidden>
              <Kbd keys="Mod+K" />
            </span>
          </>
        )}
      </button>
    </Hint>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(loadSidebarCollapsed);
  const openSearch = useCallback(() => emitShellCommand("open-search"), []);
  const location = useLocation();
  const lit = litDestination(location.pathname, location.state)?.id ?? null;

  useEffect(() => {
    saveSidebarCollapsed(collapsed);
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((value) => !value), []);

  // A window too short for the rail's rows (2x in 1264x735, item 2) tightens it rather than make
  // it scroll: the gaps go, and the closed rail's icons lose the padding above and below them.
  const navRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [tight, setTight] = useState(false);
  // What the loose rail needed when it tightened, for the mode (open or closed, text size) it was
  // measured in: a height from another mode is not trusted (neededHeightFor).
  const neededHeight = useRef<{ mode: string; height: number } | null>(null);
  const measureRail = useCallback(() => {
    const rail = navRef.current;
    const list = listRef.current;
    if (!rail || !list) return;
    const mode = `${collapsed ? "closed" : "open"}@${getComputedStyle(rail).getPropertyValue("--scale").trim()}`;
    const overflow = Math.max(0, list.scrollHeight - list.clientHeight) + Math.max(0, rail.scrollHeight - rail.clientHeight);
    const height = rail.clientHeight;
    const scale = Number.parseFloat(getComputedStyle(rail).getPropertyValue("--scale"));
    const next = railTight(tight, { overflow, height, needed: neededHeightFor(neededHeight.current, mode), scale });
    if (next && !tight) neededHeight.current = { mode, height: height + overflow };
    if (next !== tight) setTight(next);
  }, [tight, collapsed]);
  useLayoutEffect(measureRail, [measureRail, collapsed]);
  useEffect(() => {
    const rail = navRef.current;
    if (!rail || typeof ResizeObserver === "undefined") return;
    const watcher = new ResizeObserver(measureRail);
    watcher.observe(rail);
    return () => watcher.disconnect();
  }, [measureRail]);
  // The shell keeps asking whether the first import has finished (it makes the pages read again
  // when it has); it dims nothing meanwhile (C144).
  const libraryEmpty = useLibraryEmpty();

  // View → Sidebar in the menu.
  // Focus stays where it was (M472), as it does for Ctrl+B.
  useShellCommand("toggle-sidebar", toggle);
  useEffect(() => reportViewState({ sidebar: !collapsed }), [collapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "b") {
        // Not behind an open dialog (C201).
        if (isDialogOpen()) return;
        event.preventDefault();
        // Focus stays where it was (M472): the shortcut changes the rail, it does not take you there.
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const groups = groupedDestinations();
  // The system group (Settings) is the one pinned at the foot, whatever else the registry holds.
  const pinned = groups.find((entry) => entry.group === "system");
  const scrolling = groups.filter((entry) => entry !== pinned);

  // The toggle is a row like the entries, so its icon sits in their icon column in both states.
  const toggleButton = (
    <Hint text={`${collapsed ? "Expand" : "Collapse"} sidebar`} shortcut="Mod+B" portal placement="right">
      <button
        type="button"
        className="cp-sidebar__link cp-sidebar__toggle"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={`${collapsed ? "Expand" : "Collapse"} sidebar`}
      >
        <span aria-hidden className="cp-sidebar__icon">
          <PixelIcon name={collapsed ? "chevron-right" : "chevron-left"} />
        </span>
      </button>
    </Hint>
  );

  const renderLink = (destination: NavDestination) =>
    destination.id === "clean" ? (
      <CleanLink key={destination.id} destination={destination} collapsed={collapsed} lit={destination.id === lit} />
    ) : (
      <DestinationLink key={destination.id} destination={destination} collapsed={collapsed} lit={destination.id === lit} />
    );

  const renderGroup = (entry: (typeof groups)[number]) => {
    const label =
      entry.label && !collapsed ? <p className="cp-sidebar__group-label">{entry.label}</p> : null;
    if (entry !== pinned) {
      return (
        <div className="cp-sidebar__group" key={entry.group}>
          {label}
          {entry.destinations.map(renderLink)}
        </div>
      );
    }
    // Only the last entry (Settings) shares the foot with the toggle; any other stacks above it.
    const last = entry.destinations[entry.destinations.length - 1];
    return (
      <div className="cp-sidebar__group cp-sidebar__group--pinned" key={entry.group}>
        {label}
        {entry.destinations.slice(0, -1).map(renderLink)}
        <div className="cp-sidebar__foot">
          {last ? renderLink(last) : null}
          {toggleButton}
        </div>
      </div>
    );
  };

  return (
    <nav
      className={`cp-sidebar ${collapsed ? "cp-sidebar--collapsed" : ""}`.trim()}
      aria-label="Main navigation"
      data-collapsed={collapsed ? "true" : "false"}
      data-library-empty={libraryEmpty ? "true" : undefined}
      data-tight={tight ? "" : undefined}
      ref={navRef}
    >
      {/* Fixed above the list, so the logo never scrolls out of the window (R2-9). */}
      <div className="cp-sidebar__top">
        <Brand collapsed={collapsed} />
      </div>

      {/* Under the logo: opens the search dialog, which App mounts (K8). */}
      <SearchButton collapsed={collapsed} onOpen={openSearch} />
      {/* Search is not a page: a rule sets it apart from them (C229). */}
      <div className="cp-sidebar__divider" aria-hidden="true" />

      {/* The destinations alone scroll; the pinned group stays at the foot. */}
      <div className="cp-sidebar__list" role="group" aria-label="Pages" ref={listRef}>
        {scrolling.map((entry) => renderGroup(entry))}
      </div>
      {/* Settings with the collapse toggle under it; both stay fixed at the foot (R2-9). */}
      {pinned ? (
        renderGroup(pinned)
      ) : (
        <div className="cp-sidebar__group cp-sidebar__group--pinned">
          <div className="cp-sidebar__foot">
            {toggleButton}
          </div>
        </div>
      )}
    </nav>
  );
}
