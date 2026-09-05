import { useCallback, useEffect, useRef, useState } from "react";
import type { QueueItem } from "../../api/cuepointBridge.types";
import { selectQueueRevision } from "./playerFormat";
import { usePlayerValue } from "./playerStore";

/**
 * The slice of the queue a panel can actually see (PLAYER-08).
 *
 * The queue lives in main and may hold PLAYER-05's cap of 50,000 tracks. Those
 * are never pushed — at that size the snapshot is ~14.5 MB, and it would be
 * sent several times a second while a track plays — so the panel asks for the
 * rows it is showing and re-asks when the queue changes underneath it.
 *
 * `selectQueueRevision` is what "changes underneath it" means in practice: the
 * panel cannot diff contents it does not hold, so it watches the queue's
 * length, what is playing, and the ordering that produced it.
 */

export const QUEUE_WINDOW_SIZE = 100;
/** Rows kept either side of the visible range, so scrolling does not flicker. */
export const QUEUE_WINDOW_OVERSCAN = 20;

export interface QueueWindowState {
  items: QueueItem[];
  offset: number;
  total: number;
  loading: boolean;
  /** Ask for a different range; the panel calls this as it scrolls. */
  requestRange: (start: number, end: number) => void;
  /** Re-read the current range, after an edit that changed it. */
  refresh: () => void;
}

export function useQueueWindow(pageSize: number = QUEUE_WINDOW_SIZE): QueueWindowState {
  const revision = usePlayerValue(selectQueueRevision);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // The range last asked for, so a revision change re-reads the same place
  // rather than snapping the panel back to the top.
  const range = useRef({ start: 0, end: pageSize });
  const inFlight = useRef(0);

  const load = useCallback(async () => {
    const player = window.cuepoint?.player;
    if (!player?.queueWindow) {
      setItems([]);
      setTotal(0);
      return;
    }
    const start = Math.max(0, range.current.start - QUEUE_WINDOW_OVERSCAN);
    const limit = Math.max(
      pageSize,
      range.current.end - range.current.start + QUEUE_WINDOW_OVERSCAN * 2,
    );
    const ticket = ++inFlight.current;
    setLoading(true);
    try {
      const page = await player.queueWindow(start, limit);
      // A slower earlier request must not overwrite a newer answer.
      if (ticket !== inFlight.current) return;
      setItems(page.items);
      setOffset(page.offset);
      setTotal(page.total);
    } catch {
      if (ticket !== inFlight.current) return;
      setItems([]);
      setTotal(0);
    } finally {
      if (ticket === inFlight.current) setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    // Nothing has arrived from main yet: there is no queue to ask about, and a
    // request here would be answered before the panel knows what it is showing.
    if (revision === null) return;
    void load();
    // Re-read whenever the queue changed shape, at the range being shown.
  }, [load, revision]);

  const requestRange = useCallback(
    (start: number, end: number) => {
      const current = range.current;
      // Only re-ask when the visible range has left what is already held.
      if (start >= current.start && end <= current.end) return;
      range.current = { start, end };
      void load();
    },
    [load],
  );

  return { items, offset, total, loading, requestRange, refresh: load };
}
