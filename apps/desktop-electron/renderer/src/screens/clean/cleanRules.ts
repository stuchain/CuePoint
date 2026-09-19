/**
 * What each part of the Clean page asks the engine for (CLEAN-12, DEC-072).
 *
 * The review queue and Missing files are the Library's own browse with a rule
 * set, not a second query path (DEC-023, DEC-040). Changing what the queue
 * shows changes these rules and nothing else: the table, its window and its
 * selection are the Library's, and so is every answer. That is DEC-041's
 * convergence — the match results the retired Results screen held in memory
 * now come a window at a time like any other rows.
 *
 * The scope beside the rules — the whole library, a playlist, a Collection or a
 * Smart Collection — is `LibraryQuery`'s, so a review of one playlist is the
 * same question the Library would ask about it, narrowed by match state.
 */
import type {
  CollectionNode,
  FilterRuleSet,
  LibraryPlaylistNode,
} from "../../api/cuepointBridge.types";
import type { SelectOption } from "../../components/Select";
import { DEFAULT_LIBRARY_QUERY, type LibraryQuery, type SortDirection } from "../library/libraryQuery";

/** What the review queue can show. */
export type ReviewScope =
  | "needs_review"
  | "disputed"
  | "accepted"
  | "rejected"
  | "no_match"
  | "not_matched";

export interface ReviewScopeOption {
  id: ReviewScope;
  label: string;
}

/** In the order a reviewer works through them: what needs a person first. */
export const REVIEW_SCOPES: readonly ReviewScopeOption[] = [
  { id: "needs_review", label: "Needs review" },
  { id: "disputed", label: "Disputed" },
  { id: "accepted", label: "Accepted" },
  { id: "rejected", label: "Rejected" },
  { id: "no_match", label: "No match" },
  { id: "not_matched", label: "Not matched" },
];

export const DEFAULT_REVIEW_SCOPE: ReviewScope = "needs_review";

export function isReviewScope(value: string): value is ReviewScope {
  return REVIEW_SCOPES.some((scope) => scope.id === value);
}

/**
 * The rule set behind a review scope.
 *
 * "Disputed" is its own field rather than a state: a disputed track is still
 * accepted or rejected, by a person, and a newer match disagrees (DEC-067).
 * The same rule Health counts, so a count and this queue agree.
 */
export function reviewRules(scope: ReviewScope): FilterRuleSet {
  if (scope === "disputed") {
    return { match: "all", rules: [{ field: "match_disputed", operator: "is", value: true }] };
  }
  return { match: "all", rules: [{ field: "match_state", operator: "is", value: scope }] };
}

/** Missing or unreadable at the path each track has now (CLEAN-07). */
export const MISSING_FILES_RULES: FilterRuleSet = {
  match: "all",
  rules: [{ field: "file_status", operator: "any_of", value: ["missing", "unreadable"] }],
};

/** The whole library, as a scope value. */
export const WHOLE_LIBRARY = "library";

type Scoped = Pick<LibraryQuery, "playlistId" | "scope" | "collectionId">;

/**
 * Where a scope value points. `library`, `playlist:12`, `collection:4` and
 * `smart:5` — a string, because a `<select>` holds one, and a Rekordbox
 * playlist and a CuePoint Collection can share an id.
 */
export function parseScope(value: string): Scoped {
  const [kind, raw] = value.split(":");
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return { playlistId: null, scope: null, collectionId: null };
  }
  if (kind === "playlist") return { playlistId: id, scope: null, collectionId: null };
  if (kind === "collection") return { playlistId: null, scope: "collection", collectionId: id };
  if (kind === "smart") return { playlistId: null, scope: "smart", collectionId: id };
  return { playlistId: null, scope: null, collectionId: null };
}

/** One of the page's questions: a scope, a rule set and an order. */
export function cleanQuery(
  scopeValue: string,
  rules: FilterRuleSet,
  order: { sort: string; dir: SortDirection } = { sort: "artist", dir: "asc" },
): LibraryQuery {
  return {
    ...DEFAULT_LIBRARY_QUERY,
    ...parseScope(scopeValue),
    filters: rules,
    sort: order.sort,
    dir: order.dir,
  };
}

/** Nodes in tree order: each parent, then its children by position. */
function inTreeOrder<Node extends { id: number; parent_id: number | null; position: number }>(
  nodes: readonly Node[],
): Node[] {
  const children = new Map<number | null, Node[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parent_id) ?? [];
    siblings.push(node);
    children.set(node.parent_id, siblings);
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.position - b.position);
  const ordered: Node[] = [];
  const known = new Set(nodes.map((node) => node.id));
  const walk = (parent: number | null) => {
    for (const node of children.get(parent) ?? []) {
      ordered.push(node);
      walk(node.id);
    }
  };
  walk(null);
  // A node whose parent is not in the list is still somewhere to review.
  for (const node of nodes) {
    if (node.parent_id !== null && !known.has(node.parent_id)) {
      ordered.push(node);
      walk(node.id);
    }
  }
  return ordered;
}

const INDENT = "  ";

/**
 * Everything the queue can be scoped to, as options.
 *
 * A Rekordbox folder is a scope, as it is in the Library (DEC-044). A
 * Collection folder is drawn and cannot be chosen: it holds nodes, not tracks
 * and not a question (DEC-061).
 */
export function scopeOptions(
  playlists: readonly LibraryPlaylistNode[],
  collections: readonly CollectionNode[],
): SelectOption[] {
  const options: SelectOption[] = [{ value: WHOLE_LIBRARY, label: "The whole library" }];
  for (const node of inTreeOrder(playlists)) {
    options.push({
      value: `playlist:${node.id}`,
      label: `${INDENT.repeat(node.depth)}${node.name}`,
    });
  }
  const ordered = inTreeOrder(collections);
  if (ordered.length > 0) {
    options.push({ value: "collections", label: "CuePoint Collections", disabled: true });
  }
  for (const node of ordered) {
    const kind = node.kind === "smart" ? "smart" : node.kind === "collection" ? "collection" : null;
    options.push({
      value: kind ? `${kind}:${node.id}` : `folder:${node.id}`,
      label: `${INDENT.repeat(node.depth + 1)}${node.name}`,
      disabled: kind === null,
    });
  }
  return options;
}
