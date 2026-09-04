/**
 * The Universal Track Table (LIBUI-04, DEC-041).
 *
 * Generic in its row type, its columns and where its rows come from. It owns
 * exactly two things — how wide the columns are while you drag one, and which
 * rows are on screen — and nothing else. The query, the sort, the selection
 * and the persistence are all somebody else's state, passed in and handed
 * back, which is what lets one component serve the library table (LIBUI-10),
 * the match results (Phase 7) and inCrate (Phase 9) without learning about any
 * of them.
 *
 * It is extracted from `ResultsTable`, not a refactor of it: virtualization,
 * the sticky header, the resize handles and the themed scrollbar are the parts
 * that have worked for a year and are copied deliberately. The results screen
 * keeps using the original until Phase 7 (DEC-041).
 *
 * **A row that has not arrived is still a row.** `getRow` returning undefined
 * renders a placeholder of exactly the same height. If height depended on
 * whether data had arrived, scrolling a 50,000-row table would move the
 * ground under the pointer on every window.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { useScale } from "../../tokens/ScaleContext";
import {
  gridTemplate,
  orderedWidths,
  readRowHeight,
  resolveWidths,
  stickyLeft,
  totalWidth,
  widthAfterDrag,
  type ColumnWidths,
  type TrackColumnDef,
} from "./trackTableLayout";
import type { TrackTableSource } from "./trackTableSource";
import "./TrackTable.css";

export type SortDirection = "asc" | "desc";

export interface TrackTableSort {
  /** A column's `sortKey`, never its id: what the engine is asked for. */
  key: string;
  direction: SortDirection;
}

export interface TrackTableProps<Row> {
  columns: readonly TrackColumnDef<Row>[];
  source: TrackTableSource<Row>;

  /**
   * Column widths, keyed by column id. Controlled when given — LIBUI-06
   * persists them — and internal otherwise, so the component is usable
   * (and testable) on its own.
   */
  widths?: ColumnWidths;
  onWidthsChange?: (widths: ColumnWidths) => void;

  /** The current ordering, and how to ask for another. Never decided here. */
  sort?: TrackTableSort | null;
  onSortChange?: (sort: TrackTableSort) => void;

  /**
   * Where a column was dragged to (LIBUI-06, DEC-042). Absent means headers
   * are not draggable, which is what a table with a fixed column set wants.
   *
   * Whether the move is allowed — a pinned column stays among the pinned ones
   * — is decided by whoever owns the layout, not here: this reports a gesture.
   */
  onColumnMove?: (id: string, toIndex: number) => void;

  /** Selected rows, by the key `getRowKey` returns (DEC-045). */
  selectedKeys?: ReadonlySet<string | number>;
  onSelect?: (row: Row, index: number, event: React.MouseEvent) => void;

  /**
   * Double-click. Wired to nothing in Phase 4 (DEC-046): the gesture belongs
   * to playback, which arrives in Phase 5, and teaching it a temporary meaning
   * now would mean taking that meaning away. The seam exists so Phase 5 adds a
   * handler rather than reopening this component.
   */
  onRowActivate?: (row: Row, index: number) => void;

  /**
   * A row's identity. Defaults to its index, which is only right for a source
   * that never re-windows; the library table passes the track id, because with
   * windowed data an index means nothing once the window moves.
   */
  getRowKey?: (row: Row, index: number) => string | number;

  /** Shown instead of rows when the query matched nothing. */
  emptyState?: ReactNode;

  /** Rows kept rendered either side of the viewport. */
  overscan?: number;

  /**
   * Changes when the rows now mean something else — a new sort, a new filter,
   * a different playlist — and the table scrolls back to the top.
   *
   * Position in a list is only meaningful relative to the question that
   * produced it: keeping the scroll offset through a sort change shows a user
   * a different place in a different order and reads as a bug (LIBUI-05).
   */
  resetKey?: string | number;

  ariaLabel?: string;
}

/** How the header labels a sort direction, for a screen reader. */
function ariaSort(active: boolean, direction: SortDirection): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return direction === "asc" ? "ascending" : "descending";
}

export function TrackTable<Row>({
  columns,
  source,
  widths,
  onWidthsChange,
  sort = null,
  onSortChange,
  onColumnMove,
  selectedKeys,
  onSelect,
  onRowActivate,
  getRowKey,
  emptyState,
  overscan = 10,
  resetKey,
  ariaLabel = "Tracks",
}: TrackTableProps<Row>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scale } = useScale();
  // Which header is being dragged, for the cursor and the dimmed cell. The
  // move itself is the layout owner's to decide.
  const [dragging, setDragging] = useState<string | null>(null);

  const [internalWidths, setInternalWidths] = useState<ColumnWidths>(() =>
    resolveWidths(columns, widths, scale),
  );

  // Columns and scale both change what a width may be: a column added by the
  // picker (LIBUI-06) needs a default, and a scale change re-floors every
  // minimum. Resolving on change keeps a stored layout usable instead of
  // leaving a column at a width the current scale forbids.
  useEffect(() => {
    setInternalWidths((previous) => resolveWidths(columns, widths ?? previous, scale));
  }, [columns, widths, scale]);

  const effectiveWidths = widths ? resolveWidths(columns, widths, scale) : internalWidths;

  const applyWidths = useCallback(
    (next: ColumnWidths) => {
      if (!widths) setInternalWidths(next);
      onWidthsChange?.(next);
    },
    [onWidthsChange, widths],
  );

  const ordered = useMemo(
    () => orderedWidths(columns, effectiveWidths, scale),
    [columns, effectiveWidths, scale],
  );
  const template = useMemo(() => gridTemplate(ordered), [ordered]);
  const minWidth = useMemo(() => totalWidth(ordered), [ordered]);

  // `scale` looks unused, but `readRowHeight` reads `--row-height`, which
  // derives from `--scale`. Without the dependency the virtualizer keeps the
  // old height and every row lands in the wrong place after a scale change.
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const rowHeight = useMemo(() => readRowHeight(), [scale]);

  const virtualizer = useVirtualizer({
    count: source.total,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
  });

  // Back to the top when the rows start answering a different question.
  const previousResetKey = useRef(resetKey);
  useEffect(() => {
    if (previousResetKey.current === resetKey) return;
    previousResetKey.current = resetKey;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    virtualizer.scrollToOffset(0);
  }, [resetKey, virtualizer]);

  const virtualRows = virtualizer.getVirtualItems();
  const firstIndex = virtualRows[0]?.index ?? 0;
  const lastIndex = virtualRows[virtualRows.length - 1]?.index ?? 0;

  // Told once per range, not once per scroll event: a source that fetches
  // should be asked about a window, not woken by a wheel.
  const { requestWindow } = source;
  useEffect(() => {
    if (!requestWindow || source.total === 0 || virtualRows.length === 0) return;
    requestWindow(firstIndex, lastIndex);
  }, [requestWindow, firstIndex, lastIndex, source.total, virtualRows.length]);

  const handleSort = useCallback(
    (column: TrackColumnDef<Row>) => {
      if (!column.sortKey) return;
      const active = sort?.key === column.sortKey;
      const direction: SortDirection =
        active && sort?.direction === "asc" ? "desc" : "asc";
      onSortChange?.({ key: column.sortKey, direction });
    },
    [onSortChange, sort],
  );

  const startResize = useCallback(
    (column: TrackColumnDef<Row>, startX: number) => {
      const startWidth = effectiveWidths[column.id] ?? 0;

      const onMove = (event: MouseEvent) => {
        applyWidths({
          ...effectiveWidths,
          [column.id]: widthAfterDrag(column, startWidth, event.clientX - startX, scale),
        });
      };

      const onUp = () => {
        document.body.classList.remove("track-table--resizing");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      document.body.classList.add("track-table--resizing");
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [applyWidths, effectiveWidths, scale],
  );

  const style = {
    ["--track-table-columns" as string]: template,
    ["--track-table-min-width" as string]: `${minWidth}px`,
  } as CSSProperties;

  const empty = source.total === 0;

  return (
    <div className="track-table" style={style} data-testid="track-table">
      {/* The rows, headers and cells below are ARIA table parts, so something
          has to be the table: without this they describe nothing and a screen
          reader reads a pile of groups. `aria-rowcount` is the whole result,
          not the window — the rows in the DOM are tens of a possible fifty
          thousand, and saying "3 of 3" would be a lie the user cannot see. */}
      <div
        ref={scrollRef}
        className="track-table__scroll"
        role="table"
        aria-label={ariaLabel}
        aria-rowcount={source.total}
      >
        {/* Row 1, which is what makes the body rows row 2 onward. */}
        <div className="track-table__header" role="row" aria-rowindex={1}>
          {columns.map((column, index) => {
            const active = Boolean(column.sortKey && sort?.key === column.sortKey);
            return (
              <div
                key={column.id}
                className={`track-table__header-cell-wrap${column.sticky ? " track-table__header-cell-wrap--sticky" : ""}${dragging === column.id ? " track-table__header-cell-wrap--dragging" : ""}`}
                style={column.sticky ? { left: stickyLeft(columns, ordered, index) } : undefined}
                role="columnheader"
                aria-sort={ariaSort(active, sort?.direction ?? "asc")}
                data-column={column.id}
                draggable={Boolean(onColumnMove)}
                onDragStart={(event) => {
                  setDragging(column.id);
                  // Some data has to be set or Firefox refuses to start a drag;
                  // the id is what a drop needs anyway.
                  event.dataTransfer?.setData("text/plain", column.id);
                }}
                onDragEnd={() => setDragging(null)}
                onDragOver={(event) => {
                  if (!onColumnMove) return;
                  // Without this the browser refuses the drop, silently.
                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const moved = event.dataTransfer?.getData("text/plain") || dragging;
                  setDragging(null);
                  if (!moved || moved === column.id) return;
                  onColumnMove?.(moved, index);
                }}
              >
                <button
                  type="button"
                  className="track-table__header-cell"
                  disabled={!column.sortKey}
                  title={column.header}
                  onClick={() => handleSort(column)}
                >
                  {column.header}
                  {active && (
                    <span className="track-table__sort" aria-hidden>
                      {sort?.direction === "asc" ? " ▲" : " ▼"}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="track-table__col-resizer"
                  aria-label={`Resize ${column.header} column`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    startResize(column, event.clientX);
                  }}
                />
              </div>
            );
          })}
        </div>

        {empty ? (
          <div className="track-table__empty">{emptyState ?? "No tracks"}</div>
        ) : (
          <div
            className="track-table__body"
            style={{ height: `${virtualizer.getTotalSize()}px` }}
            role="rowgroup"
          >
            {virtualRows.map((item) => {
              const row = source.getRow(item.index);
              const key = row && getRowKey ? getRowKey(row, item.index) : item.index;
              const selected = selectedKeys?.has(key) ?? false;
              return (
                <div
                  key={key}
                  className={`track-table__row${row ? "" : " track-table__row--placeholder"}${selected ? " track-table__row--selected" : ""}`}
                  style={{
                    transform: `translateY(${item.start}px)`,
                    height: `${item.size}px`,
                  }}
                  role="row"
                  // Row 1 is the header, so the first track is row 2. This was
                  // index + 1 while nothing claimed to be a row above it.
                  aria-rowindex={item.index + 2}
                  aria-selected={selected}
                  data-index={item.index}
                  data-placeholder={row ? undefined : "true"}
                  onClick={(event) => row && onSelect?.(row, item.index, event)}
                  onDoubleClick={() => row && onRowActivate?.(row, item.index)}
                >
                  {columns.map((column, index) => (
                    <div
                      key={column.id}
                      className={`track-table__cell${column.sticky ? " track-table__cell--sticky" : ""}${column.align === "right" ? " track-table__cell--right" : ""}`}
                      style={
                        column.sticky
                          ? { left: stickyLeft(columns, ordered, index) }
                          : undefined
                      }
                      role="cell"
                      data-column={column.id}
                    >
                      {row ? (
                        column.render(row)
                      ) : (
                        // A shape, not a spinner: fifty of them scrolling past
                        // should read as "loading", not as an error.
                        <span className="track-table__skeleton" aria-hidden />
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
