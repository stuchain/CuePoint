/**
 * A table of Beatport tracks, with what can be done to them (DISCOVER-10).
 *
 * The Library's `TrackTable` over a Beatport row type and column registry
 * (DEC-041), with the pieces every Discover table shares: a selection by
 * Beatport id, the actions for it drawn once as buttons and once as the
 * right-click menu, and a column picker whose layout is remembered per table
 * (DEC-042).
 *
 * **Double-click does nothing, on purpose.** The player plays library files
 * (DEC-097), and a Beatport row has none; a double-click that did something
 * else would teach a gesture the Library means differently.
 */
import { useState, type ReactNode } from "react";

import { Button } from "../../components/Button";
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

  const run = (id: BeatportActionId) => {
    setMenu(null);
    onAction(id);
  };

  return (
    <div className="discover-table">
      <div className="discover-table__rows">
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
          <Button
            key={action.id}
            variant="secondary"
            disabled={action.disabled || busy}
            title={action.reason ?? undefined}
            onClick={() => run(action.id)}
          >
            {action.label}
          </Button>
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
