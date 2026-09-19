import {
  findDestinationByPath,
  findDestinationById,
  homeDestination,
  pageDestination,
  replacementFor,
  type NavDestination,
} from "./navRegistry";

/**
 * DEC-027: the app reopens on the last-visited destination.
 *
 * The destination *id* is stored rather than its path, so a later phase can
 * move a page's URL without stranding everyone who was last on it.
 *
 * Reads follow the shape the first stored table layout established: never
 * trust what comes back, and fall back rather than throw. A stored value can be
 * missing (first run), name a destination that no longer exists (a page was
 * removed), or name one that is declared but not enabled (a downgrade, or a
 * phase flag turned off). All three land on home, because the alternative is
 * an empty content area — the exact failure this step exists to prevent.
 *
 * DEC-062 added a fourth: an id that is a way *into* a page rather than the
 * page. Both directions resolve through the registry's `pageId`, so a page
 * with two sidebar entries is still one remembered destination (ORG-13).
 *
 * DEC-071 added a fifth: an id whose page was retired into another. It opens
 * the page that does that work now, not home — someone who last used inKey
 * wants to be where matching happens.
 */
export const LAST_DESTINATION_STORAGE_KEY = "cuepoint-ui-shell-last-destination";

export function loadLastDestinationId(): string | null {
  try {
    return localStorage.getItem(LAST_DESTINATION_STORAGE_KEY);
  } catch {
    // Storage can throw outright when the platform disables site data.
    return null;
  }
}

export function saveLastDestinationId(id: string): void {
  try {
    localStorage.setItem(LAST_DESTINATION_STORAGE_KEY, id);
  } catch {
    // Losing the last-visited page is not worth breaking navigation over.
  }
}

/**
 * The destination to open on launch, given whatever is stored.
 *
 * A stored entry-point id resolves to the page it leads to rather than to
 * itself. Nothing written by this build can be one — `destinationToRemember`
 * stores the page — but a build that did, or a hand-edited value, would
 * otherwise reopen aimed at a tree the user was not looking at.
 */
export function resolveLaunchDestination(
  storedId: string | null,
  destinations?: readonly NavDestination[],
): NavDestination {
  const replacement = replacementFor(storedId, destinations);
  if (replacement) return pageDestination(replacement, destinations);
  const stored = findDestinationById(storedId, destinations);
  if (stored && stored.enabled) {
    const page = pageDestination(stored, destinations);
    if (page.enabled) return page;
  }
  return homeDestination(destinations);
}

/**
 * The destination to remember for a location, or null when the location is not
 * a known destination — an unmatched path is not worth reopening on.
 *
 * A path that is an entry point into another destination's page remembers the
 * page (DEC-062). Reopening on `/collections` would put the user back in the
 * Collections tree however they left the Library — which is a guess about
 * intent, made from a link they clicked once, possibly an hour of browsing ago.
 */
export function destinationToRemember(
  pathname: string,
  destinations?: readonly NavDestination[],
): NavDestination | null {
  const destination = findDestinationByPath(pathname, destinations);
  if (!destination || !destination.enabled) return null;
  const page = pageDestination(destination, destinations);
  return page.enabled ? page : null;
}
