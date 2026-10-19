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
 * Beatport row has no file (DEC-097), so what plays is its 2-minute sample, the same
 * one the round button at the row's right end plays. Esc clears the selection, Ctrl+A
 * selects every row loaded, and a right-click selects the row first, as everywhere.
 *
 * The bar of actions is above the table, like the Library's, and says how many tracks are
 * selected once, there.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Button } from "../../components/Button";
import { Hint } from "../../components/Hint";
import { TrackContextMenu } from "../../components/TrackContextMenu";
import {
  ColumnPicker,
  TrackTable,
  useColumnLayout,
  type TrackColumnDef,
  type TrackTableSort,
} from "../../components/table";
import type { TrackTableSource } from "../../components/table";
import { stopAllPreviews } from "../../components/preview/useBeatportPreview";
import { pluralize } from "../library/libraryFormat";
import { PreviewButton } from "./PreviewButton";
import { trackName } from "./discoverFormat";
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
  /** Rows the table shows, when nothing is selected: "146 tracks". */
  summary: string;
  emptyState: ReactNode;
  resetKey: string;
  /** Anything the toolbar shows before the actions: a filter, a toggle. */
  busy?: boolean;
}

export function BeatportTable<Row extends { beatport_track_id: number; title: string; mix_name: string | null }>({
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
  emptyState,
  resetKey,
  busy = false,
}: BeatportTableProps<Row>) {
  const layout = useColumnLayout<Row>(layoutKey, columns);
  // Preview cells scroll in and out of a virtualised table, so a sample belongs
  // to the table's lifetime, not its cell's (DEC-269).
  useEffect(() => stopAllPreviews, []);
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  /**
   * The keyboard's way through the rows: the table is the one tab stop. The
   * table itself moves the selection (the arrows, Home/End, Page Up/Down, Ctrl+Space,
   * Ctrl+A) and Enter plays; what is left here is plain Space selecting the keyboard's row
   * alone, and Escape letting the selection go. A key pressed on a name link inside a row
   * is the link's, not the table's.
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
    const total = source.total;
    if (total === 0) return;
    const active = selection.anchor === null ? null : (reported.current ?? selection.anchor);
    if (event.key !== " " || active === null) return;
    if (event.ctrlKey || event.metaKey) return;
    const row = source.getRow(active);
    event.preventDefault();
    if (!row) return;
    // Plain Space selects the active row alone.
    selection.onRowClick(row, active, { shiftKey: false, ctrlKey: false, metaKey: false });
  };

  const rowsRef = useRef<HTMLDivElement>(null);
  /** Double-click or Enter: play that track's sample, unless it is sounding already. */
  const playFrom = (index: number) => {
    const button = rowsRef.current?.querySelector<HTMLButtonElement>(
      `[role="row"][data-index="${index}"] .cp-play-btn`,
    );
    const state = button?.dataset.state;
    if (!button || state === "playing" || state === "loading" || state === "none") return;
    button.click();
  };

  const run = (id: BeatportActionId) => {
    setMenu(null);
    onAction(id);
  };

  return (
    <div className="discover-table">
      <div className="discover-table__actions" role="toolbar" aria-label={`${label}: actions`}>
        <span className="discover-table__count" role="status">
          {selection.count > 0 ? `${pluralize(selection.count, "track")} selected` : summary}
        </span>
        {actions.map((action) => (
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
        ))}
        {selection.count > 0 && (
          <Button variant="quiet" onClick={selection.clear}>
            Clear
          </Button>
        )}
      </div>

      <div ref={rowsRef} className="discover-table__rows" onKeyDown={onRowKeys}>
        <TrackTable<Row>
          columns={layout.visible}
          source={source}
          widths={layout.widths}
          onWidthsChange={layout.setWidths}
          onColumnMove={layout.move}
          sort={sort}
          onSortChange={onSortChange}
          selectedKeys={selection.keys}
          getRowKey={(row) => idOf(row)}
          onSelect={(row, index, modifiers) => {
            reported.current = index;
            selection.onRowClick(row, index, modifiers);
          }}
          onSelectAll={selection.selectAll}
          onRowActivate={(_row, index) => playFrom(index)}
          rowEnd={(row) => (
            <PreviewButton beatportTrackId={row.beatport_track_id} title={trackName(row)} />
          )}
          onRowContextMenu={(row, index, anchor) => {
            selection.onRowMenu(row, index);
            setMenu(anchor);
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
          label={`${pluralize(Math.max(selection.count, 1), "track")} from Beatport`}
          items={actions.map((action) => ({
            id: action.id,
            label: action.label,
            disabled: action.disabled || busy,
            onSelect: () => run(action.id),
          }))}
          onClose={() => setMenu(null)}
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
