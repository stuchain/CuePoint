import { Fragment, useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import appIcon from "../../assets/cuepoint-icon.png";
import { Hint } from "../Hint";
import { PixelIcon } from "../PixelIcon";
import {
  EMPTY_LIBRARY_LINE,
  groupedDestinations,
  homeDestination,
  type NavDestination,
} from "./navRegistry";
import { Kbd } from "../Kbd";
import { emitShellCommand, useShellCommand } from "./shellCommands";
import { loadSidebarCollapsed, saveSidebarCollapsed } from "./sidebarState";
import { useLibraryEmpty } from "./useLibraryPresence";
import "./Sidebar.css";

/**
 * Primary navigation (DEC-020, DEC-021, DEC-022), laid out as option D of the sidebar redesign:
 * the logo and name alone on top; the Search field (K8, DEC-282); a small "Pages" heading over
 * the page entries, which alone scroll; and at the foot Settings with the collapse toggle beside
 * it (stacked under it in the collapsed rail). The top and bottom rows stay fixed (R2-9).
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
    <Hint text={collapsed ? `${destination.label}: ${hint}` : hint} portal placement="right">
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
 * magnifier, "Search…" and the shortcut muted at the right. It opens the search dialog, which
 * Ctrl+K opens too; nothing is typed here. Its accessible name stays "Search". The collapsed rail
 * shows the icon alone, named "Search library", and the tip says the key there.
 */
function SearchButton({ collapsed, onOpen }: { collapsed: boolean; onOpen: () => void }) {
  return (
    <Hint text="Search" shortcut="Mod+K" portal placement="right">
      <button
        type="button"
        className={`cp-sidebar__link cp-sidebar__search${collapsed ? "" : " cp-sidebar__search--box"}`}
        aria-label={collapsed ? "Search library" : "Search"}
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        <span className="cp-sidebar__icon" aria-hidden>
          <PixelIcon name="search" />
        </span>
        {!collapsed && (
          <>
            <span className="cp-sidebar__label cp-sidebar__search-placeholder">Search…</span>
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
  // The system group (Settings) is the one pinned at the foot, whatever else the registry holds;
  // it is never listed under "Pages", even when it is the only group.
  const pinned = groups.find((entry) => entry.group === "system");
  const scrolling = groups.filter((entry) => entry !== pinned);
  const headingId = useId();
  // The first dimmed entry, so the shared line sits just above the run of them (NAV-5, K7).
  const firstDimmed = libraryEmpty
    ? scrolling.flatMap((entry) => entry.destinations).find((d) => d.needsLibrary)?.id
    : undefined;

  const toggleButton = (
    <Hint text={`${collapsed ? "Expand" : "Collapse"} sidebar`} shortcut="Mod+B" portal placement="right">
      <button
        ref={toggleRef}
        type="button"
        className="cp-sidebar__toggle"
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

  const renderLink = (destination: NavDestination) => (
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
    // Only the last entry (Settings) shares its row with the toggle; any other stacks above (option D).
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
    >
      {/* Fixed above the list, so the logo never scrolls out of the window (R2-9). */}
      <div className="cp-sidebar__top">
        <Brand collapsed={collapsed} />
      </div>

      {/* Under the logo: opens the search dialog, which App mounts (K8). */}
      <SearchButton collapsed={collapsed} onOpen={openSearch} />

      {!collapsed && scrolling.length > 0 ? (
        <p className="cp-sidebar__pages-label" id={headingId}>Pages</p>
      ) : null}

      {/* The destinations alone scroll; the pinned group stays at the foot. */}
      <div
        className="cp-sidebar__list"
        role="group"
        aria-labelledby={!collapsed && scrolling.length > 0 ? headingId : undefined}
        aria-label={!collapsed && scrolling.length > 0 ? undefined : "Pages"}
      >
        {scrolling.map((entry) => renderGroup(entry))}
      </div>
      {/* Settings with the collapse toggle beside it; both stay fixed at the foot (R2-9). */}
      {pinned ? (
        renderGroup(pinned)
      ) : (
        <div className="cp-sidebar__group cp-sidebar__group--pinned">
          <div className="cp-sidebar__foot">{toggleButton}</div>
        </div>
      )}
    </nav>
  );
}
