import { Fragment, useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Hint } from "../Hint";
import { PixelIcon } from "../PixelIcon";
import {
  EMPTY_LIBRARY_LINE,
  groupedDestinations,
  homeDestination,
  type NavDestination,
} from "./navRegistry";
import { modifierName } from "./platformKeys";
import { emitShellCommand, useShellCommand } from "./shellCommands";
import { loadSidebarCollapsed, saveSidebarCollapsed } from "./sidebarState";
import { useLibraryEmpty } from "./useLibraryPresence";
import "./Sidebar.css";

/**
 * Primary navigation (DEC-020, DEC-021, DEC-022).
 *
 * Every entry comes from the registry, so a destination that has not been
 * built is not rendered — and enabling one later is a flag, not a change here.
 *
 * `NavLink` is used rather than `Link` because it sets `aria-current="page"`
 * on the active entry itself. In the collapsed rail that is the only thing
 * distinguishing the current page for a screen-reader user, since the labels
 * are gone.
 *
 * Each entry is one line, the label (K7). What it is for (NAV-1) is its tooltip, with the
 * label in front of it when the rail is collapsed. Before the first import the pages that
 * have nothing to show are dimmed, still clickable, under one shared line saying why (NAV-5).
 */
function DestinationLink({ destination, collapsed, dimmed, reasonId }: {
  destination: NavDestination;
  collapsed: boolean;
  dimmed: boolean;
  /** The shared empty-library line a dimmed entry is described by (NAV-5), when it is shown. */
  reasonId?: string;
}) {
  const { hint } = destination;
  return (
    <Hint text={collapsed ? `${destination.label}: ${hint}` : hint} portal>
      <NavLink
        to={destination.path}
        className={({ isActive }) =>
          `cp-sidebar__link ${isActive ? "cp-sidebar__link--active" : ""} ${
            dimmed ? "cp-sidebar__link--dimmed" : ""
          }`
            .replace(/\s+/g, " ")
            .trim()
        }
        // The accessible name has to survive collapsing: with labels hidden the
        // link would otherwise announce as its glyph, or as nothing at all.
        aria-label={destination.label}
        aria-describedby={dimmed ? reasonId : undefined}
        data-dimmed={dimmed ? "true" : undefined}
      >
        <span className="cp-sidebar__icon" aria-hidden>
          {destination.icon ? (
            <PixelIcon name={destination.icon} />
          ) : (
            <span className="cp-sidebar__glyph">{destination.glyph}</span>
          )}
        </span>
        {!collapsed && <span className="cp-sidebar__label">{destination.label}</span>}
      </NavLink>
    </Hint>
  );
}

/** The brand (HDR-6): the pixel logo and the name, or the logo alone when the rail is closed. */
function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <Link
      to={homeDestination().path}
      className="cp-sidebar__brand"
      aria-label="CuePoint"
      title="CuePoint"
    >
      <span className="cp-sidebar__icon cp-sidebar__logo" aria-hidden>
        <PixelIcon name="logo" />
      </span>
      {!collapsed && <span className="cp-sidebar__brand-name">CuePoint</span>}
    </Link>
  );
}

/**
 * The Search button (K8, DEC-282): opens the search dialog, which Ctrl+K opens too. Expanded it
 * reads "Search"; the collapsed rail shows the icon alone, named "Search library". Either way the
 * tip says the key: the rail is too narrow for "Search" and the shortcut side by side.
 */
function SearchButton({ collapsed, onOpen }: { collapsed: boolean; onOpen: () => void }) {
  const keys = `${modifierName()}+K`;
  return (
    <Hint text={`Search (${keys})`} portal>
      <button
        type="button"
        className="cp-sidebar__link cp-sidebar__search"
        aria-label={collapsed ? "Search library" : undefined}
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        <span className="cp-sidebar__icon" aria-hidden>
          <PixelIcon name="search" />
        </span>
        {!collapsed && <span className="cp-sidebar__label">Search</span>}
      </button>
    </Hint>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(loadSidebarCollapsed);
  const openSearch = useCallback(() => emitShellCommand("open-search"), []);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    saveSidebarCollapsed(collapsed);
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((value) => !value), []);
  const libraryEmpty = useLibraryEmpty();

  // View → Sidebar in the menu.
  const toggleFromMenu = useCallback(() => {
    toggle();
    toggleRef.current?.focus();
  }, [toggle]);
  useShellCommand("toggle-sidebar", toggleFromMenu);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "b") {
        event.preventDefault();
        toggle();
        // Keyboard users need somewhere to be after the rail changes width;
        // the toggle is the one control that exists in both states.
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  const emptyLineId = useId();
  const groups = groupedDestinations();
  const pinned = groups.length > 1 ? groups[groups.length - 1] : undefined;
  const scrolling = pinned ? groups.slice(0, -1) : groups;
  // The first dimmed entry, so the shared line sits just above the run of them (NAV-5, K7).
  const firstDimmed = libraryEmpty
    ? scrolling.flatMap((entry) => entry.destinations).find((d) => d.needsLibrary)?.id
    : undefined;

  const renderGroup = (entry: (typeof groups)[number]) => (
    <div
      className={`cp-sidebar__group${entry === pinned ? " cp-sidebar__group--pinned" : ""}`}
      key={entry.group}
    >
      {entry.label && !collapsed ? (
        <p className="cp-sidebar__group-label">{entry.label}</p>
      ) : null}
      {entry.destinations.map((destination) => (
        <Fragment key={destination.id}>
          {destination.id === firstDimmed && !collapsed ? (
            <p className="cp-sidebar__empty-line" id={emptyLineId}>{EMPTY_LIBRARY_LINE}</p>
          ) : null}
          <DestinationLink
            destination={destination}
            collapsed={collapsed}
            dimmed={libraryEmpty && Boolean(destination.needsLibrary)}
            reasonId={collapsed ? undefined : emptyLineId}
          />
        </Fragment>
      ))}
    </div>
  );

  return (
    <nav
      className={`cp-sidebar ${collapsed ? "cp-sidebar--collapsed" : ""}`.trim()}
      aria-label="Main navigation"
      data-collapsed={collapsed ? "true" : "false"}
    >
      {/* Fixed above the list, so the logo never scrolls out of the window (R2-9). */}
      <div className="cp-sidebar__top">
        <Brand collapsed={collapsed} />

        <button
          ref={toggleRef}
          type="button"
          className="cp-sidebar__toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "Expand" : "Collapse"} sidebar`}
          title={`${collapsed ? "Expand" : "Collapse"} sidebar (${modifierName()}+B)`}
        >
          <span aria-hidden className="cp-sidebar__icon">
            <PixelIcon name={collapsed ? "chevron-right" : "chevron-left"} />
          </span>
        </button>
      </div>

      {/* Between the top row and the list: opens the search dialog, which App mounts (K8). */}
      <SearchButton collapsed={collapsed} onOpen={openSearch} />

      {/* The destinations alone scroll; the pinned group stays at the foot. */}
      <div className="cp-sidebar__list">
        {scrolling.map((entry) => renderGroup(entry))}
      </div>
      {pinned ? renderGroup(pinned) : null}
    </nav>
  );
}
