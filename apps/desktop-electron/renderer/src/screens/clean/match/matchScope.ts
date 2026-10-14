/**
 * What a run is, to the engine (C14).
 *
 * A run is a rule, `match_run`, whose value is the root job id; the engine follows the resumes
 * that finished it. It is how Past searches saves a run's list and matches a run again, and
 * nothing here is a second query path (DEC-041).
 */
import type { BatchSelection, FilterRule } from "../../../api/cuepointBridge.types";

/** The rule that scopes a list to one run and the resumes that finished it. */
export function matchRunRule(runId: string): FilterRule {
  return { field: "match_run", operator: "is", value: runId };
}

/** The selection that is every track of a run: what Match again searches. */
export function runSelection(runId: string): BatchSelection {
  return { query: { filters: { match: "all", rules: [matchRunRule(runId)] } } };
}
