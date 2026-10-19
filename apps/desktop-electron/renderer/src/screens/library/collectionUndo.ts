/**
 * Putting removed tracks back where they were (SB2).
 *
 * The engine only appends to a Collection, so an Undo that just adds the tracks again would
 * change the order a person built by hand. The positions are read before the removal; Undo adds
 * the tracks in the order they used to sit and then moves each one to its old place, lowest
 * first, so every move lands on a position nothing below it will shift.
 */
import type { CollectionEntryPage } from "../../api/cuepointBridge.types";

type ReadEntries = (params: {
  collectionId: number;
  limit?: number;
  offset?: number;
}) => Promise<CollectionEntryPage>;

type MoveEntry = (params: { entry_id: number; position: number }) => Promise<unknown>;

/** How many entries one read asks for. */
const PAGE = 200;

/** A Collection this long is not scanned for positions: the Undo then appends. */
const SCAN_LIMIT = 20_000;

/** Where each of these tracks sits in the Collection now (its first entry), by track id. */
export async function readPositions(
  read: ReadEntries | undefined,
  collectionId: number,
  trackIds: readonly number[],
): Promise<Map<number, number> | null> {
  if (!read || trackIds.length === 0) return null;
  const wanted = new Set(trackIds);
  const found = new Map<number, number>();
  try {
    for (let offset = 0; offset < SCAN_LIMIT && found.size < wanted.size; offset += PAGE) {
      const page = await read({ collectionId, offset, limit: PAGE });
      page.entries.forEach((entry, at) => {
        if (wanted.has(entry.track_id) && !found.has(entry.track_id)) {
          found.set(entry.track_id, offset + at);
        }
      });
      if (offset + PAGE >= page.entry_count) break;
    }
  } catch {
    return null;
  }
  return found;
}

/** The ids in the order they used to sit; any without a known place keep their order, last. */
export function inOldOrder(
  trackIds: readonly number[],
  positions: ReadonlyMap<number, number> | null,
): number[] {
  if (!positions) return [...trackIds];
  const known = trackIds.filter((id) => positions.has(id));
  known.sort((a, b) => positions.get(a)! - positions.get(b)!);
  return [...known, ...trackIds.filter((id) => !positions.has(id))];
}

export type Restored = "ordered" | "appended" | "failed";

/**
 * Add the tracks again and move them to where they were.
 *
 * "failed" means nothing was put back; "appended" means the tracks are back but at the end,
 * because their old places were not known or a move was refused.
 */
export async function restoreTracks(params: {
  collectionId: number;
  trackIds: readonly number[];
  positions: ReadonlyMap<number, number> | null;
  add: (collectionId: number, trackIds: number[]) => Promise<{ ok: boolean }>;
  read: ReadEntries | undefined;
  move: MoveEntry | undefined;
}): Promise<Restored> {
  const { collectionId, positions, add, read, move } = params;
  const ordered = inOldOrder(params.trackIds, positions);
  if (!(await add(collectionId, ordered)).ok) return "failed";
  const placed = ordered.filter((id) => positions?.has(id));
  if (!positions || placed.length === 0) return "appended";
  if (!read || !move) return "appended";
  try {
    const length = (await read({ collectionId, offset: 0, limit: 1 })).entry_count;
    const tail = await read({
      collectionId,
      offset: Math.max(0, length - ordered.length),
      limit: ordered.length,
    });
    const free = [...tail.entries];
    for (const id of placed) {
      const at = free.findIndex((entry) => entry.track_id === id);
      if (at < 0) return "appended";
      const [entry] = free.splice(at, 1);
      await move({ entry_id: entry!.id, position: positions.get(id)! });
    }
    return "ordered";
  } catch {
    return "appended";
  }
}
