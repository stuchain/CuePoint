/**
 * The Set table's narrow-width rule (C246).
 *
 * The table opens on seven columns. In a pane too narrow for them (Details open, a big text size)
 * the last would be cut mid-word, so Artist, the widest word column, is dropped first. Pure:
 * `PrepareScreen` measures the room and hides what this returns. Columns the person hid themselves
 * are not in `visible`, and a dropped one comes back when there is room again.
 */
import { useCallback, useEffect, useState, type MutableRefObject } from "react";

/** Dropped in this order while the columns do not fit. */
const DROP_ORDER = ["artist"] as const;

export function columnsToDrop(
  visible: readonly { id: string }[],
  widths: Readonly<Record<string, number>>,
  room: number,
): string[] {
  if (!(room > 0)) return [];
  let total = visible.reduce((sum, column) => sum + (widths[column.id] ?? 0), 0);
  const dropped: string[] = [];
  for (const id of DROP_ORDER) {
    if (total <= room) break;
    if (!visible.some((column) => column.id === id)) continue;
    total -= widths[id] ?? 0;
    dropped.push(id);
  }
  return dropped;
}

/**
 * The element's width in px, 0 until it is measured (and in a test document, where nothing has one).
 * Returns a callback ref to put on the element, which also fills `ref`: the element may mount after
 * the first render (the table waits for its Set).
 */
export function useMeasuredWidth(ref: MutableRefObject<HTMLDivElement | null>): [number, (node: HTMLDivElement | null) => void] {
  const [width, setWidth] = useState(0);
  const [element, setElement] = useState<HTMLElement | null>(null);
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node;
      setElement(node);
    },
    [ref],
  );
  useEffect(() => {
    if (!element) return undefined;
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [width, attach];
}
