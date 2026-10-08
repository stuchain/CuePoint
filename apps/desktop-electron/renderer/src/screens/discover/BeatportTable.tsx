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
 * **Double-click does nothing, on purpose.** The player plays library files
 * (DEC-097), and a Beatport row has none; a double-click that did something
 * else would teach a gesture the Library means differently.
 */
import { useState, type ReactNode } from "react";

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
import { pluralize } from "../library/libraryFormat";
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

export function BeatportTable<Row>({
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
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  /**
   * The keyboard's way through the rows: the table is the one tab stop and the
   * last clicked row is the active one. Up and Down move it (Shift extends),
   * Enter or Space selects it (Ctrl or Cmd with Space adds or removes it). A
   * key pressed on a name link inside a row is the link's, not the table's.
   */
  const onRowKeys = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).getAttribute("role") !== "table") return;
    const total = source.total;
    if (total === 0) return;
    const active = selection.anchor;
    let to: number | null = null;
    if (event.key === "ArrowDown") to = active === null ? 0 : Math.min(active + 1, total - 1);
    else if (event.key === "ArrowUp") to = active === null ? 0 : Math.max(active - 1, 0);
    else if ((event.key === "Enter" || event.key === " ") && active !== null) to = active;
    if (to === null) return;
    const row = source.getRow(to);
    event.preventDefault();
    if (!row) return;
    const arrow = event.key.startsWith("Arrow");
    // An arrow without Shift moves the selection; Shift extends; Space with
    // Ctrl toggles the active row; Enter and plain Space select it alone.
    const modifiers = arrow
      ? { shiftKey: event.shiftKey, ctrlKey: false, metaKey: false }
      : { shiftKey: false, ctrlKey: event.ctrlKey && event.key === " ", metaKey: event.metaKey && event.key === " " };
    selection.onRowClick(row, to, modifiers);
  };

  const run = (id: BeatportActionId) => {
    setMenu(null);
    onAction(id);
  };

  return (
    <div className="discover-table">
      <div className="discover-table__rows" onKeyDown={onRowKeys}>
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
          onSelect={selection.onRowClick}
          onRowContextMenu={(row, index, anchor) => {
            selection.onRowMenu(row, index);
            setMenu(anchor);
          }}
          activeIndex={selection.anchor}
          scrollToIndex={selection.anchor}
          emptyState={emptyState}
          resetKey={resetKey}
          ariaLabel={label}
        />
      </div>

      <div className="discover-table__actions" role="toolbar" aria-label={`${label}: actions`}>
        <span className="discover-table__count" role="status">
          {selection.count > 0
            ? `${pluralize(selection.count, "track")} selected`
            : summary}
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
          <Button variant="secondary" onClick={selection.clear}>
            Clear
          </Button>
        )}
        <span className="discover-table__spacer" />
        <Button variant="secondary" onClick={() => setPicking(true)}>
          Columns…
        </Button>
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
      />
    </div>
  );
}
