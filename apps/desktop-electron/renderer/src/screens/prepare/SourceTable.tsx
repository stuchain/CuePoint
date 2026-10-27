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
import { useBeatportSelection, type Picked } from "../discover/useBeatportSelection";
import { setDraggedTrackIds } from "../library/collectionDrag";
import { creditsFor } from "../library/libraryDiscover";
import { countNoun } from "../../format/counts";
import { playItems } from "../library/trackActions";
import { moreEntries, moreSubmenu, thisPageBlock } from "./prepareMenus";
import { copyTrackRows, revealOne } from "./prepareTrackActions";
import { useTrackPlayMarks } from "../../components/player/playedTracks";

/** The row menu's first entry, as the panel's button says it for one track. */
const INSERT_HERE = "Insert here";

interface SourceTableProps<Row extends LibraryTrackRow> {
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
  /** Opens the table's column picker: the Columns icon in its header corner. */
  onColumns?: () => void;
  /** Said after a copy, or when a file cannot be shown. */
  onMessage: (message: string, tone: "success" | "info" | "warning") => void;
}

const idOf = (row: LibraryTrackRow) => row.id ?? -1;

interface Menu<Row> {
  x: number;
  y: number;
  rows: Row[];
  index: number;
  credits: TrackCreditLinks | null;
}

/**
 * A small "3 tracks" label as the drag image when several rows go at once, because the
 * browser's own ghost is the one row that was grabbed. jsdom has no setDragImage.
 */
function dragChip(transfer: DataTransfer, label: string) {
  if (typeof transfer.setDragImage !== "function") return;
  const chip = document.createElement("div");
  chip.textContent = label;
  chip.className = "drag-chip";
  document.body.appendChild(chip);
  transfer.setDragImage(chip, 0, 0);
  // The browser has taken its snapshot by the next frame.
  window.setTimeout(() => chip.remove(), 0);
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
  onColumns,
  onMessage,
}: SourceTableProps<Row>) {
  const playMarks = useTrackPlayMarks(idOf);
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
    // The base track menu every list has (Play, then More), with Insert here between, set off by a line (M410).
    return [
      ...playItems(rows.length, {
        onPlay: () => (one && index >= 0 ? onPlayFrom(index) : onPlayRows(rows)),
        onPlayNext: () => onQueue(rows, "next"),
        onAddToQueue: () => onQueue(rows, "end"),
      }),
      ...thisPageBlock([
        {
          id: "insert-here",
          label: rows.length > 1 ? `${INSERT_HERE}: ${countNoun(rows.length, "track")}` : INSERT_HERE,
          onSelect: () => onInsert(rows),
        },
      ]),
      ...moreSubmenu(
        moreEntries(
          { count: rows.length, credits, revealable: one !== null && one.file_path !== "" },
          {
            onSimilar: one && one.id != null ? () => onOpenSimilar(one.id as number) : null,
            onOpenPage: onOpenEntity,
            onCopy: () => void copyTrackRows(columns, rows, onMessage),
            onReveal: one && one.id != null ? () => void revealOne(one.id as number, onMessage) : null,
          },
        ),
      ),
    ];
  }, [columns, menu, onInsert, onMessage, onOpenEntity, onOpenSimilar, onPlayFrom, onPlayRows, onQueue]);

  return (
    <div className="prepare-source__table">
      {/* Esc lets go of the selection, as it does in every list (area 36). */}
      <div
        className="prepare-source__rows"
        onKeyDown={(event) => {
          if (event.key === "Escape" && selection.count > 0 && (event.target as HTMLElement).getAttribute("role") === "table") {
            selection.clear();
          }
        }}
      >
        <TrackTable<Row>
          columns={columns}
          source={source}
          widths={widths}
          onWidthsChange={onWidthsChange}
          onColumnMove={onColumnMove}
          onColumns={onColumns}
          sort={sort}
          onSortChange={onSortChange}
          selectedKeys={selection.keys}
          getRowKey={idOf}
          {...playMarks}
          onSelect={selection.onRowClick}
          onSelectAll={selection.selectAll}
          onRowActivate={(_row, index) => onPlayFrom(index)}
          onRowContextMenu={(row, index, anchor) => void openMenu(row, index, anchor.x, anchor.y)}
          activeIndex={selection.anchor}
          // A copy, not a reorder: nothing here changes an order, so no grip.
          showGrip={false}
          onRowDragStart={(row, _index, transfer) => {
            const ids = chosenFor(row)
              .map((chosen) => chosen.id)
              .filter((id): id is number => id != null);
            setDraggedTrackIds(transfer, ids);
            // A copy: the track stays where it is and goes into the Set too.
            transfer.effectAllowed = "copy";
            if (ids.length > 1) dragChip(transfer, countNoun(ids.length, "track"));
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
          label={menu.rows.length > 1 ? `Actions for ${countNoun(menu.rows.length, "track")}` : "Track actions"}
        />
      )}
    </div>
  );
}
