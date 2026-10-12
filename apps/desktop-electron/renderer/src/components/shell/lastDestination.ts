import {
  findOwningDestination,
  findDestinationById,
  homeDestination,
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
 * DEC-071 added a fourth: an id whose page was retired into another. It opens
 * the page that does that work now, not home — someone who last used inKey
 * wants to be where matching happens. Collections is one of those now
 * (DEC-244): a stored `collections` id reopens the Library.
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

/** The destination to open on launch, given whatever is stored. */
export function resolveLaunchDestination(
  storedId: string | null,
  destinations?: readonly NavDestination[],
): NavDestination {
  const replacement = replacementFor(storedId, destinations);
  if (replacement) return replacement;
  const stored = findDestinationById(storedId, destinations);
  if (stored && stored.enabled) return stored;
  return homeDestination(destinations);
}

/**
 * The destination to remember for a location, or null when the location is not
 * a known destination — an unmatched path is not worth reopening on.
 */
export function destinationToRemember(
  pathname: string,
  destinations?: readonly NavDestination[],
): NavDestination | null {
  const destination = findOwningDestination(pathname, destinations);
  return destination?.enabled ? destination : null;
}
