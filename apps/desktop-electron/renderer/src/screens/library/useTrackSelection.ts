/**
 * Driving the selection (LIBUI-09, DEC-045).
 *
 * Turns clicks into the model in `trackSelection.ts`, and resolves the two
 * things the model deliberately cannot: which ids a shift-range covers when it
 * crosses rows the table has never loaded, and which rows a copy should
 * contain. Both go through `fields=id` and the ordinary browse query
 * (LIBUI-03) — the same predicate and the same ordering, so a selection can
 * never disagree with what is on screen about which tracks those are.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { LibraryTrackRow } from "../../api/cuepointBridge.types";
import { browseParams, queryKey, type LibraryQuery } from "./libraryQuery";
import {
  EMPTY_SELECTION,
  clear as clearSelection,
  extend,
  rangeBetween,
  selectAll,
  selectOnly,
  toggle,
  type Selection,
} from "./trackSelection";

/**
 * The most rows a copy will gather.
 *
 * A selection can be a whole 50,000-track library (DEC-045); a clipboard full
 * of it is not a thing anyone asked for, and gathering it would be five
 * hundred requests. What is copied is said out loud when it is not everything.
 */
export const COPY_LIMIT = 5_000;

/** Rows per request while gathering a selection. Matches the engine's cap. */
const GATHER_PAGE = 500;

export interface TrackSelectionController {
  selection: Selection;
  count: number;
  /** Click a row, with whatever modifiers were held. */
  onRowClick: (
    row: LibraryTrackRow,
    index: number,
    event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
  ) => void;
  selectAllMatching: () => void;
  clear: () => void;
  /**
   * The rows in the selection, in the order the table shows them, up to
   * `COPY_LIMIT`. Fetched, because a selection can name rows no window holds.
   */
  gatherRows: (limit?: number) => Promise<LibraryTrackRow[]>;
}

async function fetchIds(
  query: LibraryQuery,
  offset: number,
  limit: number,
): Promise<number[]> {
  const bridge = window.cuepoint?.browseLibrary;
  if (!bridge) return [];
  const response = await bridge({ ...browseParams(query, offset, limit), fields: "id" });
  return response.track_ids ?? [];
}

export function useTrackSelection(
  query: LibraryQuery,
  total: number,
  getRow: (index: number) => LibraryTrackRow | undefined,
): TrackSelectionController {
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const key = queryKey(query);
  const previousKey = useRef(key);

  // A different question means different tracks: what was selected under the
  // old one is not a subset of the new one, and pretending otherwise would
  // act on tracks the user can no longer see.
  useEffect(() => {
    if (previousKey.current === key) return;
    previousKey.current = key;
    setSelection(EMPTY_SELECTION);
  }, [key]);

  const onRowClick = useCallback(
    (
      row: LibraryTrackRow,
      index: number,
      event: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean },
    ) => {
      const id = row.id;
      if (id == null) return;

      if (event.shiftKey) {
        setSelection((previous) => {
          if (previous.anchor === null) return selectOnly(id, index);
          const [from, to] = rangeBetween(previous.anchor, index);

          // The rows in hand first: a range inside the loaded window needs no
          // request at all, which is the common case.
          const known: number[] = [];
          let complete = true;
          for (let i = from; i <= to; i += 1) {
            const rowAt = getRow(i);
            if (rowAt?.id == null) complete = false;
            else known.push(rowAt.id);
          }

          if (!complete) {
            // The range crosses rows the table has never loaded. Ask the
            // engine for exactly those ids, in exactly this order.
            void fetchIds(query, from, to - from + 1).then((ids) => {
              if (ids.length > 0) {
                setSelection((current) => extend(current, ids, id));
              }
            });
          }
          return extend(previous, known, id);
        });
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        setSelection((previous) => toggle(previous, id, index));
        return;
      }

      setSelection(selectOnly(id, index));
    },
    [getRow, query],
  );

  const selectAllMatching = useCallback(() => {
    setSelection((previous) => selectAll(previous));
  }, []);

  const clear = useCallback(() => setSelection(clearSelection()), []);

  const gatherRows = useCallback(
    async (limit: number = COPY_LIMIT): Promise<LibraryTrackRow[]> => {
      const bridge = window.cuepoint?.browseLibrary;
      if (!bridge) return [];

      const wanted = (row: LibraryTrackRow) =>
        row.id != null &&
        (selection.all ? !selection.excluded.has(row.id) : selection.ids.has(row.id));

      const gathered: LibraryTrackRow[] = [];
      for (let offset = 0; offset < total && gathered.length < limit; offset += GATHER_PAGE) {
        // eslint-disable-next-line no-await-in-loop
        const response = await bridge(browseParams(query, offset, GATHER_PAGE));
        const rows = response.tracks.filter(wanted);
        gathered.push(...rows);
        if (response.tracks.length === 0) break;
      }
      return gathered.slice(0, limit);
    },
    [query, selection, total],
  );

  const count = selection.all
    ? Math.max(0, total - selection.excluded.size)
    : selection.ids.size;

  return { selection, count, onRowClick, selectAllMatching, clear, gatherRows };
}
