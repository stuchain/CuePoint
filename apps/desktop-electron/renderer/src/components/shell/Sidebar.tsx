import { useCallback, useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { PixelIcon } from "../PixelIcon";
import { groupedDestinations, type NavDestination } from "./navRegistry";
import { loadSidebarCollapsed, saveSidebarCollapsed } from "./sidebarState";
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
 */
function DestinationLink({ destination, collapsed }: {
  destination: NavDestination;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={destination.path}
      className={({ isActive }) =>
        `cp-sidebar__link ${isActive ? "cp-sidebar__link--active" : ""}`.trim()
      }
      // The accessible name has to survive collapsing: with labels hidden the
      // link would otherwise announce as its glyph, or as nothing at all.
      aria-label={destination.label}
      title={collapsed ? destination.label : undefined}
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
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(loadSidebarCollapsed);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    saveSidebarCollapsed(collapsed);
  }, [collapsed]);

  const toggle = useCallback(() => setCollapsed((value) => !value), []);

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
      <button
        ref={toggleRef}
        type="button"
        className="cp-sidebar__toggle"
        onClick={toggle}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        title={collapsed ? "Expand navigation" : "Collapse navigation"}
      >
        <span aria-hidden>{collapsed ? "»" : "«"}</span>
      </button>

      {groupedDestinations().map((entry) => (
        <div className="cp-sidebar__group" key={entry.group}>
          {entry.label && !collapsed ? (
            <p className="cp-sidebar__group-label">{entry.label}</p>
          ) : null}
          {entry.destinations.map((destination) => (
            <DestinationLink
              key={destination.id}
              destination={destination}
              collapsed={collapsed}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}
