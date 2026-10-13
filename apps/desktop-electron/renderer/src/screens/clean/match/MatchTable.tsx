/**
 * The Match table: every track's before → after, to tick and take many at once (C14).
 *
 * A `TrackTable` over the same windowed list One at a time walks — no second
 * query path (DEC-041). Each row reads from its `match_proposal`: a value
 * Correct would change shows "before → after". The ticks over the table are
 * the same remembered preference as the ticks under One at a time (OQ5), and
 * **Take ticked values** (in the toolbar above) sends the ticked rows' own
 * proposals through one `correctMatches`.
 *
 * Double-click a row, or press Enter on it, to open it in One at a time. Save
 * review list as a file… and Columns… live here: they are about this table.
 */
import { useCallback, useMemo, useState, type ReactNode } from "react";

import type {
  LibraryTrackRow,
  ReviewExportFormat,
} from "../../../api/cuepointBridge.types";
import { Button, Modal, useToast } from "../../../components";
import { Select } from "../../../components/Select";
import { ColumnPicker, TrackTable, useColumnLayout } from "../../../components/table";
import { SelectionActions } from "../../library/SelectionActions";
import { batchSelection } from "../../library/libraryBatch";
import { queryKey, type LibraryQuery, type SortDirection } from "../../library/libraryQuery";
import { copySummary, gatherTracksAsText, writeClipboard } from "../../library/trackClipboard";
import { EMPTY_SELECTION, isSelected, onlySelectedId, selectAll } from "../../library/trackSelection";
import type { useTrackSelection } from "../../library/useTrackSelection";
import type { useTrackWindow } from "../../library/useTrackWindow";
import { reportUnexpected } from "../../../reporting/reporting";
import { exportedLine, trackCount } from "../cleanFormat";
import { revealTrack } from "../revealTrack";
import { CARD_FIELDS, CARD_FIELD_LABELS, proposalCells, type CardField } from "./matchCard";
import { MATCH_COLUMNS, MATCH_TABLE_LAYOUT_KEY, TickContext } from "./matchColumns";
import { StatusLine, type MatchStatus } from "./StatusLine";
import { NEEDS_DESKTOP, userMessage } from "../../../api/userMessage";

/** A tick toggles its row like a Ctrl-click, leaving the others as they are. */
const TICK_CLICK = { shiftKey: false, ctrlKey: true, metaKey: false };

const EXPORT_FORMATS: Array<{ value: ReviewExportFormat; label: string }> = [
  { value: "csv", label: "CSV" },
  { value: "excel", label: "Excel" },
  { value: "json", label: "JSON" },
];

interface MatchTableProps {
  list: ReturnType<typeof useTrackWindow>;
  selection: ReturnType<typeof useTrackSelection>;
  query: LibraryQuery;
  order: { sort: string; dir: SortDirection };
  onOrder: (order: { sort: string; dir: SortDirection }) => void;
  /** The row the cursor is on, so the table scrolls to it and marks it. */
  cursor: number | null;
  onCursor: (index: number) => void;
  /** Double-click or Enter: open this row in One at a time. */
  onOpen: (index: number) => void;
  /** Which values "Take ticked values" copies, and the way to change it. */
  ticks: ReadonlySet<CardField>;
  onToggleTick: (field: CardField) => void;
  status: MatchStatus | null;
  busy: boolean;
  onUndo: () => void;
  emptyState: ReactNode;
}

export function MatchTable({
  list,
  selection,
  query,
  order,
  onOrder,
  cursor,
  onCursor,
  onOpen,
  ticks,
  onToggleTick,
  status,
  busy,
  onUndo,
  emptyState,
}: MatchTableProps) {
  const { push } = useToast();
  const columns = useColumnLayout<LibraryTrackRow>(MATCH_TABLE_LAYOUT_KEY, MATCH_COLUMNS);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ReviewExportFormat>("csv");
  const [exporting, setExporting] = useState(false);
  const [copying, setCopying] = useState(false);

  const selected = selection.selection;
  const everything = useMemo(() => batchSelection(selectAll(EMPTY_SELECTION), query), [query]);

  // One pass over the rows read so far: where each is, which are ticked, and
  // how many of those would have a key of the user's own replaced.
  const { selectedKeys, indexById, replacing } = useMemo(() => {
    const keys = new Set<number>();
    const indexes = new Map<number, number>();
    let hand = 0;
    for (let index = 0; index < list.total; index += 1) {
      const entry = list.source.getRow(index);
      if (!entry?.id) continue;
      indexes.set(entry.id, index);
      if (!isSelected(selected, entry.id)) continue;
      keys.add(entry.id);
      if (proposalCells(entry)?.key.changes) hand += 1;
    }
    return { selectedKeys: keys, indexById: indexes, replacing: hand };
  }, [selected, list.source, list.total]);

  // A row's tick is a Ctrl-click on it: the model is the table's own selection.
  const tickRow = useCallback(
    (row: LibraryTrackRow) => {
      const index = row.id == null ? undefined : indexById.get(row.id);
      if (index !== undefined) selection.onRowClick(row, index, TICK_CLICK);
    },
    [indexById, selection],
  );
  const tickValue = useMemo(
    () => ({
      isTicked: (row: LibraryTrackRow) => row.id != null && selectedKeys.has(row.id),
      toggle: tickRow,
    }),
    [selectedKeys, tickRow],
  );

  const trackId = selected.lastId;
  const lastRow = useMemo(() => {
    if (trackId == null) return null;
    for (let index = 0; index < list.total; index += 1) {
      const entry = list.source.getRow(index);
      if (entry?.id === trackId) return entry;
    }
    return null;
  }, [list.source, list.total, trackId]);
  const revealPath =
    trackId != null && onlySelectedId(selected, list.total) === trackId && lastRow
      ? lastRow.file_path
      : null;

  const copy = useCallback(async () => {
    setCopying(true);
    try {
      const rows = await selection.gatherRows();
      const text = await gatherTracksAsText(columns.visible, rows);
      const wrote = text === "" ? false : await writeClipboard(text);
      push(
        wrote ? copySummary(rows.length, selection.count) : "Could not copy to the clipboard",
        wrote ? "success" : "warning",
      );
    } finally {
      setCopying(false);
    }
  }, [columns.visible, push, selection]);

  const reveal = useCallback(() => {
    if (trackId == null) return;
    void revealTrack(trackId).then((outcome) => {
      if (outcome) push(outcome.message, outcome.tone);
    });
  }, [push, trackId]);

  const exportList = useCallback(async () => {
    const save = window.cuepoint?.saveExportFileDialog;
    const write = window.cuepoint?.exportReviewList;
    if (!save || !write) {
      push(NEEDS_DESKTOP, "warning");
      return;
    }
    const extension = exportFormat === "excel" ? "xlsx" : exportFormat;
    setExporting(true);
    try {
      const picked = await save({ defaultPath: `review-list.${extension}`, format: extension });
      if (picked.canceled) return;
      // The save dialog has already asked about replacing a file that is
      // there, so the engine is told the answer rather than asking again.
      const written = await write({
        selection: selection.count > 0 ? batchSelection(selection.selection, query) : everything,
        format: exportFormat,
        file_path: picked.filePath,
        overwrite: true,
      });
      setExportOpen(false);
      push(exportedLine(written.count, written.file_path), "success");
    } catch (cause) {
      reportUnexpected(cause);
      push(userMessage(cause), "warning");
    } finally {
      setExporting(false);
    }
  }, [everything, exportFormat, push, query, selection]);

  return (
    <section className="match-table" aria-label="Table">
      <div className="match-table__head">
        <fieldset className="match-ticks match-ticks--table">
          <legend className="match-ticks__legend">Values to take</legend>
          {CARD_FIELDS.map((field) => (
            <label key={field} className="match-ticks__field">
              <input
                type="checkbox"
                checked={ticks.has(field)}
                disabled={busy}
                onChange={() => onToggleTick(field)}
              />
              <span>{field === "key" ? "Key (replaces yours)" : CARD_FIELD_LABELS[field]}</span>
            </label>
          ))}
        </fieldset>
        <p className="match-table__hint">Double-click a row to open it in One at a time.</p>
        {ticks.has("key") && replacing > 0 && (
          <p className="match-table__replacing" data-testid="replacing">
            Key is ticked: {replacing.toLocaleString()} hand-corrected{" "}
            {replacing === 1 ? "key" : "keys"} among the ticked tracks would be replaced
            {selected.all ? " (counting the tracks read so far)" : ""}.
          </p>
        )}
        <StatusLine status={status} busy={busy} onUndo={onUndo} />
      </div>

      <div className="match-table__grid">
        <TickContext.Provider value={tickValue}>
          <TrackTable<LibraryTrackRow>
            columns={columns.visible}
            source={list.source}
            widths={columns.widths}
            onWidthsChange={columns.setWidths}
            onColumnMove={columns.move}
            sort={{ key: order.sort, direction: order.dir }}
            onSortChange={(next) => onOrder({ sort: next.key, dir: next.direction })}
            selectedKeys={selectedKeys}
            getRowKey={(entry) => entry.id ?? -1}
            onSelect={(row, index, modifiers) => {
              selection.onRowClick(row, index, modifiers);
              onCursor(index);
            }}
            onRowActivate={(_row, index) => onOpen(index)}
            activeIndex={cursor}
            scrollToIndex={cursor}
            emptyState={emptyState}
            resetKey={queryKey(query)}
            ariaLabel="Match table"
          />
        </TickContext.Provider>
      </div>

      <div className="match-table__selection">
        <SelectionActions
          count={selection.count}
          describedByQuery={selection.selection.all}
          revealPath={revealPath}
          total={list.total}
          busy={copying}
          onCopy={() => void copy()}
          onReveal={reveal}
          onClear={selection.clear}
          onSelectAll={selection.selectAllMatching}
        />
        <Button variant="secondary" onClick={() => setColumnsOpen(true)}>
          Columns…
        </Button>
        <Button variant="secondary" disabled={list.total === 0} onClick={() => setExportOpen(true)}>
          Save review list as a file…
        </Button>
      </div>

      <ColumnPicker
        open={columnsOpen}
        onClose={() => setColumnsOpen(false)}
        columns={MATCH_COLUMNS}
        layout={columns.layout}
        onToggle={columns.toggle}
        onNudge={columns.nudge}
        onReset={columns.reset}
      />

      <Modal
        open={exportOpen}
        title="Save review list as a file"
        onClose={() => setExportOpen(false)}
        primaryAction={{
          label: "Choose where to save…",
          onClick: () => void exportList(),
          loading: exporting,
        }}
        secondaryAction={{ label: "Cancel", onClick: () => setExportOpen(false) }}
      >
        <p>
          {selection.count > 0
            ? `Saves the ${trackCount(selection.count)} selected`
            : `Saves the ${trackCount(list.total)} shown`}{" "}
          — with their match state and Beatport link — as a spreadsheet you can share or check by
          hand.
        </p>
        <Select
          label="Format"
          id="match-export-format"
          value={exportFormat}
          onChange={(event) => setExportFormat(event.target.value as ReviewExportFormat)}
          options={EXPORT_FORMATS}
        />
      </Modal>
    </section>
  );
}
