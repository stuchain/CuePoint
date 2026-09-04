/**
 * The mirrored Rekordbox tree, as the pane needs it (LIBUI-07, DEC-044).
 *
 * The engine sends a flat list, parents before children (LIBUI-03). This
 * builds the tree, decides what is visible given what is expanded, and
 * remembers where the user was.
 *
 * **Remembered by path, not by id.** A refresh replaces the whole mirror —
 * `replace_tree` deletes every row and re-inserts it (LIBRARY-03) — so every
 * playlist gets a new database id whenever a collection is re-imported.
 * Storing an id would lose the user's place on every refresh, or worse, land
 * them in whichever playlist inherited the number. A Rekordbox path survives
 * an import unchanged.
 *
 * Paths are not guaranteed unique (a playlist name may contain the separator,
 * which four playlists in a real export do), so resolving one takes the first
 * match in tree order — deterministic, and the same rule
 * `PlaylistRepository.find_by_path` uses.
 */
import type { LibraryPlaylistNode } from "../../api/cuepointBridge.types";

/** Where the pane's expansion and selection are kept. */
export const PLAYLIST_PANE_STORAGE_KEY = "cuepoint-library-playlist-pane";

/** The synthetic root: everything, scoped to nothing. */
export const ALL_TRACKS_ID = null;

export interface PlaylistTreeNode extends LibraryPlaylistNode {
  children: PlaylistTreeNode[];
}

export interface PaneState {
  /** Paths of the folders the user has opened. */
  expandedPaths: string[];
  /** Path of the selected node, or null for "All tracks". */
  selectedPath: string | null;
}

export const EMPTY_PANE_STATE: PaneState = { expandedPaths: [], selectedPath: null };

/** Build the tree from the flat, parents-first list the engine sends. */
export function buildTree(nodes: readonly LibraryPlaylistNode[]): PlaylistTreeNode[] {
  const byId = new Map<number, PlaylistTreeNode>();
  const roots: PlaylistTreeNode[] = [];

  for (const node of nodes) {
    byId.set(node.id, { ...node, children: [] });
  }
  for (const node of nodes) {
    const built = byId.get(node.id)!;
    const parent = node.parent_id == null ? undefined : byId.get(node.parent_id);
    // A node whose parent is missing is a root rather than a lost node: the
    // pane's job is to show the collection, not to audit it.
    if (parent) parent.children.push(built);
    else roots.push(built);
  }
  return roots;
}

/** Every node of the tree, depth first, in the order it is drawn. */
export function flatten(nodes: readonly PlaylistTreeNode[]): PlaylistTreeNode[] {
  const out: PlaylistTreeNode[] = [];
  const walk = (list: readonly PlaylistTreeNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

export interface VisibleRow {
  node: PlaylistTreeNode;
  /** Indentation level, counting from the roots. */
  depth: number;
  expanded: boolean;
  hasChildren: boolean;
}

/**
 * The rows to draw: roots, plus the descendants of everything expanded.
 *
 * A collapsed folder hides its subtree, which is the point of collapsing it.
 */
export function visibleRows(
  nodes: readonly PlaylistTreeNode[],
  expandedPaths: readonly string[],
): VisibleRow[] {
  const expanded = new Set(expandedPaths);
  const rows: VisibleRow[] = [];
  const walk = (list: readonly PlaylistTreeNode[], depth: number) => {
    for (const node of list) {
      const isExpanded = expanded.has(node.path);
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

/** The first node at a path, in tree order. Null when nothing is there. */
export function findByPath(
  nodes: readonly PlaylistTreeNode[],
  path: string | null,
): PlaylistTreeNode | null {
  if (path == null) return null;
  return flatten(nodes).find((node) => node.path === path) ?? null;
}

/** The paths of a node's ancestors, so selecting it can reveal it. */
export function ancestorPaths(
  nodes: readonly PlaylistTreeNode[],
  path: string,
): string[] {
  const trail: string[] = [];
  const walk = (list: readonly PlaylistTreeNode[], above: string[]): boolean => {
    for (const node of list) {
      if (node.path === path) {
        trail.push(...above);
        return true;
      }
      if (walk(node.children, [...above, node.path])) return true;
    }
    return false;
  };
  walk(nodes, []);
  return trail;
}

/**
 * The sort a scope opens on (DEC-044).
 *
 * Inside a playlist it is Rekordbox's own order — a set list is an order, not
 * an alphabetical accident. A folder interleaves several playlists' positions,
 * which means nothing, so it opens on the library's default; so does the whole
 * library, where a track has no position at all.
 */
export function defaultSortForScope(node: PlaylistTreeNode | null): string {
  return node?.kind === "playlist" ? "playlist_position" : "artist";
}

/** What that sort is called on screen. */
export function sortLabel(sort: string): string {
  return sort === "playlist_position" ? "As arranged in Rekordbox" : sort;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/** Read the pane's remembered state, whatever the storage contains. */
export function loadPaneState(storageKey: string): PaneState {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return EMPTY_PANE_STATE;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return EMPTY_PANE_STATE;
    const state = parsed as Partial<PaneState>;
    return {
      expandedPaths: isStringArray(state.expandedPaths) ? state.expandedPaths : [],
      selectedPath:
        typeof state.selectedPath === "string" ? state.selectedPath : null,
    };
  } catch {
    return EMPTY_PANE_STATE;
  }
}

export function savePaneState(storageKey: string, state: PaneState): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // Site data blocked, or a private window. The pane still works; it just
    // opens on All tracks next time.
  }
}

export interface ResolvedSelection {
  /** The node the stored path refers to, or null for "All tracks". */
  node: PlaylistTreeNode | null;
  /** True when a stored selection no longer exists in the collection. */
  fellBack: boolean;
}

/**
 * The stored selection, checked against the collection as it is now.
 *
 * A refresh can delete a playlist (DEC-003 deletes tracks; a playlist can
 * simply be gone from the export). Falling back to All tracks is the only
 * honest answer, and the caller says so once rather than leaving a user
 * looking at an empty table wondering what they broke — the same fallback
 * DEC-027 required of the launch destination.
 */
export function resolveSelection(
  nodes: readonly PlaylistTreeNode[],
  selectedPath: string | null,
): ResolvedSelection {
  if (selectedPath == null) return { node: null, fellBack: false };
  const node = findByPath(nodes, selectedPath);
  return { node, fellBack: node === null };
}

/** Expanded paths, with the ones that no longer exist dropped. */
export function pruneExpanded(
  nodes: readonly PlaylistTreeNode[],
  expandedPaths: readonly string[],
): string[] {
  const known = new Set(flatten(nodes).map((node) => node.path));
  return expandedPaths.filter((path) => known.has(path));
}
