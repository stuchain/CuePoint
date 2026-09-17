/**
 * Opening one track on the Clean page from somewhere else (CLEAN-13, DEC-072).
 *
 * The Inspector's Beatport zone links to the track's review. The track travels
 * in the router's location state, as a Health count's rules do on the way to
 * the Library (`libraryLink.ts`), and is checked here before it is used: a
 * location can be pushed by any code in the renderer.
 */
const STATE_KEY = "cuepointCleanTrack";

/** The location state that opens the Clean page on one track. */
export function cleanTrackState(trackId: number): Record<string, number> {
  return { [STATE_KEY]: trackId };
}

/** The track a location carries, or null when it carries none that is valid. */
export function trackFromLocationState(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;
  const carried = (state as Record<string, unknown>)[STATE_KEY];
  return typeof carried === "number" && Number.isInteger(carried) && carried > 0 ? carried : null;
}

/** The track to open, and the navigation that asked, so asking twice opens twice. */
export interface CleanOpening {
  trackId: number;
  token: string;
}

export function cleanOpening(location: { state: unknown; key: string }): CleanOpening | null {
  const trackId = trackFromLocationState(location.state);
  return trackId === null ? null : { trackId, token: location.key };
}
