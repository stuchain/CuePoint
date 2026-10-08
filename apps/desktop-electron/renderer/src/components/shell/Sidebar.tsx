import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { PixelIcon } from "../PixelIcon";
import {
  EMPTY_LIBRARY_HINT,
  groupedDestinations,
  homeDestination,
  type NavDestination,
} from "./navRegistry";
import { modifierName } from "./platformKeys";
import { useShellCommand } from "./shellCommands";
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
 * Each entry says what it is for (NAV-1): the hint sits muted under the label when the
 * rail is open and is in the title in both states. Before the first import the pages
 * that have nothing to show are dimmed, still clickable, and say why (NAV-5).
 */
function DestinationLink({ destination, collapsed, dimmed }: {
  destination: NavDestination;
  collapsed: boolean;
  dimmed: boolean;
}) {
  const hint = dimmed ? EMPTY_LIBRARY_HINT : destination.hint;
  return (
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
      // Collapsed, the title also carries the label the rail has no room for.
      title={collapsed ? `${destination.label}: ${hint}` : hint}
      data-sub={destination.parentId ? "true" : undefined}
      data-dimmed={dimmed ? "true" : undefined}
    >
      <span className="cp-sidebar__icon" aria-hidden>
        {destination.icon ? (
          <PixelIcon name={destination.icon} />
        ) : (
          <span className="cp-sidebar__glyph">{destination.glyph}</span>
        )}
      </span>
      {!collapsed && (
        <span className="cp-sidebar__text">
          <span className="cp-sidebar__label">{destination.label}</span>
          <span className="cp-sidebar__hint">{hint}</span>
        </span>
      )}
    </NavLink>
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

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(loadSidebarCollapsed);
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

  return (
    <nav
      className={`cp-sidebar ${collapsed ? "cp-sidebar--collapsed" : ""}`.trim()}
      aria-label="Main navigation"
      data-collapsed={collapsed ? "true" : "false"}
    >
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

      {groupedDestinations().map((entry, at, all) => (
        <div
          className={`cp-sidebar__group${at === all.length - 1 && all.length > 1 ? " cp-sidebar__group--pinned" : ""}`}
          key={entry.group}
        >
          {entry.label && !collapsed ? (
            <p className="cp-sidebar__group-label">{entry.label}</p>
          ) : null}
          {entry.destinations.map((destination) => (
            <DestinationLink
              key={destination.id}
              destination={destination}
              collapsed={collapsed}
              dimmed={libraryEmpty && Boolean(destination.needsLibrary)}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}
