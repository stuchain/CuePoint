/**
 * The tracks a Clean action is about (PAGES-07B, FLW-12, FLW-13).
 *
 * Fix values and the match window act on tracks from three places: a list of
 * ids an opener passed (the Library's Fix ▸), a described selection an opener
 * passed (a Health count's rules, with the count it showed), and a scope
 * picked on the page with the "In playlist" places. All three end as the one
 * thing the engine's batch routes take, a `BatchSelection` (DEC-045): ids go as
 * ids, and a described set goes as the question, never as 47,913 numbers.
 */
import type {
  BatchSelection,
  FilterRule,
  FilterRuleSet,
} from "../../api/cuepointBridge.types";
import { IN_PLAYLIST_FIELD } from "../library/savedScope";
import type { RuleSource } from "../library/filterText";
import { DEFAULT_LIBRARY_QUERY, type LibraryQuery } from "../library/libraryQuery";

/** The question half of a `BatchSelection`: where, what text, which rules. */
export type SelectionQuery = NonNullable<BatchSelection["query"]>;

/** Tracks to act on: a list of ids, or a described set with the count it had. */
export type CleanTracks = { ids: number[] } | { query: SelectionQuery; count: number };

export function isIds(tracks: CleanTracks): tracks is { ids: number[] } {
  return "ids" in tracks;
}

/** How many tracks these are. */
export function chosenCount(tracks: CleanTracks): number {
  return isIds(tracks) ? tracks.ids.length : tracks.count;
}

/** The engine's selection for these tracks. */
export function selectionOf(tracks: CleanTracks): BatchSelection {
  return isIds(tracks) ? { track_ids: [...tracks.ids] } : { query: tracks.query };
}

/** The "In playlist" rule for these places, or null for none. */
export function sourceRules(sources: readonly RuleSource[]): FilterRuleSet | null {
  if (sources.length === 0) return null;
  const rule: FilterRule = {
    field: IN_PLAYLIST_FIELD,
    operator: "any_of",
    value: sources.map((source) => ({ kind: source.kind, id: source.id })),
  };
  return { match: "all", rules: [rule] };
}

/** The described selection for the places picked: the whole library when none are. */
export function sourcesQuery(sources: readonly RuleSource[]): SelectionQuery {
  const filters = sourceRules(sources);
  return filters ? { filters } : {};
}

/**
 * The Library's question for a described selection, so it can be counted with
 * the browse route; `extra` narrows it (the tracks not looked up yet).
 */
export function libraryQueryOf(
  query: SelectionQuery,
  extra: readonly FilterRule[] = [],
): LibraryQuery {
  const rules = [...(query.filters?.rules ?? []), ...extra];
  return {
    ...DEFAULT_LIBRARY_QUERY,
    q: query.q ?? "",
    playlistId: query.playlist_id ?? null,
    scope: query.scope ?? null,
    collectionId: query.collection_id ?? null,
    filters: rules.length > 0 ? { match: "all", rules } : null,
  };
}

/** The rule for tracks nobody has looked up on Beatport yet (Health's own). */
export const NOT_LOOKED_UP_RULE: FilterRule = {
  field: "match_state",
  operator: "is",
  value: "not_matched",
};
