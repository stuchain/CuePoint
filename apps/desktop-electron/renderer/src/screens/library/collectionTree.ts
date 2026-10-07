/**
 * CuePoint's own tree, as the pane needs it (ORG-09, DEC-059, DEC-062).
 *
 * The engine sends a flat list, parents before children (ORG-08). This builds
 * the tree, decides what is visible given what is open, and remembers where
 * the user was.
 *
 * **Remembered by id, not by path**, which is the opposite of the Rekordbox
 * tree beside it — and the difference is not a preference. A refresh replaces
 * the whole Rekordbox mirror, so every playlist gets a new id and only a path
 * survives; nothing replaces a Collection, so its id is the stable thing and a
 * *name* is what changes. Remembering a path here would lose the user's place
 * every time they renamed a folder.
 *
 * A node also carries what a plain playlist node does not: rules, a broken
 * state, and two counts that DEC-058 lets differ.
 */
import type {
  CollectionKind,
  CollectionNode,
  FilterRuleSet,
} from "../../api/cuepointBridge.types";

/** Where the Collections section's expansion and selection are kept. */
export const COLLECTIONS_PANE_STORAGE_KEY = "cuepoint-library-collections-pane";

export interface CollectionTreeNode extends CollectionNode {
  children: CollectionTreeNode[];
}

export interface CollectionsPaneState {
  /** Ids of the folders the user has opened. */
  expandedIds: number[];
  /** Id of the selected node, or null when the scope is not a Collection. */
  selectedId: number | null;
  /** Whether the whole section is folded away. */
  collapsed: boolean;
}

export const EMPTY_COLLECTIONS_STATE: CollectionsPaneState = {
  expandedIds: [],
  selectedId: null,
  collapsed: false,
};

/** Build the tree from the flat, parents-first list the engine sends. */
export function buildCollectionTree(
  nodes: readonly CollectionNode[],
): CollectionTreeNode[] {
  const byId = new Map<number, CollectionTreeNode>();
  const roots: CollectionTreeNode[] = [];

  for (const node of nodes) byId.set(node.id, { ...node, children: [] });
  for (const node of nodes) {
    const built = byId.get(node.id)!;
    const parent = node.parent_id == null ? undefined : byId.get(node.parent_id);
    // A node whose parent is missing is drawn as a root rather than dropped:
    // the pane shows the tree, it does not audit it.
    if (parent) parent.children.push(built);
    else roots.push(built);
  }
  return roots;
}

/** Every node of the tree, depth first, in the order it is drawn. */
export function flattenCollections(
  nodes: readonly CollectionTreeNode[],
): CollectionTreeNode[] {
  const out: CollectionTreeNode[] = [];
  const walk = (list: readonly CollectionTreeNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export interface CollectionRow {
  node: CollectionTreeNode;
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
}

/** The rows to draw: roots, plus the descendants of everything expanded. */
export function collectionRows(
  nodes: readonly CollectionTreeNode[],
  expandedIds: readonly number[],
): CollectionRow[] {
  const expanded = new Set(expandedIds);
  const rows: CollectionRow[] = [];
  const walk = (list: readonly CollectionTreeNode[], depth: number) => {
    for (const node of list) {
      const isExpanded = expanded.has(node.id);
      rows.push({
        node,
        depth,
        expanded: isExpanded,
        hasChildren: node.children.length > 0,
      });
      if (isExpanded) walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return rows;
}

/** The node with this id, or null. */
export function findCollection(
  nodes: readonly CollectionTreeNode[],
  id: number | null,
): CollectionTreeNode | null {
  if (id == null) return null;
  return flattenCollections(nodes).find((node) => node.id === id) ?? null;
}

/** The ids of a node's ancestors, so selecting it can reveal it. */
export function collectionAncestors(
  nodes: readonly CollectionTreeNode[],
  id: number,
): number[] {
  const trail: number[] = [];
  const walk = (list: readonly CollectionTreeNode[], above: number[]): boolean => {
    for (const node of list) {
      if (node.id === id) {
        trail.push(...above);
        return true;
      }
      if (walk(node.children, [...above, node.id])) return true;
    }
    return false;
  };
  walk(nodes, []);
  return trail;
}

/** Every id at or below a node, which is what a delete would take. */
export function subtreeIds(node: CollectionTreeNode): number[] {
  return flattenCollections([node]).map((child) => child.id);
}

/**
 * Whether a node may be dropped onto a target (ORG-04's rules, in the pane).
 *
 * The engine refuses all three of these and says why, and the pane asks the
 * same questions first — not to duplicate the rule but to avoid drawing a drop
 * target that can only fail. A refusal a user has to trigger to discover is a
 * worse answer than a cursor that never offers it.
 *
 * The rules themselves stay the engine's: this returns *false*, not a message,
 * and anything it lets through is still refused there if it is wrong.
 */
export function canMoveInto(
  moving: CollectionTreeNode,
  target: CollectionTreeNode | null,
): boolean {
  if (target === null) return moving.parent_id !== null;
  if (target.kind !== "folder") return false;
  // The subtree includes the node itself, so this covers "into itself" too. A
  // second check for that case would be a branch no test could tell from its
  // absence.
  return !subtreeIds(moving).includes(target.id);
}

/**
 * True when this node holds tracks rather than nodes or a question.
 *
 * A Collection or a Set (DEC-102, PREP-02's `holds_tracks`): both hold
 * entries, so both take a drop, scope the table, count what they hold and may
 * be named by a rule. Where the question is "is this a crate?" instead, ask
 * :func:`isCollection`; the two differ exactly by a Set (PREP-09's audit).
 */
export function holdsTracks(node: Pick<CollectionNode, "kind">): boolean {
  return node.kind === "collection" || node.kind === "set";
}

/** True for a plain Collection, a crate: what "Add to Collection" offers. */
export function isCollection(node: Pick<CollectionNode, "kind">): boolean {
  return node.kind === "collection";
}

/** True for a Set: a running order in chapters, arranged in Prepare (DEC-102). */
export function isSet(node: Pick<CollectionNode, "kind">): boolean {
  return node.kind === "set";
}

/**
 * The final position of a row moved from `from` to the insertion point
 * `insertAt` (ORG-11).
 *
 * `reorder_entry` takes the position the entry ends up at, while a drag names
 * a *gap*: dropping row 2 into the gap before row 7 leaves it at 6, because
 * taking it out first moved everything after it up one. Off by one here is a
 * track that lands next to where it was dropped, every time, in one direction
 * only — which is the kind of bug that gets called "the drag is broken".
 */
export function movedPosition(from: number, insertAt: number): number {
  return insertAt > from ? insertAt - 1 : insertAt;
}

/** What the table is showing, as far as rearranging it is concerned. */
interface ReorderView {
  scope: "collection" | "smart" | null;
  collectionId: number | null;
  sort: string;
  dir: "asc" | "desc";
  q: string;
  /** True when a rule set is narrowing the table. */
  filtered: boolean;
}

/**
 * Whether the rows on screen can be dragged into a new order, and why not.
 *
 * A drag says "put this one there", and "there" has to be a place in the
 * Collection rather than a place in a derived view. Sorted by BPM, or narrowed
 * by a search, a row's position on screen is not its position in the
 * Collection, and writing one as if it were the other silently scrambles the
 * order the user arranged.
 *
 * The duplicate case is the subtle one. DEC-058 lets a Collection hold a track
 * twice, and the browse query collapses those to one row at the earliest of
 * its positions — so with duplicates present, the row index and the entry
 * position stop being the same number, and the renderer has no way to learn
 * the difference without reading the whole membership.
 *
 * Every refusal is a sentence rather than a false, because a user dragging a
 * row inside a Collection has clearly said what they meant, and a drop that
 * does nothing teaches them the feature is broken.
 */
export function canReorder(
  view: ReorderView,
  node: CollectionNode | null,
): { ok: true } | { ok: false; why: string } {
  if (view.scope !== "collection" || view.collectionId == null || !node) {
    return { ok: false, why: "Open a Collection to put its tracks in order." };
  }
  if (isSet(node)) {
    // The Library lists each of a Set's tracks once (PREP-09, fact 3), so a
    // row here is not an entry: a reprise has no row of its own to move. The
    // running order is arranged where its entries are shown, one by one.
    return {
      ok: false,
      why: `“${node.name}” is a Set: its running order is arranged in Prepare, where each entry has its own row.`,
    };
  }
  if (view.sort !== "collection_position" || view.dir !== "asc") {
    return {
      ok: false,
      why: "Sort by the Collection's own order before rearranging it.",
    };
  }
  if (view.q.trim() !== "" || view.filtered) {
    return {
      ok: false,
      why: "Clear the search and the filters before rearranging the Collection.",
    };
  }
  if (node.entry_count !== node.track_count) {
    return {
      ok: false,
      why: `“${node.name}” holds a track more than once, so its rows cannot be dragged into a new order.`,
    };
  }
  return { ok: true };
}

/**
 * The icon a node is drawn with. A Set wears Prepare's flag (SHELL-09), the
 * page it is arranged on, so it never reads as a crate in the tree (fact 2).
 */
export function iconForKind(
  kind: CollectionKind,
): "folder" | "collections" | "smart" | "prepare" {
  if (kind === "folder") return "folder";
  if (kind === "smart") return "smart";
  if (kind === "set") return "prepare";
  return "collections";
}

/** What a node is called, as a word beside its name. */
export function kindLabel(kind: CollectionKind): string {
  switch (kind) {
    case "folder":
      return "folder";
    case "smart":
      return "Smart Collection";
    case "set":
      return "Set";
    default:
      return "Collection";
  }
}

/**
 * The tree an "Add to Set" picker offers: the Sets, and the folders on the
 * way to them (PREP-09).
 *
 * A folder stays, drawn and unchoosable, so the indentation still tells the
 * truth about where a Set is filed; a branch with no Set anywhere under it is
 * left out, because a picker for Sets full of Collections nobody can choose
 * hides the one row that matters. With no Set at all the answer is empty, so
 * the picker can say how to make one instead of drawing a wall of greyed rows.
 */
export function setPickerNodes(
  nodes: readonly CollectionTreeNode[],
): CollectionTreeNode[] {
  const out: CollectionTreeNode[] = [];
  const walk = (list: readonly CollectionTreeNode[]): void => {
    for (const node of list) {
      if (isSet(node)) {
        out.push(node);
      } else if (
        node.kind === "folder" &&
        flattenCollections(node.children).some((child) => isSet(child))
      ) {
        out.push(node);
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return out;
}

/**
 * The sort a Collection scope opens on (ORG-09).
 *
 * Inside a Collection it is the order the user arranged — a Collection is a
 * list somebody made, and opening it alphabetically would throw that away.
 * A Smart Collection opens on the sort it was saved with, so it looks like it
 * did when it was saved; when it was saved without one, the library's default
 * answers. A folder is not a scope at all.
 */
export function defaultSortForCollection(node: CollectionNode): {
  sort: string;
  dir: "asc" | "desc";
} {
  if (node.kind === "smart") {
    return { sort: node.sort ?? "artist", dir: node.dir ?? "asc" };
  }
  return { sort: "collection_position", dir: "asc" };
}

/** What that sort is called on screen. */
export function collectionSortLabel(sort: string): string {
  return sort === "collection_position" ? "In the order you arranged" : sort;
}

/** The rules a Smart Collection holds, for the filter bar to load (ORG-12). */
export function rulesOf(node: CollectionNode): FilterRuleSet | null {
  return node.kind === "smart" ? (node.rules ?? null) : null;
}

function isNumberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}

/** Read the section's remembered state, whatever the storage contains. */
export function loadCollectionsState(storageKey: string): CollectionsPaneState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return EMPTY_COLLECTIONS_STATE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY_COLLECTIONS_STATE;
    const state = parsed as Partial<CollectionsPaneState>;
    return {
      expandedIds: isNumberArray(state.expandedIds) ? state.expandedIds : [],
      selectedId: typeof state.selectedId === "number" ? state.selectedId : null,
      collapsed: state.collapsed === true,
    };
  } catch {
    return EMPTY_COLLECTIONS_STATE;
  }
}

export function saveCollectionsState(
  storageKey: string,
  state: CollectionsPaneState,
): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Site data blocked, or a private window. The pane still works; it just
    // opens folded the way it started next time.
  }
}

/** Expanded ids, with the ones that no longer exist dropped. */
export function pruneCollectionIds(
  nodes: readonly CollectionTreeNode[],
  ids: readonly number[],
): number[] {
  const known = new Set(flattenCollections(nodes).map((node) => node.id));
  return ids.filter((id) => known.has(id));
}

/**
 * What a delete is about to take, as a sentence (ORG-09's confirmation).
 *
 * Names every kind it would remove and the entries with them, because "delete
 * this?" over a folder holding nine Collections is a question the user cannot
 * answer. Says nothing about tracks: deleting a Collection removes rows about
 * tracks and never a track, and the confirmation says that too.
 *
 * Sets are their own kind (PREP-02's `sets`), and what a Set holds beyond its
 * entries — chapters, planned times, notes — is named, because that is the
 * part of a deleted Set nothing can rebuild from the library.
 */
export function describeDeletion(summary: {
  folders: number;
  collections: number;
  smart_collections: number;
  /** Absent from an engine older than Sets, which reads as none. */
  sets?: number;
  entries: number;
  nodes: number;
}): string {
  const parts: string[] = [];
  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  const sets = summary.sets ?? 0;
  if (summary.folders) parts.push(plural(summary.folders, "folder", "folders"));
  if (summary.collections)
    parts.push(plural(summary.collections, "Collection", "Collections"));
  if (summary.smart_collections)
    parts.push(
      plural(summary.smart_collections, "Smart Collection", "Smart Collections"),
    );
  if (sets) parts.push(plural(sets, "Set", "Sets"));
  if (parts.length === 0) return "This removes nothing.";

  const listed =
    parts.length === 1
      ? parts[0]!
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]!}`;
  const entries = summary.entries
    ? `, with ${plural(summary.entries, "track entry", "track entries")} filed in them`
    : "";
  const plan = sets
    ? ` ${sets === 1 ? "The Set's" : "Each Set's"} chapters, planned times and notes go with it.`
    : "";
  return `This removes ${listed}${entries}.${plan} No tracks are deleted.`;
}
