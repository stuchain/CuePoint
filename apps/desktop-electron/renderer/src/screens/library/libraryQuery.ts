/**
 * What the Library page is currently asking for (LIBUI-05, DEC-040).
 *
 * One value describing the whole view: the playlist scope, the text query, the
 * filters and the ordering. The table, the filter bar and the playlist pane
 * all read it, and every request the page makes is derived from it — which is
 * what keeps a facet, a count and a page of rows describing the same library
 * rather than three slightly different ones.
 *
 * It is also how a stale response is recognized. The engine echoes back what
 * it was asked (LIBUI-03), so a response can be compared against the query
 * that is current *now* rather than against a counter the renderer has to
 * remember to increment.
 */
import type {
  FilterRuleSet,
  LibrarySearchResponse,
} from "../../api/cuepointBridge.types";

export type SortDirection = "asc" | "desc";

export interface LibraryQuery {
  /** Free text. Blank means the whole scope, not nothing (browse mode). */
  q: string;
  /** A playlist or folder id, or null for the whole library. */
  playlistId: number | null;
  /** An engine sort name, from `getLibraryFilterFields().sortable`. */
  sort: string;
  dir: SortDirection;
  /** DEC-043's rule set, or null while nothing is filtered. */
  filters: FilterRuleSet | null;
}

export const DEFAULT_LIBRARY_QUERY: LibraryQuery = {
  q: "",
  playlistId: null,
  sort: "artist",
  dir: "asc",
  filters: null,
};

/** An empty rule set and no rule set are the same question. */
function rulesOf(filters: FilterRuleSet | null | undefined): string {
  if (!filters || filters.rules.length === 0) return "";
  return JSON.stringify(filters);
}

/**
 * A stable string identifying a query.
 *
 * Used as a React key and as the identity of a window: when it changes, every
 * loaded row belongs to a different question and is thrown away.
 */
export function queryKey(query: LibraryQuery): string {
  return JSON.stringify([
    query.q.trim(),
    query.playlistId,
    query.sort,
    query.dir,
    rulesOf(query.filters),
  ]);
}

export function sameQuery(a: LibraryQuery, b: LibraryQuery): boolean {
  return queryKey(a) === queryKey(b);
}

/**
 * Whether a response answers the query being asked now.
 *
 * Compared against what the engine echoed, not against a request counter: the
 * response says which scope, ordering, text and filters it was computed for,
 * and a response that answers a different question is a response to a question
 * nobody is asking any more.
 *
 * A response from an engine that has not learned to echo (an older build, or a
 * fixture written before LIBUI-03) is treated as current rather than dropped:
 * dropping everything would leave a table that never fills, which is a worse
 * failure than briefly showing rows from the previous sort.
 */
export function answersQuery(
  response: LibrarySearchResponse,
  query: LibraryQuery,
): boolean {
  if (response.mode === undefined) return true;
  if (response.mode !== "browse") return false;
  if ((response.query ?? "") !== query.q.trim()) return false;
  if ((response.scope ?? null) !== query.playlistId) return false;
  if ((response.sort ?? query.sort) !== query.sort) return false;
  if ((response.dir ?? query.dir) !== query.dir) return false;
  if (response.filters !== undefined) {
    return rulesOf(response.filters) === rulesOf(query.filters);
  }
  return true;
}

/** The request parameters for one window of a query. */
export function browseParams(query: LibraryQuery, offset: number, limit: number) {
  return {
    q: query.q.trim() || undefined,
    playlistId: query.playlistId,
    sort: query.sort,
    dir: query.dir,
    filters: query.filters,
    limit,
    offset,
  };
}
