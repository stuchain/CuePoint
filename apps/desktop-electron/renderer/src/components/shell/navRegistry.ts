/**
 * The one place a navigation destination is declared.
 *
 * Routes, the last-visited fallback rule, and (from SHELL-02) the sidebar all
 * read this list, so adding or enabling a destination is a one-line change
 * rather than an edit in three files that can drift apart.
 *
 * SHELL-03 declares only the destinations that exist today. SHELL-02 owns the
 * rest of DEC-020: declaring the target information architecture (Library,
 * Collections, Prepare, Discover, Clean) with `enabled: false` until each
 * phase lands, and adding the grouping and icon fields the sidebar needs.
 * `enabled` exists already because DEC-027's fallback has to answer "is this
 * stored destination still reachable?", and a rule with no way to be false
 * cannot be tested.
 *
 * This is data, deliberately. It holds no elements and no callbacks: `App.tsx`
 * maps an id to the element to render, because that is where the props and
 * dialog callbacks those screens need already live.
 */

export interface NavDestination {
  /** Stable across path changes; this is what gets persisted. */
  id: string;
  label: string;
  path: string;
  /** False for a destination declared but not yet built. */
  enabled: boolean;
}

/** Where the app falls back to when a stored destination cannot be honored. */
export const HOME_DESTINATION_ID = "tools";

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  { id: "tools", label: "Tools", path: "/", enabled: true },
  { id: "match", label: "inKey", path: "/match", enabled: true },
  { id: "incrate", label: "inCrate", path: "/incrate", enabled: true },
  { id: "results", label: "Results", path: "/results", enabled: true },
  { id: "settings", label: "Settings", path: "/settings", enabled: true },
];

/**
 * Every lookup takes the destination list as an optional argument.
 *
 * It defaults to the real registry, so callers read normally, but it means the
 * rules can be tested against a list containing a disabled destination without
 * mocking a module — and today's registry has nothing disabled to test with.
 * SHELL-02 gets the same seam when it adds the not-yet-built destinations.
 */
export function enabledDestinations(
  destinations: readonly NavDestination[] = NAV_DESTINATIONS,
): NavDestination[] {
  return destinations.filter((destination) => destination.enabled);
}

export function findDestinationById(
  id: string | null | undefined,
  destinations: readonly NavDestination[] = NAV_DESTINATIONS,
): NavDestination | null {
  if (!id) return null;
  return destinations.find((destination) => destination.id === id) ?? null;
}

/**
 * Exact-path lookup. Query strings are not part of a destination's identity —
 * `/results?filter=needs_review` is still Results — so callers pass a pathname.
 */
export function findDestinationByPath(
  pathname: string,
  destinations: readonly NavDestination[] = NAV_DESTINATIONS,
): NavDestination | null {
  return destinations.find((destination) => destination.path === pathname) ?? null;
}

export function homeDestination(
  destinations: readonly NavDestination[] = NAV_DESTINATIONS,
): NavDestination {
  const home = findDestinationById(HOME_DESTINATION_ID, destinations);
  if (!home) {
    // Unreachable with the real registry, but a shell that cannot find its home
    // destination would render nothing at all, which is the failure DEC-027's
    // fallback exists to prevent. Fail loudly instead.
    throw new Error(`Home destination "${HOME_DESTINATION_ID}" is not declared`);
  }
  return home;
}
