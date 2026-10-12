/**
 * What the Match area's shared list asks the engine for (C14).
 *
 * One at a time and the Table are two views of one list, so the list is one
 * question: the Library's own browse, narrowed by **Show** (where a track
 * stands with Beatport) and **From** (all searches, or one run). A run is a
 * rule, `match_run`, whose value is the root job id; the engine follows the
 * resumes that finished it. Nothing here is a second query path (DEC-041).
 */
import type { BatchSelection, FilterRule, FilterRuleSet, MatchRun } from "../../../api/cuepointBridge.types";
import type { LibraryQuery, SortDirection } from "../../library/libraryQuery";
import { REVIEW_SCOPES, WHOLE_LIBRARY, cleanQuery, reviewRules, type ReviewScope } from "../cleanRules";
import { whenLabel } from "./pastSearchWords";

/** Show: what the list holds. "Everything in this search" needs a run to mean anything. */
export type MatchScope = ReviewScope | "everything";

export const EVERYTHING: MatchScope = "everything";
export const DEFAULT_MATCH_SCOPE: MatchScope = "needs_review";

/** "All searches" in From: no run chosen. */
export const ALL_SEARCHES = "";

export interface MatchScopeOption {
  id: MatchScope;
  label: string;
  /** What the state means, when its words alone do not say (CLN-4). */
  hint?: string;
}

const EVERYTHING_OPTION: MatchScopeOption = { id: EVERYTHING, label: "Everything in this search" };

/** The Show options: the review scopes, and everything in a run when one is chosen. */
export function matchScopeOptions(hasRun: boolean): readonly MatchScopeOption[] {
  return hasRun ? [...REVIEW_SCOPES, EVERYTHING_OPTION] : REVIEW_SCOPES;
}

export function isMatchScope(value: string, hasRun: boolean): value is MatchScope {
  return matchScopeOptions(hasRun).some((option) => option.id === value);
}

/** The rule that scopes the list to one run and the resumes that finished it. */
export function matchRunRule(runId: string): FilterRule {
  return { field: "match_run", operator: "is", value: runId };
}

/** Show and From as the one rule set the list is asked with. */
export function matchRules(scope: MatchScope, runId: string | null): FilterRuleSet {
  const base: FilterRule[] = scope === EVERYTHING ? [] : reviewRules(scope as ReviewScope).rules;
  return { match: "all", rules: runId ? [...base, matchRunRule(runId)] : base };
}

export function matchQuery(
  scope: MatchScope,
  runId: string | null,
  order: { sort: string; dir: SortDirection },
): LibraryQuery {
  return cleanQuery(WHOLE_LIBRARY, matchRules(scope, runId), order);
}

/** A run in From: when it was, and what was matched ("Today 13:42 · Playlist "all""). */
export function runOptionLabel(run: MatchRun, now: Date = new Date()): string {
  const what = run.label ?? `${run.planned.toLocaleString()} ${run.planned === 1 ? "track" : "tracks"}`;
  return `${whenLabel(run.created_at, now)} · ${what}`;
}

/** The selection that is every track of a run: what Match again searches. */
export function runSelection(runId: string): BatchSelection {
  return { query: { filters: { match: "all", rules: [matchRunRule(runId)] } } };
}
