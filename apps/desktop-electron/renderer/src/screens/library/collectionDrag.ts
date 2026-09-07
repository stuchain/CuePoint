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
  return has(transfer, TRACK_IDS_MIME) || has(transfer, COLLECTION_NODE_MIME);
}
