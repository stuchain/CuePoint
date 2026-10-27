/**
 * A table's column layout, remembered (LIBUI-06, DEC-042).
 *
 * Owns the ordered layout, keeps it reconciled against the columns that exist
 * and the scale in force, and writes every change to `localStorage`. The table
 * itself stays stateless about all of it: it is handed the columns to render
 * and the widths to render them at, and reports what the user did.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useScale } from "../../tokens/ScaleContext";
import {
  clearColumnLayout,
  defaultLayout,
  loadColumnLayout,
  loadColumnSort,
  migrateBareLayout,
  moveColumn,
  nudgeColumn,
  reconcileLayout,
  rescaleLayout,
  saveColumnLayout,
  sortsOnClient,
  toggleHidden,
  visibleColumns,
  widthsOf,
  withWidths,
  type ColumnLayout,
  type ColumnSort,
} from "./columnLayout";
import type { ColumnWidths, TrackColumnDef } from "./trackTableLayout";

interface ColumnLayoutController<Row> {
  /** Every column, in the user's order, with what is hidden and how wide. */
  layout: ColumnLayout;
  /** What the table should render, in order. */
  visible: TrackColumnDef<Row>[];
  /** Widths keyed by id, as the table takes them. */
  widths: ColumnWidths;
  /**
   * The last sort the table made itself (a column with an `accessor` and no engine key), restored
   * on open; null when none. It is never an engine key.
   */
  sort: ColumnSort | null;
  /**
   * Remember the sort the person just chose. A client sort is stored with the layout; any other
   * (an engine key, or null) forgets the remembered one, so a key the engine does not know is
   * never stored.
   */
  setSort: (sort: ColumnSort | null) => void;
  setWidths: (widths: ColumnWidths) => void;
  toggle: (id: string) => void;
  move: (id: string, toIndex: number) => void;
  nudge: (id: string, delta: -1 | 1) => void;
  reset: () => void;
  /** Put back a layout, such as the one a reset replaced (the toast's Undo). */
  restore: (layout: ColumnLayout) => void;
}

export function useColumnLayout<Row>(
  storageKey: string,
  columns: readonly TrackColumnDef<Row>[],
  options?: { previousDefaultOrder?: readonly string[] },
): ColumnLayoutController<Row> {
  const { scale } = useScale();
  const [layout, setLayout] = useState<ColumnLayout>(() =>
    loadColumnLayout(storageKey, columns, scale, options?.previousDefaultOrder),
  );

  const [sort, setSortState] = useState<ColumnSort | null>(() => loadColumnSort(storageKey, columns));
  const sortRef = useRef(sort);
  const layoutRef = useRef(layout);
  const scaleRef = useRef(scale);

  // A layout saved bare (before widths were stored in 1x units) is rewritten once, as read (M86).
  useEffect(() => {
    migrateBareLayout(storageKey, layoutRef.current, scaleRef.current);
  }, [storageKey]);

  // The columns can change (a later release adds one) and so can the scale.
  // Widths are held at the scale in force, so a scale change rescales them by
  // the ratio; nothing is written, because the stored 1x widths are unchanged.
  useEffect(() => {
    const factor = scale / scaleRef.current;
    scaleRef.current = scale;
    const next = reconcileLayout(rescaleLayout(layoutRef.current, factor), columns, scale);
    layoutRef.current = next;
    setLayout(next);
  }, [columns, scale]);

  // A change the person made: held, then written. Loading never writes.
  const commit = useCallback(
    (change: (previous: ColumnLayout) => ColumnLayout) => {
      const next = change(layoutRef.current);
      if (next === layoutRef.current) return;
      layoutRef.current = next;
      setLayout(next);
      saveColumnLayout(storageKey, next, scaleRef.current, sortRef.current);
    },
    [storageKey],
  );

  const setWidths = useCallback(
    (widths: ColumnWidths) => commit((previous) => withWidths(previous, widths)),
    [commit],
  );
  const toggle = useCallback(
    (id: string) => commit((previous) => toggleHidden(previous, id)),
    [commit],
  );
  const move = useCallback(
    (id: string, toIndex: number) =>
      commit((previous) => moveColumn(columns, previous, id, toIndex)),
    [columns, commit],
  );
  const nudge = useCallback(
    (id: string, delta: -1 | 1) =>
      commit((previous) => nudgeColumn(columns, previous, id, delta)),
    [columns, commit],
  );
  const setSort = useCallback(
    (next: ColumnSort | null) => {
      const column = next ? columns.find((entry) => entry.id === next.key) : undefined;
      const kept = next && column && sortsOnClient(column) ? { key: next.key, direction: next.direction } : null;
      const was = sortRef.current;
      if (kept?.key === was?.key && kept?.direction === was?.direction) return;
      sortRef.current = kept;
      setSortState(kept);
      saveColumnLayout(storageKey, layoutRef.current, scaleRef.current, kept);
    },
    [columns, storageKey],
  );

  const reset = useCallback(() => {
    const next = defaultLayout(columns, scaleRef.current);
    layoutRef.current = next;
    setLayout(next);
    sortRef.current = null;
    setSortState(null);
    clearColumnLayout(storageKey);
  }, [columns, storageKey]);

  const restore = useCallback(
    (next: ColumnLayout) => {
      layoutRef.current = next;
      setLayout(next);
      saveColumnLayout(storageKey, next, scaleRef.current, sortRef.current);
    },
    [storageKey],
  );

  const visible = useMemo(() => visibleColumns(columns, layout), [columns, layout]);
  const widths = useMemo(() => widthsOf(layout), [layout]);

  return { layout, visible, widths, sort, setSort, setWidths, toggle, move, nudge, reset, restore };
}
