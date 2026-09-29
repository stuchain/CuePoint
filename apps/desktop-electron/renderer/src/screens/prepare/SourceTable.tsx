/**
 * One of the source panel's tables, and everything its rows offer (PREP-11).
 *
 * Suggestions and the library are both lists of library rows the user takes
 * tracks from, so they share one table:
 *
 * - **Insert here** puts the selected rows at the insertion point, in the
 *   table's order. It is first in each row's menu, and beside the point's
 *   words above the table, which the selection is reported to.
 * - **Drag** carries the rows as track ids, the payload the Collections tree
 *   takes (ORG-11), and the Set table drops them where they land.
 * - **A double-click, or Enter, plays**, as it does on a library row
 *   everywhere (DEC-012): hearing a candidate before it goes in is what the
 *   panel is for, and inserting is one click away.
 * - The rest of a row's menu is a library row's: play next, add to the queue,
 *   its Similar tracks and its pages (DISCOVER-11).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type { EntityKind, LibraryTrackRow, TrackCreditLinks } from "../../api/cuepointBridge.types";
import { TrackContextMenu } from "../../components/TrackContextMenu";
import {
  TrackTable,
  type ColumnWidths,
  type TrackColumnDef,
  type TrackTableSort,
  type TrackTableSource,
} from "../../components/table";
import { libraryRowMenuItems } from "../discover/libraryRowMenu";
import { useBeatportSelection, type Picked } from "../discover/useBeatportSelection";
import { setDraggedTrackIds } from "../library/collectionDrag";
import { creditsFor, discoverMenuItems } from "../library/libraryDiscover";
import { pluralize } from "../library/libraryFormat";

/** The row menu's first entry, as the panel's button says it for one track. */
export const INSERT_HERE = "Insert here";

export interface SourceTableProps<Row extends LibraryTrackRow> {
  ariaLabel: string;
  columns: readonly TrackColumnDef<Row>[];
  widths: ColumnWidths;
  onWidthsChange: (widths: ColumnWidths) => void;
  onColumnMove: (id: string, toIndex: number) => void;
  source: TrackTableSource<Row>;
  /** The rows the table holds now, for the selection's kept copies. */
  loadedRows: () => Array<Picked<Row>>;
  /** The question the rows answer: a new one clears the selection. */
  resetKey: string;
  sort?: TrackTableSort;
  onSortChange?: (sort: TrackTableSort) => void;
  emptyState: ReactNode;
  onInsert: (rows: Row[]) => void;
  /** The selected rows, in the table's order, whenever they change. */
  onSelectionChange: (rows: Row[]) => void;
  /** Play the list from this row (DEC-012). */
  onPlayFrom: (index: number) => void;
  onPlayRows: (rows: Row[]) => void;
  onQueue: (rows: Row[], where: "next" | "end") => void;
  onOpenSimilar: (trackId: number) => void;
  onOpenEntity: (kind: EntityKind, ref: string) => void;
}

const idOf = (row: LibraryTrackRow) => row.id ?? -1;

interface Menu<Row> {
  x: number;
  y: number;
  rows: Row[];
  index: number;
  credits: TrackCreditLinks | null;
}

export function SourceTable<Row extends LibraryTrackRow>({
  ariaLabel,
  columns,
  widths,
  onWidthsChange,
  onColumnMove,
  source,
  loadedRows,
  resetKey,
  sort,
  onSortChange,
  emptyState,
  onInsert,
  onSelectionChange,
  onPlayFrom,
  onPlayRows,
  onQueue,
  onOpenSimilar,
  onOpenEntity,
}: SourceTableProps<Row>) {
  const selection = useBeatportSelection<Row>({
    key: resetKey,
    idOf,
    getRow: source.getRow,
    loadedRows,
  });
  const [menu, setMenu] = useState<Menu<Row> | null>(null);

  useEffect(() => onSelectionChange(selection.rows), [onSelectionChange, selection.rows]);

  /** The rows a gesture on `row` acts on: the selection when it holds the row. */
  const chosenFor = useCallback(
    (row: Row): Row[] =>
      selection.keys.has(idOf(row)) && selection.count > 1 ? selection.rows : [row],
    [selection],
  );

  const openMenu = useCallback(
    async (row: Row, index: number, x: number, y: number) => {
      selection.onRowMenu(row, index);
      const rows = chosenFor(row);
      const credits = rows.length === 1 && row.id != null ? await creditsFor(row.id, null) : null;
      setMenu({ x, y, rows, index: rows.length === 1 ? index : -1, credits });
    },
    [chosenFor, selection],
  );

  const items = useMemo(() => {
    if (!menu) return [];
    const { rows, index, credits } = menu;
    const one = rows.length === 1 ? rows[0] : null;
    return [
      {
        id: "insert-here",
        label: rows.length > 1 ? `${INSERT_HERE}: ${pluralize(rows.length, "track")}` : INSERT_HERE,
        onSelect: () => onInsert(rows),
      },
      ...libraryRowMenuItems(
        rows.length,
        {
          onPlay: () => (one && index >= 0 ? onPlayFrom(index) : onPlayRows(rows)),
          onPlayNext: () => onQueue(rows, "next"),
          onAddToQueue: () => onQueue(rows, "end"),
        },
        one && one.id != null
          ? discoverMenuItems(
              { count: 1, credits },
              { onSimilar: () => onOpenSimilar(one.id as number), onOpenPage: onOpenEntity },
            )
          : [],
      ).map((item, at) => (at === 0 ? { ...item, separatorBefore: true } : item)),
    ];
  }, [menu, onInsert, onOpenEntity, onOpenSimilar, onPlayFrom, onPlayRows, onQueue]);

  return (
    <div className="prepare-source__table">
      <div className="prepare-source__rows">
        <TrackTable<Row>
          columns={columns}
          source={source}
          widths={widths}
          onWidthsChange={onWidthsChange}
          onColumnMove={onColumnMove}
          sort={sort}
          onSortChange={onSortChange}
          selectedKeys={selection.keys}
          getRowKey={idOf}
          onSelect={selection.onRowClick}
          onRowActivate={(_row, index) => onPlayFrom(index)}
          onRowContextMenu={(row, index, anchor) => void openMenu(row, index, anchor.x, anchor.y)}
          activeIndex={selection.anchor}
          onRowDragStart={(row, _index, transfer) => {
            const ids = chosenFor(row)
              .map((chosen) => chosen.id)
              .filter((id): id is number => id != null);
            setDraggedTrackIds(transfer, ids);
            // A copy: the track stays where it is and goes into the Set too.
            transfer.effectAllowed = "copy";
          }}
          emptyState={emptyState}
          resetKey={resetKey}
          ariaLabel={ariaLabel}
        />
      </div>
      {menu && (
        <TrackContextMenu
          x={menu.x}
          y={menu.y}
          items={items}
          onClose={() => setMenu(null)}
          label={menu.rows.length > 1 ? `Actions for ${menu.rows.length.toLocaleString()} tracks` : "Track actions"}
        />
      )}
    </div>
  );
}
