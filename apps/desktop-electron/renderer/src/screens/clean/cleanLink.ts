/**
 * Opening one track on the Clean page from somewhere else (CLEAN-13, DEC-072).
 *
 * The Inspector's Beatport zone links to the track's review. The track travels
 * in the router's location state, as a Health count's rules do on the way to
 * the Library (`libraryLink.ts`), and is checked here before it is used: a
 * location can be pushed by any code in the renderer.
 */
import { CLEAN_SECTIONS, type CleanSection } from "./cleanSections";

const STATE_KEY = "cuepointCleanTrack";
const SECTION_KEY = "cuepointCleanSection";

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

/**
 * Opening the Clean page on one of its parts (EXPORT-07).
 *
 * The Rekordbox export's missing-file count links to Missing files (DEC-088),
 * so the count it states can be acted on rather than only read. Carried in the
 * location's state like a track, and checked the same way.
 */
export function cleanSectionState(section: CleanSection): Record<string, string> {
  return { [SECTION_KEY]: section };
}

/** The part a location carries, or null when it carries none that is a part. */
export function sectionFromLocationState(state: unknown): CleanSection | null {
  if (!state || typeof state !== "object") return null;
  const carried = (state as Record<string, unknown>)[SECTION_KEY];
  return CLEAN_SECTIONS.find((entry) => entry.id === carried)?.id ?? null;
}

/** The part to open on, and the navigation that asked, so asking twice opens twice. */
export interface CleanSectionOpening {
  section: CleanSection;
  token: string;
}

export function cleanSectionOpening(location: {
  state: unknown;
  key: string;
}): CleanSectionOpening | null {
  const section = sectionFromLocationState(location.state);
  return section === null ? null : { section, token: location.key };
}
