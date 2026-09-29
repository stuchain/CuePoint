/**
 * Where the Prepare page is, and which Set it reopens on (PREP-10, DEC-027).
 *
 * `/prepare` is the destination and `/prepare/:setId` one Set on it, a page of
 * the destination as Discover's Artist pages are of Discover (DEC-094): the
 * sidebar keeps Prepare lit on it, and the app's launch memory stores
 * `prepare`, never a Set.
 *
 * Which Set is a memory of its own, kept here: DEC-027's rule, one level down.
 * `/prepare` with no Set named opens the Set last open, when it still exists,
 * and the first Set in the tree otherwise. The id is stored rather than the
 * name, so a renamed Set is still the one reopened.
 */
import type { CollectionTreeNode } from "../library/collectionTree";
import { flattenCollections, isSet } from "../library/collectionTree";

export const PREPARE_PATH = "/prepare";
export const PREPARE_SET_ROUTE = "/prepare/:setId";
export const LAST_SET_STORAGE_KEY = "cuepoint-prepare-last-set";

/** The address of one Set on the Prepare page. */
export function preparePath(setId: number): string {
  return `${PREPARE_PATH}/${setId}`;
}

/** The Set an address names: a whole positive number, or null. */
export function setIdFromRoute(param: string | undefined): number | null {
  if (param === undefined || !/^[1-9]\d*$/.test(param)) return null;
  const id = Number(param);
  return Number.isSafeInteger(id) ? id : null;
}

export function loadLastSetId(): number | null {
  try {
    return setIdFromRoute(localStorage.getItem(LAST_SET_STORAGE_KEY) ?? undefined);
  } catch {
    // Storage can throw outright when the platform disables site data.
    return null;
  }
}

export function saveLastSetId(setId: number): void {
  try {
    localStorage.setItem(LAST_SET_STORAGE_KEY, String(setId));
  } catch {
    // Forgetting the last Set is not worth breaking the page over.
  }
}

export function forgetLastSetId(): void {
  try {
    localStorage.removeItem(LAST_SET_STORAGE_KEY);
  } catch {
    // As above.
  }
}

/**
 * The Set `/prepare` opens: the one last open if the tree still has it, else
 * the first Set in the tree's order, else none.
 */
export function setToOpen(
  tree: readonly CollectionTreeNode[],
  lastId: number | null,
): CollectionTreeNode | null {
  const sets = flattenCollections(tree).filter(isSet);
  return sets.find((node) => node.id === lastId) ?? sets[0] ?? null;
}
