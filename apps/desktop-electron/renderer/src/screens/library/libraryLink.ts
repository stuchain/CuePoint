/**
 * Opening the Library on a rule set from somewhere else (CLEAN-12, DEC-075).
 *
 * A Health count is a rule set and a number, and clicking it opens the Library
 * filtered by exactly those rules. The rules travel in the router's location
 * state rather than in the URL: a rule set is structured data, the hash router
 * already carries state, and a location state is not remembered as a
 * destination (DEC-027) — reopening the app lands on the Library, not on a
 * filter somebody clicked a week ago.
 *
 * The page is handed the rules as a prop by `App.tsx`, as `focus` is, so the
 * routing stays there and the page stays a component that is given what it
 * needs. State that came from anywhere is checked here before it becomes a
 * query: a location can be pushed by any code in the renderer.
 */
import type { FilterRule, FilterRuleSet } from "../../api/cuepointBridge.types";
import { ruleNameKey } from "./filterText";

const STATE_KEY = "cuepointLibraryRules";
const NAMES_KEY = "cuepointLibraryRuleNames";

/**
 * The location state that opens the Library on these rules.
 *
 * `names` says what the Beatport ids in them are called (DISCOVER-11), keyed
 * by `beatportNameKey`, so an Artist page's rule reads as the artist in the
 * filter bar. They are words for chips and nothing else: the rules are the
 * question either way.
 */
export function libraryRulesState(
  rules: FilterRuleSet,
  names?: Readonly<Record<string, string>>,
): Record<string, unknown> {
  return names && Object.keys(names).length > 0
    ? { [STATE_KEY]: rules, [NAMES_KEY]: { ...names } }
    : { [STATE_KEY]: rules };
}

/**
 * The location state that opens the Library on exactly these tracks, under one
 * chip that reads `label` (Similar tracks' Open in Library). The rule is the
 * engine's `track` list, which no Field list offers and no Smart Collection can
 * keep.
 */
export function libraryTracksState(
  trackIds: readonly number[],
  label: string,
): Record<string, unknown> {
  const rule: FilterRule = { field: "track", operator: "any_of", value: [...trackIds] };
  return libraryRulesState({ match: "all", rules: [rule] }, { [ruleNameKey(rule)]: label });
}

/** The names a location carries for its rules' ids; only text is kept. */
function ruleNamesFromLocationState(state: unknown): Record<string, string> | null {
  if (!state || typeof state !== "object") return null;
  const carried = (state as Record<string, unknown>)[NAMES_KEY];
  if (!carried || typeof carried !== "object" || Array.isArray(carried)) return null;
  const names: Record<string, string> = {};
  for (const [key, value] of Object.entries(carried)) {
    if (typeof value === "string" && value.trim() !== "") names[key] = value;
  }
  return Object.keys(names).length > 0 ? names : null;
}

function asRule(value: unknown): FilterRule | null {
  if (!value || typeof value !== "object") return null;
  const { field, operator, value: operand } = value as Record<string, unknown>;
  if (typeof field !== "string" || typeof operator !== "string") return null;
  return operand === undefined ? { field, operator } : { field, operator, value: operand };
}

/** A rule set read from untrusted data, or null when it is not a well-formed one. */
export function ruleSetFrom(carried: unknown): FilterRuleSet | null {
  if (!carried || typeof carried !== "object") return null;
  const { match, rules } = carried as Record<string, unknown>;
  if (match !== "all" || !Array.isArray(rules) || rules.length === 0) return null;
  const parsed = rules.map(asRule);
  if (parsed.some((rule) => rule === null)) return null;
  return { match: "all", rules: parsed as FilterRule[] };
}

/** The rules a location carries, or null when it carries none that are well formed. */
export function rulesFromLocationState(state: unknown): FilterRuleSet | null {
  if (!state || typeof state !== "object") return null;
  return ruleSetFrom((state as Record<string, unknown>)[STATE_KEY]);
}

/**
 * What the Library is asked to open with: the rules, and the navigation that
 * brought them, so the same count clicked twice opens twice.
 */
export interface LibraryOpening {
  rules: FilterRuleSet;
  token: string;
  /** What the rules' Beatport ids are called, when the opener knew. */
  names?: Record<string, string>;
}

const REFRESH_KEY = "cuepointLibraryRefresh";

/**
 * The location state that opens the Library and starts "Check for changes"
 * (PREP-10): the Rekordbox export's "Refresh first" from a page that has no
 * refresh of its own. DEC-082 makes that one click to the recommended path,
 * wherever the export was opened.
 */
export function libraryRefreshState(): Record<string, unknown> {
  return { [REFRESH_KEY]: true };
}

/** The navigation that asked for a refresh, as a token, or null when none did. */
export function refreshOpening(location: { state: unknown; key: string }): string | null {
  const state = location.state;
  if (!state || typeof state !== "object") return null;
  return (state as Record<string, unknown>)[REFRESH_KEY] === true ? location.key : null;
}

export function libraryOpening(location: { state: unknown; key: string }): LibraryOpening | null {
  const rules = rulesFromLocationState(location.state);
  if (!rules) return null;
  const names = ruleNamesFromLocationState(location.state);
  return names ? { rules, token: location.key, names } : { rules, token: location.key };
}

const TRACK_KEY = "cuepointLibraryTrack";

/**
 * The location state that opens the Library on one track, selected (HDR-1): a search
 * result chosen with Enter or a click. Like the rules, it travels in the router's state
 * and is not remembered as a destination.
 */
export function libraryTrackState(trackId: number): Record<string, unknown> {
  return { [TRACK_KEY]: trackId };
}

/** The track a location asks the Library to select, or null when it asks for none. */
export function trackFromLocationState(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;
  const carried = (state as Record<string, unknown>)[TRACK_KEY];
  return typeof carried === "number" && Number.isInteger(carried) && carried > 0 ? carried : null;
}

/** What the Library is asked to select, and the navigation that asked, so it is applied once. */
export interface TrackOpening {
  trackId: number;
  token: string;
}

export function trackOpening(location: { state: unknown; key: string }): TrackOpening | null {
  const trackId = trackFromLocationState(location.state);
  return trackId === null ? null : { trackId, token: location.key };
}

const IMPORT_KEY = "cuepointLibraryImport";

/**
 * The location state that opens the Library and starts the import's file choice: File →
 * "Import another file…" (FLW-20) does what the Library's own button does.
 */
export function libraryImportState(): Record<string, unknown> {
  return { [IMPORT_KEY]: true };
}

/** The navigation that asked for an import, as a token, or null when none did. */
export function importOpening(location: { state: unknown; key: string }): string | null {
  const state = location.state;
  if (!state || typeof state !== "object") return null;
  return (state as Record<string, unknown>)[IMPORT_KEY] === true ? location.key : null;
}
