import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  destinationToRemember,
  loadLastDestinationId,
  resolveLaunchDestination,
  saveLastDestinationId,
} from "./lastDestination";

/**
 * Points the URL at the stored launch destination (DEC-027).
 *
 * **Must be called before the router mounts.** The obvious implementation —
 * mount, then `navigate()` to the stored destination from an effect — does not
 * work reliably: react-router subscribes to history in its own layout effect,
 * and a child's layout effect runs first, so a navigation issued there is
 * simply missed. The observed symptom is the worst kind: the URL becomes
 * `#/settings` while the content area still shows the home screen, so the app
 * looks broken in a way the address bar denies. A passive effect avoids the
 * race but paints home for a frame first, which is a visible flash on every
 * launch.
 *
 * Writing the URL before the router reads it avoids both. The stored id, not
 * the URL, is still the source of truth — nothing here depends on a URL
 * surviving a launch, which is what the packaged `file://` build cannot do.
 */
export function applyLaunchDestination(): void {
  const destination = resolveLaunchDestination(loadLastDestinationId());
  const target = `#${destination.path}`;
  if (window.location.hash === target) return;

  try {
    // `replaceState` rather than assigning `location.hash`, so launching does
    // not leave a history entry behind the restored page.
    const { pathname, search } = window.location;
    window.history.replaceState(null, "", `${pathname}${search}${target}`);
  } catch {
    // Some environments refuse replaceState on a file:// URL. Assigning the
    // hash always works; it just costs the extra history entry.
    window.location.hash = target;
  }
}

/**
 * Remembers the current destination so the next launch can reopen on it.
 *
 * Only known, enabled destinations are stored: reopening on a path that renders
 * the fallback would mean remembering a mistake.
 */
export function useRememberDestination(): void {
  const location = useLocation();

  useEffect(() => {
    const destination = destinationToRemember(location.pathname);
    if (destination) saveLastDestinationId(destination.id);
  }, [location.pathname]);
}
