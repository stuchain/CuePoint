/**
 * Where the scope lives, as the line above the Library's title (R7-4).
 *
 * "Library" on All tracks, "Playlists › Gigs 2026 › Summer" for a playlist nested in two folders,
 * "Collections › Gigs › October" for a nested Collection. The line is always there, so the title
 * under it never moves. Pure: the page hands in the flat nodes the left pane already holds.
 */

/** The three things a tree node must tell for its path to be read. */
export interface PathNode {
  id: number;
  parent_id: number | null;
  name: string;
}

export const LIBRARY_ROOT = "Library";
export const PATH_SEPARATOR = " › ";

/** The folders above a node, outermost first; the node itself is the title, so it is not in it. */
export function ancestorNames(nodes: readonly PathNode[], id: number): string[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const names: string[] = [];
  const seen = new Set<number>([id]);
  let parent = byId.get(id)?.parent_id ?? null;
  // A loop in the data must not hang the page.
  while (parent != null && !seen.has(parent)) {
    const node = byId.get(parent);
    if (!node) break;
    seen.add(parent);
    names.unshift(node.name);
    parent = node.parent_id;
  }
  return names;
}

/**
 * The line above the title. `root` is the pane's name ("Playlists" or "Collections"), or null for
 * All tracks, which is "Library".
 */
export function scopePath(
  root: "Playlists" | "Collections" | null,
  nodes: readonly PathNode[],
  id: number | null,
): string {
  if (root === null) return LIBRARY_ROOT;
  return [root, ...(id == null ? [] : ancestorNames(nodes, id))].join(PATH_SEPARATOR);
}
