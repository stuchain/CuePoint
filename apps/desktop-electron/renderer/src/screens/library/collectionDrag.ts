/**
 * What a drag carries between the table and the tree (ORG-09, ORG-11).
 *
 * Two payloads and one module, so the drop target ORG-09 builds and the drag
 * source ORG-11 builds cannot disagree about the format. A mime type rather
 * than `text/plain`: a drag of track ids that any text field would accept is a
 * drag that drops a JSON array into a search box.
 *
 * The ids also go out as `text/plain` — some platforms will not start a drag
 * without it, and it is what a drop outside the app pastes as. That copy is a
 * courtesy; nothing here reads it.
 */

/** Tracks being dragged out of the table (ORG-11's source). */
export const TRACK_IDS_MIME = "application/x-cuepoint-track-ids";

/** A node being dragged inside the Collections tree (ORG-09's own). */
export const COLLECTION_NODE_MIME = "application/x-cuepoint-collection-node";

/**
 * A drag of "everything matching the current query" (ORG-11, DEC-045).
 *
 * Its payload is deliberately nothing. A described selection is 47,913 tracks
 * and the whole point of DEC-045 is that those numbers never travel; the drop
 * target and the drag source are the same page, so what it needs is the
 * *knowledge* that the selection is the query, and it reads the query itself.
 */
export const SELECTION_QUERY_MIME = "application/x-cuepoint-selection-query";

/** What a drag of table rows is carrying. */
export type DraggedTracks = { ids: number[] } | { query: true };

interface DragLike {
  types?: readonly string[] | DOMStringList;
  getData(format: string): string;
  setData(format: string, data: string): void;
}

function has(transfer: DragLike, mime: string): boolean {
  const types = transfer.types;
  if (!types) return false;
  return Array.from(types as ArrayLike<string>).includes(mime);
}

/** Put a set of track ids on a drag. */
export function setDraggedTrackIds(
  transfer: DragLike,
  trackIds: readonly number[],
): void {
  transfer.setData(TRACK_IDS_MIME, JSON.stringify(trackIds));
  transfer.setData("text/plain", trackIds.join(", "));
}

/**
 * The track ids a drag carries, or an empty list.
 *
 * Reads nothing but its own mime type, so a file dropped from the desktop or a
 * selection dragged out of a text field is not mistaken for a selection of
 * tracks.
 */
export function draggedTrackIds(transfer: DragLike | null): number[] {
  if (!transfer || !has(transfer, TRACK_IDS_MIME)) return [];
  try {
    const parsed: unknown = JSON.parse(transfer.getData(TRACK_IDS_MIME) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is number => typeof id === "number");
  } catch {
    return [];
  }
}

/** Mark a drag as carrying the whole current selection, which is a query. */
export function setDraggedQuerySelection(transfer: DragLike, count: number): void {
  transfer.setData(SELECTION_QUERY_MIME, String(count));
  transfer.setData("text/plain", `${count} tracks`);
}

/**
 * What a drag of table rows carries, or null when it carries neither.
 *
 * One reader for both payloads, so a drop target cannot handle the list and
 * forget the query — which at 47,913 tracks is the difference between adding
 * a library to a Collection and adding nothing at all.
 */
export function draggedTracks(transfer: DragLike | null): DraggedTracks | null {
  if (!transfer) return null;
  if (has(transfer, SELECTION_QUERY_MIME)) return { query: true };
  const ids = draggedTrackIds(transfer);
  return ids.length > 0 ? { ids } : null;
}

/** Put a Collection node on a drag. */
export function setDraggedNodeId(transfer: DragLike, nodeId: number): void {
  transfer.setData(COLLECTION_NODE_MIME, String(nodeId));
}

/** The node a drag carries, or null. */
export function draggedNodeId(transfer: DragLike | null): number | null {
  if (!transfer || !has(transfer, COLLECTION_NODE_MIME)) return null;
  const raw = transfer.getData(COLLECTION_NODE_MIME);
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) ? id : null;
}

/** True when a drag is carrying anything this app put on it. */
export function isCuePointDrag(transfer: DragLike | null): boolean {
  if (!transfer) return false;
  return (
    has(transfer, TRACK_IDS_MIME) ||
    has(transfer, SELECTION_QUERY_MIME) ||
    has(transfer, COLLECTION_NODE_MIME)
  );
}

/** True when a drag is carrying tracks of either kind. */
export function isTrackDrag(transfer: DragLike | null): boolean {
  if (!transfer) return false;
  return has(transfer, TRACK_IDS_MIME) || has(transfer, SELECTION_QUERY_MIME);
}
