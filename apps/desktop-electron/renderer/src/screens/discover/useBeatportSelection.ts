/**
 * What is selected in a Beatport table (DISCOVER-10).
 *
 * By Beatport track id, never by row index, for the Library's reason
 * (DEC-045): an index means nothing once the window moves. A plain click
 * selects one row, Ctrl or Cmd adds or removes one, and Shift extends from
 * the last plain click over the rows between.
 *
 * **The selected rows are kept, not only their ids.** Every action on a
 * Beatport row needs the row — its page to open, whether it is bought — and a
 * row far up a long run may have left the window by the time the button is
 * pressed. So the rows are held with the selection, and refreshed from the
 * table whenever it has newer copies of them.
 *
 * There is no "select everything matching", unlike the Library's: a push of
 * everything a table shows is its own action, and nothing else here acts on
 * thousands of tracks at once.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { rangeBetween } from "../library/trackSelection";

export interface Picked<Row> {
  row: Row;
  index: number;
}

export interface BeatportSelection<Row> {
  /** Selected ids, for the table's highlight. */
  keys: ReadonlySet<number>;
  /** Selected rows, in the table's order. */
  rows: Row[];
  count: number;
  /** The row a Shift-click extends from, for the table's keyboard menu. */
  anchor: number | null;
  onRowClick: (row: Row, index: number, event: React.MouseEvent) => void;
  /** A right-click on a row outside the selection selects that row first. */
  onRowMenu: (row: Row, index: number) => void;
  clear: () => void;
}

interface State<Row> {
  picked: Map<number, Picked<Row>>;
  anchor: number | null;
}

const NOTHING = { picked: new Map(), anchor: null };

export function useBeatportSelection<Row>({
  key,
  idOf,
  getRow,
  loadedRows,
}: {
  /** The table's question: a new one clears the selection. */
  key: string;
  idOf: (row: Row) => number;
  getRow: (index: number) => Row | undefined;
  /** Every row the table holds now, to refresh the kept copies from. */
  loadedRows: () => Array<Picked<Row>>;
}): BeatportSelection<Row> {
  const [state, setState] = useState<State<Row>>(NOTHING);

  // A different question selects nothing: the rows it answers are others.
  useEffect(() => {
    setState(NOTHING);
  }, [key]);

  // Newer copies of selected rows replace the kept ones, so a track just added
  // to the wantlist reads as wanted in every action that asks.
  useEffect(() => {
    setState((previous) => {
      if (previous.picked.size === 0) return previous;
      let changed = false;
      const picked = new Map(previous.picked);
      for (const { row, index } of loadedRows()) {
        const id = idOf(row);
        const held = picked.get(id);
        if (held && (held.row !== row || held.index !== index)) {
          picked.set(id, { row, index });
          changed = true;
        }
      }
      return changed ? { ...previous, picked } : previous;
    });
  }, [idOf, loadedRows]);

  const onRowClick = useCallback(
    (row: Row, index: number, event: React.MouseEvent) => {
      const id = idOf(row);
      setState((previous) => {
        if (event.shiftKey && previous.anchor !== null) {
          const [from, to] = rangeBetween(previous.anchor, index);
          const picked = new Map(previous.picked);
          for (let at = from; at <= to; at += 1) {
            const inRange = getRow(at);
            if (inRange) picked.set(idOf(inRange), { row: inRange, index: at });
          }
          return { picked, anchor: previous.anchor };
        }
        if (event.ctrlKey || event.metaKey) {
          const picked = new Map(previous.picked);
          if (picked.has(id)) picked.delete(id);
          else picked.set(id, { row, index });
          return { picked, anchor: index };
        }
        return { picked: new Map([[id, { row, index }]]), anchor: index };
      });
    },
    [getRow, idOf],
  );

  const onRowMenu = useCallback(
    (row: Row, index: number) => {
      const id = idOf(row);
      setState((previous) =>
        previous.picked.has(id)
          ? previous
          : { picked: new Map([[id, { row, index }]]), anchor: index },
      );
    },
    [idOf],
  );

  const clear = useCallback(() => setState(NOTHING), []);

  const rows = useMemo(
    () =>
      [...state.picked.values()]
        .sort((a, b) => a.index - b.index)
        .map((entry) => entry.row),
    [state.picked],
  );
  const keys = useMemo(() => new Set(state.picked.keys()), [state.picked]);

  return {
    keys,
    rows,
    count: rows.length,
    anchor: state.anchor,
    onRowClick,
    onRowMenu,
    clear,
  };
}
