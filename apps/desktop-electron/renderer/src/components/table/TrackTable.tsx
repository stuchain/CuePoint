/**
 * The Universal Track Table (LIBUI-04, DEC-041).
 *
 * Generic in its row type, its columns and where its rows come from. It owns
 * exactly two things — how wide the columns are while you drag one, and which
 * rows are on screen — and nothing else. The query, the sort, the selection
 * and the persistence are all somebody else's state, passed in and handed
 * back, which is what lets one component serve the library table (LIBUI-10),
 * the match review (Phase 7) and Discover (Phase 9) without learning about any
 * of them.
 *
 * It was extracted from the Results screen's table rather than refactored out
 * of it: virtualization, the sticky header, the resize handles and the themed
 * scrollbar had worked for a year and were copied deliberately. Match review
 * runs on this table since CLEAN-12, and the original retired with inKey in
 * CLEAN-14 (DEC-041, DEC-071).
 *
 * **A row that has not arrived is still a row.** `getRow` returning undefined
 * renders a placeholder of exactly the same height. If height depended on
 * whether data had arrived, scrolling a 50,000-row table would move the
 * ground under the pointer on every window.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { Hint } from "../Hint";
import { PixelIcon } from "../PixelIcon";
import { PixelSpinner } from "../PixelSpinner";
import { useScale } from "../../tokens/ScaleContext";
import {
  gridTemplate,
  insertionAt,
  orderedWidths,
  useRowHeight,
  resolveWidths,
  stickyLeft,
  totalWidth,
  widthAfterDrag,
  type ColumnWidths,
  type TrackColumnDef,
} from "./trackTableLayout";
import type { TrackTableSource } from "./trackTableSource";
import { pageSizeFor, revealOffset, rowKeyCommand, type RowSelectModifiers } from "./trackTableKeys";
import "./TrackTable.css";

type SortDirection = "asc" | "desc";

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
  /**
   * A row was picked, by a click or by the keyboard (Up/Down, Home/End, Page
   * Up/Down, Ctrl+Space). Keys report the click the same move would have been,
   * so only the three modifiers are promised; a MouseEvent still fits.
   */
  onSelect?: (row: Row, index: number, modifiers: RowSelectModifiers) => void;

  /**
   * Ctrl+A (Cmd+A on a Mac) with the table focused. Absent, the key is left to
   * the page, which is what a table whose screen answers it itself wants.
   */
  onSelectAll?: () => void;

  /**
   * Whether Up, Down, Home, End, Page Up and Page Down move the selection.
   * False for a table whose screen owns those keys (Clean's review queue).
   */
  keyboardNavigation?: boolean;

  /**
   * Double-click, or Enter on the active row.
   *
   * The seam Phase 4 left deliberately unwired (DEC-046) so playback could give
   * it DEC-012's meaning without reopening this component. PLAYER-09 is what
   * finally passes a handler; the component itself did not have to change.
   */
  onRowActivate?: (row: Row, index: number) => void;

  /**
   * Right-click, or the keyboard's menu key on a row (PLAYER-09).
   *
   * The table reports the gesture, the row it happened on, and where to hang a
   * menu; what the menu contains, and whether it acts on this row or the whole
   * selection, is the screen's business rather than the table's.
   *
   * The anchor is a point rather than the event because the keyboard raises
   * this too, and a key press has no pointer position — it gets the corner of
   * the row instead, which is where a menu opened from the keyboard belongs.
   */
  onRowContextMenu?: (row: Row, index: number, anchor: { x: number; y: number }) => void;

  /**
   * Alt+↑ and Alt+↓ on the active row (FLW-10): move it one place. The table
   * reports the key and the row; whether the rows can be reordered, and doing
   * it, is the caller's, as a drop's is.
   */
  onRowMove?: (index: number, delta: -1 | 1) => void;

  /**
   * The row the keyboard acts on: the last one clicked (LIBUI-09's anchor).
   *
   * Where the keyboard starts: the table keeps its own cursor from here, so
   * a Shift range that leaves this row where it was still walks on.
   */
  activeIndex?: number | null;

  /**
   * A row to keep in view whenever it changes (CLEAN-12).
   *
   * The keyboard's cursor, for a caller whose keys move through the rows: a
   * reviewer pressing Down must not walk off the bottom of the table. The
   * table only scrolls; which row is the cursor stays the caller's.
   */
  scrollToIndex?: number | null;

  /**
   * A row's identity. Defaults to its index, which is only right for a source
   * that never re-windows; the library table passes the track id, because with
   * windowed data an index means nothing once the window moves.
   */
  getRowKey?: (row: Row, index: number) => string | number;

  /**
   * A row was picked up (ORG-11). Absent means rows are not draggable, which
   * is what every table but the Library's wants.
   *
   * What goes on the drag is the caller's: this reports the gesture and hands
   * over the transfer, exactly as the column header drag already does.
   */
  onRowDragStart?: (row: Row, index: number, transfer: DataTransfer) => void;

  /**
   * Whether a drag hovering the rows could land here.
   *
   * Asked on every dragover, because the answer depends on what the drag is
   * carrying. False draws no insertion line and lets the drop fall through —
   * a table that marks a place a drop cannot land is a table that lies.
   */
  acceptsRowDrop?: (transfer: DataTransfer) => boolean;

  /**
   * A drop the table accepted, at the index the rows should take.
   *
   * The index is an insertion point, so it runs from 0 to the row count: the
   * upper half of a row means "before it", the lower half "after it". `over`
   * is the row the drop landed on, for a caller whose rows are not all alike:
   * the end of one row and the start of the next are the same insertion
   * point, and only the row says which was meant (PREP-10's chapter headings).
   */
  onRowDrop?: (toIndex: number, transfer: DataTransfer, over: number) => void;

  /**
   * A drop the table accepted while it has no rows. There is no row to be over and no index to
   * report, so the table's whole area takes it and the owner decides where it goes.
   */
  onEmptyDrop?: (transfer: DataTransfer) => void;

  /**
   * What to say while an accepted drag is over the table ("Drop here to add to “Friday”").
   * Drawn over the rows with a dashed outline; absent, the table says nothing of the kind.
   */
  dropLabel?: string;

  /**
   * A drag the owner knows is in progress somewhere else, so the outline shows before the
   * pointer arrives. Only drawn when `dropLabel` is given.
   */
  dragActive?: boolean;

  /**
   * A small tag the insertion line carries when it sits above this row (`data-drop-chapter`),
   * for a caller whose rows are not all alike: the end of one chapter and the start of the next
   * draw the same line, and the tag says which side a drop on a heading means.
   */
  dropTag?: (row: Row) => string | undefined;

  /**
   * Whether a row can be picked up at all. Absent, every row that has arrived
   * can be, when `onRowDragStart` is given.
   */
  canDragRow?: (row: Row) => boolean;

  /**
   * An extra class for a row, for a caller whose rows are of more than one
   * kind (PREP-10's chapter headings). The table gives it no meaning.
   */
  rowClassName?: (row: Row) => string | undefined;

  /**
   * Whether a row is the track in the player (R4-6): its title takes the accent colour, its first
   * cell gets a small speaker, and a screen reader hears "Now playing". The table does not know
   * what a track is, so the caller says; absent, no row is marked.
   */
  isPlayingRow?: (row: Row) => boolean;

  /**
   * Whether a row is a track already played this session (R4-6): its title is muted. A playing
   * row is never also a played one, whatever this answers for it.
   */
  wasPlayedRow?: (row: Row) => boolean;

  /**
   * A cell at the right end of a row that has arrived, for a caller's buttons on the row they
   * belong to (Prepare's entry buttons, DEC-249). It is no column: it sits over the row's right
   * edge, sticky, with the row's own background, so the column layout and the picker are as
   * they were. Return null for a row that has nothing there.
   */
  rowEnd?: (row: Row, index: number) => ReactNode;

  /** Shown instead of rows when the query matched nothing. */
  emptyState?: ReactNode;

  /**
   * The rows are still being asked for and none has arrived: the pixel spinner stands where
   * the empty state would, so "nothing yet" is not read as "nothing" (PAGES-12, Loading).
   */
  loading?: boolean;

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
  onSelectAll,
  keyboardNavigation = true,
  onRowActivate,
  onRowContextMenu,
  onRowMove,
  onRowDragStart,
  acceptsRowDrop,
  onRowDrop,
  onEmptyDrop,
  dropTag,
  dropLabel,
  dragActive = false,
  canDragRow,
  rowClassName,
  isPlayingRow,
  wasPlayedRow,
  rowEnd,
  activeIndex = null,
  scrollToIndex = null,
  getRowKey,
  emptyState,
  loading = false,
  overscan = 10,
  resetKey,
  ariaLabel = "Tracks",
}: TrackTableProps<Row>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scale } = useScale();
  // Which header is being dragged, for the cursor and the dimmed cell. The
  // move itself is the layout owner's to decide.
  const [dragging, setDragging] = useState<string | null>(null);
  // Where an insertion line is drawn, as an index between rows (ORG-11).
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  // The row picked up (it lifts) and the place a drop landed (it settles), by index: both are
  // Interaction motion, and both are set by a drag, never by a scroll.
  const [liftedIndex, setLiftedIndex] = useState<number | null>(null);
  const [settledIndex, setSettledIndex] = useState<number | null>(null);
  // An accepted drag is over the table, wherever in it; the outline and label follow this.
  const [dropReady, setDropReady] = useState(false);
  useEffect(() => {
    if (settledIndex === null) return;
    const timer = window.setTimeout(() => setSettledIndex(null), 600);
    return () => window.clearTimeout(timer);
  }, [settledIndex]);

  // While the rows scroll, anything that animates on them waits (Scrolling, PAGES-12): the table
  // never animates per row under a wheel. Set on the element, not in React state, so a scroll
  // costs no render.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    let timer = 0;
    const onScroll = () => {
      if (!element.hasAttribute("data-scrolling")) element.setAttribute("data-scrolling", "");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => element.removeAttribute("data-scrolling"), 160);
    };
    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      window.clearTimeout(timer);
    };
  }, []);

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

  const rowHeight = useRowHeight();

  const virtualizer = useVirtualizer({
    count: source.total,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan,
    // Rows are rendered in their own task, not inside the scroll event: with a
    // page of waveforms in them, one task holding both was a long task.
    useFlushSync: false,
  });

  // The virtualizer keeps the sizes it estimated: a new row height (a new size
  // or row density) is told to it, or every row stays where the old one put it.
  const { measure } = virtualizer;
  const measuredHeight = useRef(rowHeight);
  useLayoutEffect(() => {
    if (measuredHeight.current === rowHeight) return;
    measuredHeight.current = rowHeight;
    measure();
  }, [measure, rowHeight]);

  // The keyboard's row. Separate from the screen's active row because a Shift range keeps that
  // one where it started, and it is drawn only once a key has moved it, so a mouse user never
  // sees a second highlight.
  const [cursor, setCursor] = useState<number | null>(activeIndex);
  const [keyboardCursor, setKeyboardCursor] = useState(false);
  // A move onto a row that has not arrived: reported once it has.
  const pending = useRef<{ index: number; modifiers: RowSelectModifiers } | null>(null);
  const followedIndex = useRef(activeIndex);
  // Set by a key that moved the cursor: the screen's active row may change as a result (Prepare
  // snaps it to a chapter heading), and that must not drag the cursor back.
  const movedByKey = useRef(false);
  useEffect(() => {
    if (followedIndex.current === activeIndex) return;
    followedIndex.current = activeIndex;
    // A selection let go of (Escape) takes a move still waiting for its row with it.
    if (activeIndex === null) pending.current = null;
    if (movedByKey.current) return;
    setCursor(activeIndex);
  }, [activeIndex]);
  // After the render the key caused, the cursor follows the screen again.
  useEffect(() => {
    movedByKey.current = false;
  });

  // Back to the top when the rows start answering a different question.
  const previousResetKey = useRef(resetKey);
  useEffect(() => {
    if (previousResetKey.current === resetKey) return;
    previousResetKey.current = resetKey;
    setCursor(null);
    setKeyboardCursor(false);
    pending.current = null;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    virtualizer.scrollToOffset(0);
  }, [resetKey, virtualizer]);

  useEffect(() => {
    if (scrollToIndex == null || scrollToIndex < 0 || scrollToIndex >= source.total) return;
    // "auto": nothing moves while the row is already on screen, so walking
    // through a visible page does not jolt the rows under the reader.
    virtualizer.scrollToIndex(scrollToIndex, { align: "auto" });
  }, [scrollToIndex, source.total, virtualizer]);

  // Clamped on the way out rather than stored, so a source that shrinks cannot leave it past the end.
  const cursorRow = cursor == null || source.total === 0 ? null : Math.min(cursor, source.total - 1);

  useEffect(() => {
    const wanted = pending.current;
    if (!wanted) return;
    const row = source.getRow(wanted.index);
    if (!row) return;
    pending.current = null;
    onSelect?.(row, wanted.index, wanted.modifiers);
  }, [source, onSelect]);

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

  /**
   * Shift+F10 and the menu key, the keyboard's way to a context menu.
   *
   * Chromium raises a `contextmenu` event for these on the *focused* element,
   * which here is the scroller and not a row — so the row is found by index and
   * the menu is hung on its top-left corner.
   */
  const onTableKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // The row the keyboard acts on: where the arrows left it, else the last click.
    const current = cursorRow ?? activeIndex;
    // Enter is the keyboard's double-click: whatever activation means to the
    // caller, it must not be reachable only with a mouse.
    if (event.key === "Enter" && onRowActivate && current != null) {
      const row = source.getRow(current);
      if (!row) return;
      event.preventDefault();
      onRowActivate(row, current);
      return;
    }
    if (
      event.altKey &&
      onRowMove &&
      activeIndex != null &&
      (event.key === "ArrowUp" || event.key === "ArrowDown")
    ) {
      event.preventDefault();
      onRowMove(activeIndex, event.key === "ArrowUp" ? -1 : 1);
      return;
    }
    const wanted = event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
    if (!wanted) {
      onRowSelectKey(event);
      return;
    }
    if (!onRowContextMenu || current == null) return;
    const row = source.getRow(current);
    if (!row) return;
    event.preventDefault();
    const element = scrollRef.current?.querySelector<HTMLElement>(
      `[data-index="${current}"]`,
    );
    const rect = element?.getBoundingClientRect();
    onRowContextMenu(row, current, {
      x: rect ? rect.left + 8 : 0,
      y: rect ? rect.top + rect.height : 0,
    });
  };

  /**
   * Up, Down, Home, End, Page Up, Page Down, Ctrl+Space and Ctrl+A: select from
   * the keyboard. Only for a key pressed on the table itself, so a button or
   * link inside a row keeps its own keys.
   */
  const onRowSelectKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const element = scrollRef.current;
    if (!keyboardNavigation || !element || event.target !== event.currentTarget) return;
    const header = element.querySelector<HTMLElement>(".track-table__header");
    const headerHeight = header?.offsetHeight ?? rowHeight;
    const command = rowKeyCommand(event, {
      cursor: cursorRow,
      total: source.total,
      pageSize: pageSizeFor(element.clientHeight, headerHeight, rowHeight),
      canSelectAll: Boolean(onSelectAll),
    });
    if (!command) return;
    event.preventDefault();
    pending.current = null;
    if (command.kind === "selectAll") {
      onSelectAll?.();
      return;
    }
    if (command.kind === "toggle") {
      const row = cursorRow == null ? undefined : source.getRow(cursorRow);
      if (row && cursorRow != null) {
        setKeyboardCursor(true);
        onSelect?.(row, cursorRow, { shiftKey: false, ctrlKey: event.ctrlKey, metaKey: event.metaKey });
      }
      return;
    }
    const to = command.to;
    movedByKey.current = true;
    const moved = to !== cursorRow;
    setCursor(to);
    setKeyboardCursor(true);
    const offset = revealOffset(to, rowHeight, headerHeight, element.scrollTop, element.clientHeight);
    if (offset != null) virtualizer.scrollToOffset(offset);
    if (!moved) return;
    const modifiers = { shiftKey: command.extend, ctrlKey: false, metaKey: false };
    const row = source.getRow(to);
    if (row) onSelect?.(row, to, modifiers);
    else pending.current = { index: to, modifiers };
  };

  const style = {
    ["--track-table-columns" as string]: template,
    ["--track-table-min-width" as string]: `${minWidth}px`,
  } as CSSProperties;

  const empty = source.total === 0;

  /**
   * Where a drag at `clientY` would land, worked out from the pointer and the rows' own top.
   *
   * Asked on every dragover and again on the drop, never remembered between them: a dragleave
   * between two cells clears state, and a drop that read it would be lost. A row under the
   * pointer answers by its own rectangle; anywhere else (below the rows, over the header) the
   * body's top gives the offset.
   */
  const placeAt = (target: EventTarget | null, clientY: number) => {
    // Over the header means the top of the table, not whatever the pointer's offset works out to.
    if (target instanceof Element && target.closest(".track-table__header")) return { insertAt: 0, over: 0 };
    const rowElement = target instanceof Element ? target.closest<HTMLElement>(".track-table__row") : null;
    const index = rowElement ? Number(rowElement.dataset.index) : Number.NaN;
    if (rowElement && Number.isInteger(index)) {
      const rect = rowElement.getBoundingClientRect();
      const after = clientY > rect.top + rect.height / 2;
      return { insertAt: index + (after ? 1 : 0), over: index };
    }
    const body = scrollRef.current?.querySelector(".track-table__body");
    const top = body ? body.getBoundingClientRect().top : 0;
    return insertionAt(clientY - top, rowHeight, source.total);
  };

  /** Whether this table would take the drag: someone is listening, and the owner accepts it. */
  const takesDrag = (transfer: DataTransfer | null | undefined): transfer is DataTransfer => {
    if (!transfer || !(empty ? onEmptyDrop : onRowDrop)) return false;
    return !acceptsRowDrop || acceptsRowDrop(transfer);
  };

  /**
   * A mouse press gives the table focus without scrolling it into view
   * (DEC-112).
   *
   * The table is focusable so the keyboard can reach it, and a browser scrolls
   * an element into view as it takes focus. When the page around the table
   * scrolls and a row is only partly visible, that moved the rows under the
   * pointer between the two clicks of a double-click, and the second landed on
   * another row. Focused here first, the press's own focus finds nothing to
   * do. The keyboard's scrolling (`scrollToIndex`) is untouched.
   */
  const focusWithoutScroll = (event: React.MouseEvent) => {
    if (event.button !== 0) return;
    const element = scrollRef.current;
    if (!element || document.activeElement === element) return;
    element.focus({ preventScroll: true });
  };

  return (
    <div
      className="track-table"
      style={style}
      data-testid="track-table"
      data-drop-ready={dropLabel && dropReady ? "" : undefined}
      data-drag-active={dropLabel && dragActive ? "" : undefined}
      data-empty={empty ? "" : undefined}
    >
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
        // Focusable so the table can be reached, scrolled and asked for a
        // context menu without a mouse — and so a menu opened from it has
        // somewhere to give focus back to when it closes.
        tabIndex={0}
        onKeyDown={onTableKeyDown}
        // The whole scroll area is the drop target, so the space below the rows and an empty
        // table's padding take a drop too, and one handler places it from the pointer.
        onDragOver={(event) => {
          const transfer = event.dataTransfer;
          if (!takesDrag(transfer)) {
            setDropIndex(null);
            setDropReady(false);
            return;
          }
          // Without this the browser refuses the drop, silently.
          event.preventDefault();
          // A drag that only copies (a track into a Set, PREP-11) is refused by a "move",
          // silently too: answer what it allows.
          transfer.dropEffect = transfer.effectAllowed === "copy" ? "copy" : "move";
          setDropReady(true);
          setDropIndex(empty ? null : placeAt(event.target, event.clientY).insertAt);
        }}
        onDragLeave={(event) => {
          // A move from one cell to the next leaves the cell it was in; only leaving the table
          // takes the mark away.
          const next = event.relatedTarget;
          if (next instanceof Node && event.currentTarget.contains(next)) return;
          setDropIndex(null);
          setDropReady(false);
        }}
        onDrop={(event) => {
          const transfer = event.dataTransfer;
          setDropIndex(null);
          setDropReady(false);
          setLiftedIndex(null);
          if (!takesDrag(transfer)) return;
          event.preventDefault();
          if (empty) {
            onEmptyDrop?.(transfer);
            return;
          }
          const { insertAt, over } = placeAt(event.target, event.clientY);
          setSettledIndex(insertAt);
          onRowDrop?.(insertAt, transfer, over);
        }}
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
                <Hint text={column.hint}>
                  <button
                    type="button"
                    className="track-table__header-cell"
                    // A hinted header stays focusable, so the keyboard reaches
                    // its hint; it just does not sort.
                    disabled={!column.sortKey && !column.hint}
                    aria-disabled={!column.sortKey && column.hint ? true : undefined}
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
                </Hint>
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
          <div className="track-table__empty">
            {loading ? <PixelSpinner label="Loading tracks" /> : (emptyState ?? "No tracks")}
          </div>
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
              const extra = row && rowClassName ? rowClassName(row) : undefined;
              const draggable = Boolean(row && onRowDragStart && (!canDragRow || canDragRow(row)));
              const playing = Boolean(row && isPlayingRow?.(row));
              const played = !playing && Boolean(row && wasPlayedRow?.(row));
              // The mark sits in the title cell; a table with no title column marks its first.
              const markColumn = Math.max(
                0,
                columns.findIndex((column) => column.id === "title"),
              );
              const end = row && rowEnd ? rowEnd(row, item.index) : null;
              const hasEnd = end != null && end !== false;
              return (
                <div
                  key={key}
                  className={`track-table__row${row ? "" : " track-table__row--placeholder"}${extra ? ` ${extra}` : ""}${playing ? " track-table__row--playing" : ""}${played ? " track-table__row--played" : ""}${selected ? " track-table__row--selected" : ""}${keyboardCursor && cursorRow === item.index ? " track-table__row--cursor" : ""}${dropIndex === item.index ? " track-table__row--drop-before" : ""}${dropIndex === item.index + 1 ? " track-table__row--drop-after" : ""}${draggable ? " track-table__row--draggable" : ""}${hasEnd ? " track-table__row--end" : ""}${liftedIndex === item.index ? " track-table__row--lifted" : ""}${settledIndex === item.index ? " track-table__row--settled" : ""}`}
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
                  data-playing={playing ? "true" : undefined}
                  draggable={draggable}
                  onDragStart={(event) => {
                    if (!row || !draggable || !onRowDragStart || !event.dataTransfer) return;
                    setDropIndex(null);
                    setLiftedIndex(item.index);
                    onRowDragStart(row, item.index, event.dataTransfer);
                  }}
                  onDragEnd={() => {
                    setDropIndex(null);
                    setLiftedIndex(null);
                  }}
                  data-drop={
                    dropIndex === item.index
                      ? "before"
                      : dropIndex === item.index + 1
                        ? "after"
                        : undefined
                  }
                  // A chapter's heading names its chapter on the line, so the line at a boundary
                  // says which side it means.
                  data-drop-chapter={
                    row && dropIndex === item.index ? (dropTag?.(row) ?? undefined) : undefined
                  }
                  onMouseDown={(event) => {
                    setKeyboardCursor(false);
                    focusWithoutScroll(event);
                  }}
                  onClick={(event) => {
                    // The cursor goes where the click did, even when the screen's active row does not move.
                    setCursor(item.index);
                    pending.current = null;
                    if (row) onSelect?.(row, item.index, event);
                  }}
                  onDoubleClick={() => row && onRowActivate?.(row, item.index)}
                  onContextMenu={(event) => {
                    if (!row || !onRowContextMenu) return;
                    event.preventDefault();
                    onRowContextMenu(row, item.index, { x: event.clientX, y: event.clientY });
                  }}
                >
                  {columns.map((column, index) => (
                    <div
                      key={column.id}
                      className={`track-table__cell${column.sticky ? " track-table__cell--sticky" : ""}${column.align === "right" ? " track-table__cell--right" : ""}`}
                      style={{
                        ...(column.sticky ? { left: stickyLeft(columns, ordered, index) } : null),
                        // The end cell takes the whole first grid row, so the cells are placed by hand.
                        ...(hasEnd ? { gridColumn: index + 1, gridRow: 1 } : null),
                      }}
                      role="cell"
                      data-column={column.id}
                    >
                      {playing && index === markColumn ? (
                        <>
                          <PixelIcon name="volume" className="track-table__playing-icon" />
                          <span className="track-table__sr-only">Now playing: </span>
                        </>
                      ) : null}
                      {row ? (
                        column.render(row)
                      ) : (
                        // A shape, not a spinner: fifty of them scrolling past
                        // should read as "loading", not as an error.
                        <span className="track-table__skeleton" aria-hidden />
                      )}
                    </div>
                  ))}
                  {hasEnd && (
                    <div className="track-table__end" role="cell">
                      {end}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {dropLabel && (dropReady || dragActive) && (
        <div className="track-table__drop-label" aria-hidden>
          <span>{dropLabel}</span>
        </div>
      )}
    </div>
  );
}
