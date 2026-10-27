/**
 * A table of Beatport tracks, with what can be done to them (DISCOVER-10).
 *
 * The Library's `TrackTable` over a Beatport row type and column registry
 * (DEC-041), with the pieces every Discover table shares: a selection by
 * Beatport id, the actions for it drawn once as buttons and once as the
 * right-click menu, and a column picker whose layout is remembered per table
 * (DEC-042). The buttons are always there (DEC-209): one that needs rows says
 * why it waits, in a Hint, until some are selected.
 *
 * **Double-click and Enter play from that track**, as in every other track list: a
 * Beatport row has no file (DEC-097), so what plays is its 2-minute sample, and the row
 * shows it is sounding as a Library row does. No row draws a play button (M99, D12). Esc
 * clears the selection, Ctrl+A selects every row loaded, and a right-click selects the row
 * first, as everywhere.
 *
 * The bar of actions is above the table, like the Library's, and says how many tracks are
 * selected once, at its left. With one track selected, "Open on Beatport" becomes one "Open" menu
 * button that also holds "Open artist page" and "Open label page", the same entries as the
 * right-click menu has (nothing is right-click only), so the bar never wraps (new D).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { BeatportTrackRow, EntityKind } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { CloseButton } from "../../components/CloseButton";
import { Hint } from "../../components/Hint";
import { TrackContextMenu, useMenuButton, type TrackContextMenuItem } from "../../components/TrackContextMenu";
import {
  ColumnPicker,
  TrackTable,
  useColumnLayout,
  type TrackColumnDef,
  type TrackTableSort,
} from "../../components/table";
import type { TrackTableSource } from "../../components/table";
import { stopAllPreviews, useBeatportPreview } from "../../components/preview/useBeatportPreview";
import { countNoun, formatCount } from "../../format/counts";
import { sortedRows } from "./clientSort";
import { beatportPageItems } from "./libraryRowMenu";
import type { BeatportAction, BeatportActionId } from "./beatportActions";
import type { BeatportSelection } from "./useBeatportSelection";

interface BeatportTableProps<Row> {
  columns: readonly TrackColumnDef<Row>[];
  layoutKey: string;
  source: TrackTableSource<Row>;
  selection: BeatportSelection<Row>;
  idOf: (row: Row) => number;
  /** Absent for a table the engine orders by itself: no header sorts it. */
  sort?: TrackTableSort | null;
  onSortChange?: (sort: TrackTableSort) => void;
  actions: readonly BeatportAction[];
  onAction: (id: BeatportActionId) => void;
  /** What the rows are, for a screen reader and the toolbar. */
  label: string;
  /**
   * The one count of the table, at the right end of its bar (C224): "146 tracks", or a longer line
   * the page needs ("40 tracks · 12 already in your library (hidden)"). While rows are selected
   * it reads "3 selected" instead, with the close mark that clears them.
   */
  summary: string;
  /** Before the filters and actions, at the left of the bar: a way back to the cards. */
  lead?: ReactNode;
  /** The table's filters, after the lead and before the actions (C234). */
  filters?: ReactNode;
  emptyState: ReactNode;
  /** Add to wantlist and Open on Beatport as one "Beatport" menu button, so the bar stays one row (M174). */
  beatportMenu?: boolean;
  /**
   * Opens an artist's or label's page: the row menu then offers "Open artist page" and "Open
   * label page" for one track (C196). Names in the table are plain text.
   */
  onOpenPage?: (kind: EntityKind, ref: string) => void;
  /** The column order before the last reorder, so a saved layout is moved once (C70). */
  previousDefaultOrder?: readonly string[];
  resetKey: string;
  /** Anything the toolbar shows before the actions: a filter, a toggle. */
  busy?: boolean;
}

export function BeatportTable<Row extends BeatportTrackRow>({
  columns,
  layoutKey,
  source,
  selection,
  idOf,
  sort,
  onSortChange,
  actions,
  onAction,
  label,
  summary,
  lead,
  filters,
  emptyState,
  beatportMenu = false,
  onOpenPage,
  previousDefaultOrder,
  resetKey,
  busy = false,
}: BeatportTableProps<Row>) {
  const layout = useColumnLayout<Row>(layoutKey, columns, { previousDefaultOrder });
  // A column with no engine key sorts here, over the rows the table holds (C70, C193); the last
  // such sort is remembered with the layout. An engine sort is the page's, and forgets it.
  const [clientSort, setClientSort] = useState(layout.sort);
  const shownSort = clientSort ?? sort;
  const changeSort = (next: TrackTableSort) => {
    const mine = columns.some((column) => !column.sortKey && column.accessor && column.id === next.key);
    layout.setSort(mine ? next : null);
    setClientSort(mine ? next : null);
    if (!mine) onSortChange?.(next);
  };
  // The rows as the table shows them while it sorts them itself, so a Shift range and the keys
  // see the displayed positions.
  const displayed = useMemo(() => {
    if (!clientSort) return null;
    const rows: Row[] = [];
    for (let at = 0; at < source.total; at += 1) {
      const row = source.getRow(at);
      if (!row) return null;
      rows.push(row);
    }
    return sortedRows(rows, columns, clientSort);
  }, [clientSort, columns, source]);
  // The selection's positions are the displayed ones: the table's own sort, and rows loaded again,
  // both move them (C193). Selecting all or clicking keeps them, so those need no pass.
  const { reindex } = selection;
  useEffect(() => {
    const positions = new Map<number, number>();
    if (displayed) {
      displayed.forEach((row, at) => positions.set(idOf(row), at));
    } else {
      for (let at = 0; at < source.total; at += 1) {
        const row = source.getRow(at);
        if (row) positions.set(idOf(row), at);
      }
    }
    reindex(positions);
  }, [displayed, idOf, reindex, selection.keys, source]);
  // Rows scroll in and out of a virtualised table, so a sample belongs to the table's lifetime,
  // not its row's (DEC-269).
  useEffect(() => stopAllPreviews, []);
  // The sample asked for last (M99): the row a double-click or Enter played. `asked` counts the
  // asks, so the same row asked again is a new ask.
  const [previewing, setPreviewing] = useState<{ id: number; asked: number } | null>(null);
  const preview = useBeatportPreview(
    previewing ? { kind: "catalog", id: previewing.id } : null,
    { stopOnUnmount: false },
  );
  const { toggle: togglePreview } = preview;
  const previewState = preview.state;
  const handled = useRef(0);
  useEffect(() => {
    if (!previewing || previewing.asked === handled.current) return;
    handled.current = previewing.asked;
    // A sounding sample is left alone, and one Beatport has none for is not asked again.
    if (previewState === "playing" || previewState === "loading" || previewState === "none") return;
    togglePreview();
  }, [previewState, previewing, togglePreview]);
  const sounding = previewState === "playing" || previewState === "loading";
  const isPlayingRow = (row: Row) => sounding && previewing?.id === row.beatport_track_id;
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; row: Row } | null>(null);

  /**
   * The keyboard's way through the rows: the table is the one tab stop. The
   * table itself moves the selection (the arrows, Home/End, Page Up/Down, Ctrl+Space,
   * Ctrl+A) and Enter plays; what is left here is plain Space selecting the keyboard's row
   * alone, and Escape letting the selection go.
   */
  // The last row a click or key reported: a Shift range keeps the anchor where it began, but
  // Enter and Space belong to the row the keyboard is on. A new anchor means a new start.
  const reported = useRef<number | null>(null);
  useEffect(() => {
    reported.current = null;
  }, [selection.anchor]);

  const onRowKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // The table answers a key it owns (the arrows, Ctrl+Space) and says so.
    if (event.defaultPrevented) return;
    if ((event.target as HTMLElement).getAttribute("role") !== "table") return;
    if (event.key === "Escape" && selection.count > 0) {
      event.preventDefault();
      selection.clear();
      return;
    }
    if (source.total === 0) return;
    const active = selection.anchor === null ? null : (reported.current ?? selection.anchor);
    if (event.key !== " " || active === null) return;
    if (event.ctrlKey || event.metaKey) return;
    // The row at the displayed position (a sort the table made itself changes the order).
    const row = displayed ? displayed[active] : source.getRow(active);
    event.preventDefault();
    if (!row) return;
    // Plain Space selects the active row alone.
    selection.onRowClick(row, active, { shiftKey: false, ctrlKey: false, metaKey: false });
  };

  /** Double-click or Enter: play that track's sample through the preview hook (M99), unless it is sounding already. */
  const playFrom = (row: Row) => {
    // A build that cannot fetch samples has nothing to play.
    if (!window.cuepoint?.getCatalogPreview) return;
    setPreviewing((was) => ({ id: row.beatport_track_id, asked: (was?.asked ?? 0) + 1 }));
  };

  /** The actions, then (for one track) the way to its artist's and label's pages (C196). */
  const menuItems = (row: Row): TrackContextMenuItem[] => {
    const items: TrackContextMenuItem[] = actions.map((action) => ({
      id: action.id,
      label: action.label,
      disabled: action.disabled || busy,
      onSelect: () => run(action.id),
    }));
    if (!onOpenPage || selection.count > 1) return items;
    const [first, ...rest] = beatportPageItems(row, onOpenPage);
    return [...items, { ...first!, separatorBefore: true }, ...rest];
  };

  // One selected track: the way to its artist's and label's pages, in the bar and again in the
  // right-click menu (C196). A person with several names gets a submenu to choose from.
  const onlyRow = onOpenPage && selection.count === 1 ? selection.rows[0] : undefined;
  const pageItems = onlyRow && onOpenPage ? beatportPageItems(onlyRow, onOpenPage) : [];
  // Add to wantlist and Open on Beatport fold into one "Beatport" menu button (M174): three buttons
  // wrapped the bar onto a second line. A table without Add to wantlist (the wantlist itself) keeps
  // Open on Beatport as a button, which becomes an "Open" menu with one track selected, holding its
  // artist's and label's pages too (new D).
  const openMenu = useMenuButton();
  const wantAction = beatportMenu ? actions.find((action) => action.id === "add_to_wantlist") : undefined;
  const openAction = actions.find((action) => action.id === "open");
  const folded = wantAction !== undefined || pageItems.length > 0;
  const menuItem = (action: (typeof actions)[number]): TrackContextMenuItem => ({
    id: action.id,
    label: action.label,
    disabled: action.disabled || busy,
    reason: action.reason ?? undefined,
    onSelect: () => run(action.id),
  });
  const openItems: TrackContextMenuItem[] = folded
    ? [
        ...(wantAction ? [menuItem(wantAction)] : []),
        ...(openAction ? [menuItem(openAction)] : []),
        ...pageItems.map((item, at) => (at === 0 && (wantAction || openAction) ? { ...item, separatorBefore: true } : item)),
      ]
    : [];
  // With nothing selected every entry waits for rows: the button waits too, and says why.
  const menuWaits = openItems.length > 0 && openItems.every((item) => item.disabled);
  const menuReason = menuWaits ? (openAction?.reason ?? wantAction?.reason ?? undefined) : undefined;
  const openButton = (
    <Hint key="open-menu" text={menuReason}>
      <Button variant="secondary" menu disabled={menuWaits} {...openMenu.buttonProps}>
        {wantAction ? "Beatport" : "Open"}
      </Button>
    </Hint>
  );
  const openBox = folded && openMenu.open ? openMenu.anchor.current?.getBoundingClientRect() : undefined;

  const run = (id: BeatportActionId) => {
    setMenu(null);
    onAction(id);
  };

  return (
    <div className="discover-table">
      <div className="cp-toolbar discover-table__actions" role="toolbar" aria-label={`${label}: actions`}>
        {lead}
        <span className="cp-count" role="status">
          {selection.count > 0 ? `${formatCount(selection.count)} selected` : summary}
        </span>
        {selection.count > 0 && (
          <CloseButton aria-label="Clear selection" onClick={selection.clear} />
        )}
        {filters}
        {actions.map((action) =>
          wantAction && action.id === "add_to_wantlist" ? null : folded && action.id === "open" ? (
            openButton
          ) : (
            <span key={action.id} className="discover-table__action">
              <Hint text={action.reason ?? undefined}>
                <Button
                  variant="secondary"
                  disabled={action.disabled || busy}
                  onClick={() => run(action.id)}
                >
                  {action.label}
                </Button>
              </Hint>
              {action.note && <span className="discover-note">{action.note}</span>}
            </span>
          ),
        )}
        {folded && !openAction && !wantAction && openButton}
      </div>

      <div className="discover-table__rows" onKeyDown={onRowKeys}>
        <TrackTable<Row>
          columns={layout.visible}
          source={source}
          widths={layout.widths}
          onWidthsChange={layout.setWidths}
          onColumnMove={layout.move}
          sort={shownSort}
          onSortChange={changeSort}
          selectedKeys={selection.keys}
          getRowKey={(row) => idOf(row)}
          onSelect={(row, index, modifiers) => {
            reported.current = index;
            selection.onRowClick(row, index, modifiers, displayed ? (at) => displayed[at] : undefined);
          }}
          onSelectAll={selection.selectAll}
          onRowActivate={(row) => playFrom(row)}
          isPlayingRow={isPlayingRow}
          onRowContextMenu={(row, index, anchor) => {
            selection.onRowMenu(row, index);
            setMenu({ ...anchor, row });
          }}
          activeIndex={selection.anchor}
          emptyState={emptyState}
          resetKey={resetKey}
          ariaLabel={label}
          onColumns={() => setPicking(true)}
        />
      </div>

      {menu && (
        <TrackContextMenu
          x={menu.x}
          y={menu.y}
          label={`${countNoun(Math.max(selection.count, 1), "track")} from Beatport`}
          items={menuItems(menu.row)}
          onClose={() => setMenu(null)}
        />
      )}

      {folded && openMenu.open && openBox && (
        <TrackContextMenu
          x={openBox.left}
          y={openBox.bottom}
          anchor={openMenu.anchor}
          label="Open"
          items={openItems}
          onClose={openMenu.close}
        />
      )}

      <ColumnPicker
        open={picking}
        onClose={() => setPicking(false)}
        columns={columns}
        layout={layout.layout}
        onToggle={layout.toggle}
        onNudge={layout.nudge}
        onReset={layout.reset}
        onRestore={layout.restore}
      />
    </div>
  );
}
