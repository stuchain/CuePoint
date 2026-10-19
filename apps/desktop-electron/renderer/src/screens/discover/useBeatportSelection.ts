/**
 * What is selected in a Beatport table (DISCOVER-10).
 *
 * By Beatport track id, never by row index, for the Library's reason
 * (DEC-045): an index means nothing once the window moves. A plain click
 * selects one row, Ctrl or Cmd adds or removes one, and Shift adds the rows
 * between the last plain click and this one to what is selected. That is the
 * Library's rule exactly (`useTrackSelection`): the anchor stays where it began,
 * so shift-clicking twice extends from the same place, and the row last clicked
 * is the one the Inspector and the wheel follow. Shift with nothing to extend
 * from is a plain click.
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { rangeBetween } from "../library/trackSelection";

export interface Picked<Row> {
  row: Row;
  index: number;
}

/** The modifier keys a selection reads: a click carries them, so does a key press. */
export type SelectModifiers = Pick<KeyboardEvent, "shiftKey" | "ctrlKey" | "metaKey">;

export interface BeatportSelection<Row> {
  /** Selected ids, for the table's highlight. */
  keys: ReadonlySet<number>;
  /** Selected rows, in the table's order. */
  rows: Row[];
  count: number;
  /** The row last clicked, if it is still selected: the one the Inspector and the wheel follow. */
  anchorRow: Row | null;
  /** The row a Shift-click extends from, for the table's keyboard menu. */
  anchor: number | null;
  /**
   * `rowAt` is the row at a displayed position, when the table shows the rows in another order
   * than the source holds them (a sort the table made itself, C193): a Shift range is then the
   * rows between the two displayed positions.
   */
  onRowClick: (
    row: Row,
    index: number,
    event: SelectModifiers,
    rowAt?: (index: number) => Row | undefined,
  ) => void;
  /**
   * Move what is selected to the positions the table shows its rows at: the table calls this when
   * it sorts its own rows or loads them again, so the anchor and the order of the selection are
   * always displayed positions. `positions` maps a Beatport track id to its displayed index.
   */
  reindex: (positions: ReadonlyMap<number, number>) => void;
  /** A right-click on a row outside the selection selects that row first. */
  onRowMenu: (row: Row, index: number) => void;
  /** Select this one row, as a plain click would, from outside the table. */
  select: (row: Row, index: number) => void;
  selectAll: () => void;
  clear: () => void;
}

interface State<Row> {
  picked: Map<number, Picked<Row>>;
  /** Where a Shift range starts: the last plain or Ctrl click. */
  anchor: number | null;
  /** The row clicked last, which a Shift range does not move the anchor to. */
  last: number | null;
}

const NOTHING = { picked: new Map(), anchor: null, last: null };

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
  const positionsOwned = useRef(false);

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
        // A table that tells the positions it shows (`reindex`) owns them: it may sort its own
        // rows, so `loadedRows` counting them in the source's order would flip them back.
        const at = positionsOwned.current ? (held?.index ?? index) : index;
        if (held && (held.row !== row || held.index !== at)) {
          picked.set(id, { row, index: at });
          changed = true;
        }
      }
      return changed ? { ...previous, picked } : previous;
    });
  }, [idOf, loadedRows]);

  const onRowClick = useCallback(
    (row: Row, index: number, event: SelectModifiers, rowAt: (index: number) => Row | undefined = getRow) => {
      const id = idOf(row);
      setState((previous) => {
        if (event.shiftKey) {
          // Nothing to extend from: a plain click, as in the Library.
          if (previous.anchor === null) {
            return { picked: new Map([[id, { row, index }]]), anchor: index, last: index };
          }
          const [from, to] = rangeBetween(previous.anchor, index);
          const picked = new Map(previous.picked);
          for (let at = from; at <= to; at += 1) {
            const inRange = rowAt(at);
            if (inRange) picked.set(idOf(inRange), { row: inRange, index: at });
          }
          return { picked, anchor: previous.anchor, last: index };
        }
        if (event.ctrlKey || event.metaKey) {
          const picked = new Map(previous.picked);
          if (picked.has(id)) picked.delete(id);
          else picked.set(id, { row, index });
          return { picked, anchor: index, last: index };
        }
        return { picked: new Map([[id, { row, index }]]), anchor: index, last: index };
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
          : { picked: new Map([[id, { row, index }]]), anchor: index, last: index },
      );
    },
    [idOf],
  );

  const select = useCallback(
    (row: Row, index: number) =>
      setState({ picked: new Map([[idOf(row), { row, index }]]), anchor: index, last: index }),
    [idOf],
  );

  const clear = useCallback(() => setState(NOTHING), []);

  const reindex = useCallback((positions: ReadonlyMap<number, number>) => {
    positionsOwned.current = true;
    setState((previous) => {
      if (previous.picked.size === 0) return previous;
      const idAt = new Map<number, number>();
      for (const [id, entry] of previous.picked) idAt.set(entry.index, id);
      const moved = (index: number | null) => {
        if (index === null) return null;
        const id = idAt.get(index);
        return id === undefined ? index : (positions.get(id) ?? index);
      };
      let changed = false;
      const picked = new Map(previous.picked);
      for (const [id, entry] of previous.picked) {
        const at = positions.get(id);
        if (at !== undefined && at !== entry.index) {
          picked.set(id, { row: entry.row, index: at });
          changed = true;
        }
      }
      const anchor = moved(previous.anchor);
      const last = moved(previous.last);
      if (!changed && anchor === previous.anchor && last === previous.last) return previous;
      return { picked, anchor, last };
    });
  }, []);

  /** Every row the table holds, for the bar's Select all. */
  const selectAll = useCallback(() => {
    const everything = loadedRows();
    if (everything.length === 0) return;
    setState({
      picked: new Map(everything.map((entry) => [idOf(entry.row), entry])),
      anchor: everything[0]?.index ?? null,
      last: everything[0]?.index ?? null,
    });
  }, [idOf, loadedRows]);

  const rows = useMemo(
    () =>
      [...state.picked.values()]
        .sort((a, b) => a.index - b.index)
        .map((entry) => entry.row),
    [state.picked],
  );
  const keys = useMemo(() => new Set(state.picked.keys()), [state.picked]);

  const anchorRow = useMemo(() => {
    if (state.last === null) return null;
    for (const entry of state.picked.values()) if (entry.index === state.last) return entry.row;
    return null;
  }, [state.last, state.picked]);

  return {
    keys,
    rows,
    count: rows.length,
    anchorRow,
    anchor: state.anchor,
    onRowClick,
    onRowMenu,
    select,
    selectAll,
    clear,
    reindex,
  };
}
