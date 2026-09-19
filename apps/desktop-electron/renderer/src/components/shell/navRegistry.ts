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
 * retired inKey and Results into Clean (DEC-071), and Phase 9 re-homes inCrate
 * into Discover; until then it stays exactly where users expect it.
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
  /**
   * The destination whose page this one shows, when it is not its own page.
   *
   * DEC-062 put CuePoint's Collections in the Library page's left pane rather
   * than behind a second browser, and then kept the Collections entry in the
   * sidebar: it is a way *in*, aimed at the tree. Two sidebar entries, one
   * page — and DEC-027's launch memory has to resolve one of them, or the two
   * ids fight over which is "where I was" and the answer depends on which
   * link was clicked last.
   *
   * So the page has an owner, declared here. Everything that asks "which page
   * is this" goes through :func:`pageDestination`, and the one thing that
   * persists — the last-visited id — stores the owner. The entry point keeps
   * its own path and its own sidebar row; it just does not get remembered as
   * a second identity for a page that already has one.
   */
  pageId?: string;
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
  // Collections is enabled and points into Library's own page (DEC-062).
  // Clean is enabled by CLEAN-12 (DEC-072).
  { id: "library", label: "Library", path: "/library", group: "workspace", icon: "library", enabled: true },
  { id: "collections", label: "Collections", path: "/collections", group: "workspace", icon: "collections", enabled: true, pageId: "library" },
  { id: "clean", label: "Clean", path: "/clean", group: "workspace", icon: "clean", enabled: true },
  { id: "discover", label: "Discover", path: "/discover", group: "workspace", icon: "discover", enabled: false },
  { id: "prepare", label: "Prepare", path: "/prepare", group: "workspace", icon: "prepare", enabled: false },

  // Today's screens, kept intact as Tools (DEC-021). inKey and Results retired
  // into Clean (DEC-071); see `RETIRED_DESTINATIONS`.
  { id: "tools", label: "Tools", path: "/", group: "tools", icon: "home", enabled: true },
  { id: "incrate", label: "inCrate", path: "/incrate", group: "tools", icon: "incrate", enabled: true },

  { id: "settings", label: "Settings", path: "/settings", group: "system", icon: "settings", enabled: true },
];

/**
 * A destination that no longer exists, and the one that replaced it.
 *
 * DEC-027 remembers the last page by id, and people keep links. Removing a
 * page outright would send both to home, which says nothing about where the
 * work went. A retired entry keeps its id and path so the launch memory and
 * the router can each send them to the page that does that work now.
 */
export interface RetiredDestination {
  id: string;
  path: string;
  /** The id of the destination that does this page's work now. */
  replacedBy: string;
}

/** inKey and Results became Clean in Phase 7 (DEC-071). */
export const RETIRED_DESTINATIONS: readonly RetiredDestination[] = [
  { id: "match", path: "/match", replacedBy: "clean" },
  { id: "results", path: "/results", replacedBy: "clean" },
];

/**
 * The page a retired id now leads to, or null for an id that was never
 * retired or whose replacement is not an enabled page.
 */
export function replacementFor(
  id: string | null | undefined,
  destinations: readonly NavDestination[] = NAV_DESTINATIONS,
  retired: readonly RetiredDestination[] = RETIRED_DESTINATIONS,
): NavDestination | null {
  const entry = retired.find((candidate) => candidate.id === id);
  if (!entry) return null;
  const replacement = findDestinationById(entry.replacedBy, destinations);
  return replacement?.enabled ? replacement : null;
}

/** Each retired path and the path it redirects to, for the router. */
export function retiredRedirects(
  destinations: readonly NavDestination[] = NAV_DESTINATIONS,
  retired: readonly RetiredDestination[] = RETIRED_DESTINATIONS,
): Array<{ id: string; from: string; to: string }> {
  return retired.flatMap((entry) => {
    const replacement = replacementFor(entry.id, destinations, retired);
    return replacement ? [{ id: entry.id, from: entry.path, to: replacement.path }] : [];
  });
}

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
/**
 * The destination that owns the page this one renders — itself, usually.
 *
 * An entry point declaring a `pageId` that names nothing resolves to itself
 * rather than throwing: a sidebar row that leads somewhere is better than a
 * shell that will not mount, and the registry test catches the typo instead.
 */
export function pageDestination(
  destination: NavDestination,
  destinations: readonly NavDestination[] = NAV_DESTINATIONS,
): NavDestination {
  if (!destination.pageId) return destination;
  return findDestinationById(destination.pageId, destinations) ?? destination;
}

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
