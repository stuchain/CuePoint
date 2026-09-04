/**
 * A table's column layout, remembered (LIBUI-06, DEC-042).
 *
 * Owns the ordered layout, keeps it reconciled against the columns that exist
 * and the scale in force, and writes every change to `localStorage`. The table
 * itself stays stateless about all of it: it is handed the columns to render
 * and the widths to render them at, and reports what the user did.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { useScale } from "../../tokens/ScaleContext";
import {
  defaultLayout,
  loadColumnLayout,
  moveColumn,
  nudgeColumn,
  reconcileLayout,
  saveColumnLayout,
  toggleHidden,
  visibleColumns,
  widthsOf,
  withWidths,
  type ColumnLayout,
} from "./columnLayout";
import type { ColumnWidths, TrackColumnDef } from "./trackTableLayout";

export interface ColumnLayoutController<Row> {
  /** Every column, in the user's order, with what is hidden and how wide. */
  layout: ColumnLayout;
  /** What the table should render, in order. */
  visible: TrackColumnDef<Row>[];
  /** Widths keyed by id, as the table takes them. */
  widths: ColumnWidths;
  setWidths: (widths: ColumnWidths) => void;
  toggle: (id: string) => void;
  move: (id: string, toIndex: number) => void;
  nudge: (id: string, delta: -1 | 1) => void;
  reset: () => void;
}

export function useColumnLayout<Row>(
  storageKey: string,
  columns: readonly TrackColumnDef<Row>[],
): ColumnLayoutController<Row> {
  const { scale } = useScale();
  const [layout, setLayout] = useState<ColumnLayout>(() =>
    loadColumnLayout(storageKey, columns, scale),
  );

  // The columns can change (a later release adds one) and so can the scale
  // (which re-floors every minimum width). Reconciling on either keeps a
  // stored layout usable rather than letting it describe a table that no
  // longer exists.
  useEffect(() => {
    setLayout((previous) => reconcileLayout(previous, columns, scale));
  }, [columns, scale]);

  useEffect(() => {
    saveColumnLayout(storageKey, layout);
  }, [storageKey, layout]);

  const setWidths = useCallback((widths: ColumnWidths) => {
    setLayout((previous) => withWidths(previous, widths));
  }, []);

  const toggle = useCallback((id: string) => {
    setLayout((previous) => toggleHidden(previous, id));
  }, []);

  const move = useCallback(
    (id: string, toIndex: number) => {
      setLayout((previous) => moveColumn(columns, previous, id, toIndex));
    },
    [columns],
  );

  const nudge = useCallback(
    (id: string, delta: -1 | 1) => {
      setLayout((previous) => nudgeColumn(columns, previous, id, delta));
    },
    [columns],
  );

  const reset = useCallback(() => {
    setLayout(defaultLayout(columns, scale));
  }, [columns, scale]);

  const visible = useMemo(() => visibleColumns(columns, layout), [columns, layout]);
  const widths = useMemo(() => widthsOf(layout), [layout]);

  return { layout, visible, widths, setWidths, toggle, move, nudge, reset };
}
