/**
 * The one place a navigation destination is declared.
 *
 * Routes, the last-visited fallback rule, and (from SHELL-02) the sidebar all
 * read this list, so adding or enabling a destination is a one-line change
 * rather than an edit in three files that can drift apart.
 *
 * Per DEC-020 the whole target information architecture is declared here, and
 * a destination that has not been built yet carries `enabled: false`. Nothing
 * renders it and nothing routes to it until the phase that builds it flips one
 * flag — which is the property this file exists to buy, so enabling a page is
 * never a hunt through the sidebar, the router and the fallback rule.
 *
 * Today's screens keep their identity as the Tools group (DEC-021). Phase 7
 * re-homes inKey into Clean and Phase 9 re-homes inCrate into Discover; until
 * then they stay exactly where users expect them.
 *
 * This is data, deliberately. It holds no elements and no callbacks: `App.tsx`
 * maps an id to the element to render, because that is where the props and
 * dialog callbacks those screens need already live.
 */
import type { PixelIconName } from "../pixelIcons";

/**
 * Groups are rendered in this order, and the sidebar draws a divider between
 * them. `workspace` is unlabelled — it is the app itself, not a category.
 */
export const NAV_GROUPS = ["workspace", "tools", "system"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export const NAV_GROUP_LABELS: Record<NavGroup, string | null> = {
  workspace: null,
  tools: "Tools",
  system: null,
};

interface NavDestinationBase {
  /** Stable across path changes; this is what gets persisted. */
  id: string;
  label: string;
  path: string;
  group: NavGroup;
  /** False for a destination declared but not yet built. */
  enabled: boolean;
}

/**
 * Exactly one of `icon` and `glyph`, mirroring `ToolbarIcon`'s union so the
 * sidebar can hand either straight through. DEC-010 drew only the highest
 * -visibility icons; `clean`, `discover` and `prepare` stay Unicode glyphs
 * until SHELL-09 draws them against this rail.
 */
export type NavDestination = NavDestinationBase &
  ({ icon: PixelIconName; glyph?: never } | { glyph: string; icon?: never });

/** Where the app falls back to when a stored destination cannot be honored. */
export const HOME_DESTINATION_ID = "tools";

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  // Not built yet (DEC-020). Each is enabled by the phase that builds it.
  { id: "library", label: "Library", path: "/library", group: "workspace", icon: "library", enabled: false },
  { id: "collections", label: "Collections", path: "/collections", group: "workspace", icon: "collections", enabled: false },
  { id: "clean", label: "Clean", path: "/clean", group: "workspace", icon: "clean", enabled: false },
  { id: "discover", label: "Discover", path: "/discover", group: "workspace", icon: "discover", enabled: false },
  { id: "prepare", label: "Prepare", path: "/prepare", group: "workspace", icon: "prepare", enabled: false },

  // Today's screens, kept intact as Tools (DEC-021).
  { id: "tools", label: "Tools", path: "/", group: "tools", icon: "home", enabled: true },
  { id: "match", label: "inKey", path: "/match", group: "tools", icon: "match", enabled: true },
  { id: "incrate", label: "inCrate", path: "/incrate", group: "tools", icon: "incrate", enabled: true },
  { id: "results", label: "Results", path: "/results", group: "tools", icon: "filter", enabled: true },

  { id: "settings", label: "Settings", path: "/settings", group: "system", icon: "settings", enabled: true },
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

export interface NavGroupEntry {
  group: NavGroup;
  label: string | null;
  destinations: NavDestination[];
}

/**
 * Enabled destinations, in group order, with empty groups dropped.
 *
 * Dropping empty groups is what keeps the sidebar honest while the target IA
 * is mostly disabled: the `workspace` group renders nothing at all today
 * rather than an empty heading with a divider under it.
 */
export function groupedDestinations(
  destinations: readonly NavDestination[] = NAV_DESTINATIONS,
): NavGroupEntry[] {
  return NAV_GROUPS.map((group) => ({
    group,
    label: NAV_GROUP_LABELS[group],
    destinations: enabledDestinations(destinations).filter((d) => d.group === group),
  })).filter((entry) => entry.destinations.length > 0);
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
