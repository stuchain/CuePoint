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

/** The names a location carries for its rules' ids; only text is kept. */
export function ruleNamesFromLocationState(state: unknown): Record<string, string> | null {
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

/** The rules a location carries, or null when it carries none that are well formed. */
export function rulesFromLocationState(state: unknown): FilterRuleSet | null {
  if (!state || typeof state !== "object") return null;
  const carried = (state as Record<string, unknown>)[STATE_KEY];
  if (!carried || typeof carried !== "object") return null;
  const { match, rules } = carried as Record<string, unknown>;
  if (match !== "all" || !Array.isArray(rules) || rules.length === 0) return null;
  const parsed = rules.map(asRule);
  if (parsed.some((rule) => rule === null)) return null;
  return { match: "all", rules: parsed as FilterRule[] };
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

export function libraryOpening(location: { state: unknown; key: string }): LibraryOpening | null {
  const rules = rulesFromLocationState(location.state);
  if (!rules) return null;
  const names = ruleNamesFromLocationState(location.state);
  return names ? { rules, token: location.key, names } : { rules, token: location.key };
}
