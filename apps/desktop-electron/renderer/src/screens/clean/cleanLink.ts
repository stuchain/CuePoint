/**
 * Opening one track on the Clean page from somewhere else (CLEAN-13, DEC-072).
 *
 * The Inspector's Beatport zone links to the track's review. The track travels
 * in the router's location state, as a Health count's rules do on the way to
 * the Library (`libraryLink.ts`), and is checked here before it is used: a
 * location can be pushed by any code in the renderer.
 */
import { ruleSetFrom } from "../library/libraryLink";
import { isIds, type CleanTracks, type SelectionQuery } from "./cleanTracks";
import { CLEAN_SECTIONS, type CleanSection } from "./cleanSections";

const STATE_KEY = "cuepointCleanTrack";
const SECTION_KEY = "cuepointCleanSection";

/** The location state that opens the Clean page on one track. */
export function cleanTrackState(trackId: number): Record<string, number> {
  return { [STATE_KEY]: trackId };
}

/** The track a location carries, or null when it carries none that is valid. */
function trackFromLocationState(state: unknown): number | null {
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
function sectionFromLocationState(state: unknown): CleanSection | null {
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

// ---------------------------------------------------------------- tracks

const FIX_KEY = "cuepointCleanFix";
const MATCH_KEY = "cuepointCleanMatch";

/** What Fix values can be asked to start with: edit, copy Beatport's, or save into files. */
export type FixAction = "edit" | "beatport" | "save";

const FIX_ACTIONS: readonly FixAction[] = ["edit", "beatport", "save"];

function asTracks(tracks: readonly number[] | CleanTracks): CleanTracks {
  return Array.isArray(tracks) ? { ids: [...(tracks as readonly number[])] } : (tracks as CleanTracks);
}

function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** A described selection read from untrusted data; keys it does not know are dropped. */
function selectionQueryFrom(value: unknown): SelectionQuery | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const given = value as Record<string, unknown>;
  const query: SelectionQuery = {};
  if ("q" in given && given.q !== undefined) {
    if (typeof given.q !== "string") return null;
    query.q = given.q;
  }
  for (const key of ["playlist_id", "collection_id"] as const) {
    if (!(key in given) || given[key] === undefined) continue;
    if (given[key] !== null && !isId(given[key])) return null;
    query[key] = given[key] as number | null;
  }
  if ("scope" in given && given.scope !== undefined) {
    if (given.scope !== "collection" && given.scope !== "smart") return null;
    query.scope = given.scope;
  }
  if ("filters" in given && given.filters !== undefined) {
    if (given.filters === null) {
      query.filters = null;
    } else {
      const rules = ruleSetFrom(given.filters);
      if (!rules) return null;
      query.filters = rules;
    }
  }
  return query;
}

/** Tracks read from untrusted data, or null when they are not well formed. */
function tracksFrom(value: unknown): CleanTracks | null {
  if (!value || typeof value !== "object") return null;
  const given = value as Record<string, unknown>;
  if (Array.isArray(given.ids)) {
    if (given.ids.length === 0 || !given.ids.every(isId)) return null;
    return { ids: [...new Set(given.ids as number[])] };
  }
  if ("query" in given) {
    const query = selectionQueryFrom(given.query);
    return query && isCount(given.count) ? { query, count: given.count } : null;
  }
  return null;
}

/**
 * The location state that opens Clean's Fix values with these tracks chosen
 * (FLW-12): the Library's Beatport ▸ and Fix ▸, Track details and Health. An
 * action starts that dialog at once.
 */
export function cleanFixState(
  tracks: readonly number[] | CleanTracks,
  action?: FixAction,
): Record<string, unknown> {
  return { [FIX_KEY]: { tracks: asTracks(tracks), action: action ?? null } };
}

/** What Fix values is asked to open with, and the navigation that asked. */
export interface CleanFixOpening {
  tracks: CleanTracks;
  action: FixAction | null;
  token: string;
}

export function cleanFixOpening(location: { state: unknown; key: string }): CleanFixOpening | null {
  const state = location.state;
  if (!state || typeof state !== "object") return null;
  const carried = (state as Record<string, unknown>)[FIX_KEY];
  if (!carried || typeof carried !== "object") return null;
  const { tracks: given, action } = carried as Record<string, unknown>;
  const tracks = tracksFrom(given);
  if (!tracks) return null;
  if (action !== null && action !== undefined && !FIX_ACTIONS.includes(action as FixAction)) {
    return null;
  }
  return { tracks, action: (action as FixAction | null | undefined) ?? null, token: location.key };
}

/**
 * The location state that opens Clean's match window (FLW-13), for the Library,
 * the Keys page, Health, the first-run guide and Prepare. With no tracks it opens
 * on the tracks not looked up yet.
 */
export function cleanMatchState(tracks?: readonly number[] | CleanTracks): Record<string, unknown> {
  const given = tracks === undefined ? null : asTracks(tracks);
  const empty = given !== null && isIds(given) && given.ids.length === 0;
  return { [MATCH_KEY]: { tracks: empty ? null : given } };
}

/** What the match window is asked to open with, and the navigation that asked. */
export interface CleanMatchOpening {
  tracks: CleanTracks | null;
  token: string;
}

export function cleanMatchOpening(location: {
  state: unknown;
  key: string;
}): CleanMatchOpening | null {
  const state = location.state;
  if (!state || typeof state !== "object") return null;
  const carried = (state as Record<string, unknown>)[MATCH_KEY];
  if (!carried || typeof carried !== "object") return null;
  // Tracks that cannot be read are left out: the window then opens on the
  // tracks not looked up yet, which is safe, rather than not opening at all.
  return { tracks: tracksFrom((carried as Record<string, unknown>).tracks), token: location.key };
}
