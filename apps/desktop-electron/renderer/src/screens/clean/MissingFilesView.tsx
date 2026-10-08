/**
 * Missing files (CLEAN-12, DEC-073).
 *
 * A `TrackTable` over the Library's browse, scoped to files the last check
 * found missing or unreadable at the path each track has now. Where each was
 * expected is a column; "show in folder" opens the nearest folder that still
 * exists; "check again" runs CLEAN-07's check over what is shown.
 *
 * **Nothing here fixes a file.** Relocation is Rekordbox's (DEC-073), and the
 * page gives the fix in three steps (CLN-8) rather than offering a control that
 * would have to be undone by the next refresh. The last step is a button to the
 * Library's Check Rekordbox for changes. A disconnected drive is one line above the
 * table, not four thousand rows to scroll past.
 */
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type {
  BatchSelection,
  CleanJobStarted,
  EntityKind,
  FileCheckStarted,
  LibraryHealth,
  LibraryTrackRow,
} from "../../api/cuepointBridge.types";
import { Button, useToast } from "../../components";
import { ColumnPicker, TrackTable, useColumnLayout } from "../../components/table";
import { useInspectorSlot } from "../../components/shell";
import { useReportSelectedTrack } from "../../components/shell/useReportSelectedTrack";
import { libraryRefreshState } from "../library/libraryLink";
import { SelectionActions } from "../library/SelectionActions";
import { TrackDetailPanel } from "../library/TrackDetailPanel";
import { batchSelection } from "../library/libraryBatch";
import { queryKey, type SortDirection } from "../library/libraryQuery";
import { copySummary, gatherTracksAsText, writeClipboard } from "../library/trackClipboard";
import { EMPTY_SELECTION, onlySelectedId, selectAll } from "../library/trackSelection";
import { useTrackDetail } from "../library/useTrackDetail";
import { useTrackSelection } from "../library/useTrackSelection";
import { useTrackWindow } from "../library/useTrackWindow";
import { MISSING_COLUMNS, MISSING_TABLE_LAYOUT_KEY } from "./cleanColumns";
import { missingEmptyState } from "./cleanEmpty";
import { trackCount } from "./cleanFormat";
import { MISSING_FILES_RULES, WHOLE_LIBRARY, cleanQuery } from "./cleanRules";
import { revealTrack } from "./revealTrack";
import { useCleanJob, type CleanMessageTone } from "./useCleanJob";

/** Every track in the library, as a selection. */
const WHOLE_LIBRARY_SELECTION: BatchSelection = { query: {} };

interface MissingFilesViewProps {
  health: LibraryHealth | null;
  onHealthChanged: () => void;
  /**
   * Open an artist's or a label's page from the Inspector's credits
   * (DISCOVER-11). Absent, they are text.
   */
  onOpenEntity?: (kind: EntityKind, ref: string) => void;
}

export function MissingFilesView({
  health,
  onHealthChanged,
  onOpenEntity,
}: MissingFilesViewProps) {
  const { push } = useToast();
  const navigate = useNavigate();
  const [order, setOrder] = useState<{ sort: string; dir: SortDirection }>({
    sort: "artist",
    dir: "asc",
  });
  const query = useMemo(() => cleanQuery(WHOLE_LIBRARY, MISSING_FILES_RULES, order), [order]);
  const columns = useColumnLayout<LibraryTrackRow>(MISSING_TABLE_LAYOUT_KEY, MISSING_COLUMNS);
  const window_ = useTrackWindow(query);
  const selection = useTrackSelection(query, window_.total, window_.source.getRow);
  const trackId = selection.selection.lastId;
  const detail = useTrackDetail(trackId);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  const message = useCallback(
    (text: string, tone: CleanMessageTone) => push(text, tone),
    [push],
  );
  const jobs = useCleanJob(message);

  const reveal = useCallback(
    (id: number | null) => {
      if (id == null) return;
      void revealTrack(id).then((outcome) => {
        if (outcome) push(outcome.message, outcome.tone);
      });
    },
    [push],
  );

  const check = useCallback(
    (key: string, target: BatchSelection) => {
      const bridge = window.cuepoint?.startFileCheck;
      if (!bridge) {
        push("Checking files needs the desktop app with CuePoint's library service running.", "warning");
        return;
      }
      void jobs.run<FileCheckStarted & CleanJobStarted>(
        key,
        () => bridge({ selection: target }),
        {
          started: (answer) => `Checking ${trackCount(answer.tracks)}.`,
          succeeded: "Finished checking files.",
          onEnded: () => {
            window_.reload();
            detail.reload();
            onHealthChanged();
          },
        },
      );
    },
    [detail, jobs, onHealthChanged, push, window_],
  );

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

  useInspectorSlot(
    <TrackDetailPanel
      detail={detail.detail}
      loading={detail.loading}
      error={detail.error}
      selectionCount={selection.count}
      onReveal={() => reveal(trackId)}
      onError={(text) => push(text, "warning")}
      onOpenEntity={onOpenEntity}
    />,
  );

  const selectedKeys = useMemo(() => {
    const keys = new Set<number>();
    for (let index = 0; index < window_.total; index += 1) {
      const entry = window_.source.getRow(index);
      if (!entry?.id) continue;
      if (selection.selection.all) {
        if (!selection.selection.excluded.has(entry.id)) keys.add(entry.id);
      } else if (selection.selection.ids.has(entry.id)) {
        keys.add(entry.id);
      }
    }
    return keys;
  }, [selection.selection, window_.source, window_.total]);

  const onlyId = onlySelectedId(selection.selection, window_.total);
  const onlyRow = useMemo(() => {
    if (onlyId == null) return null;
    for (let index = 0; index < window_.total; index += 1) {
      const entry = window_.source.getRow(index);
      if (entry?.id === onlyId) return entry;
    }
    return null;
  }, [onlyId, window_.source, window_.total]);

  useReportSelectedTrack(onlyRow?.id != null ? { id: onlyRow.id, key: onlyRow.effective_key ?? null } : null);

  const running = jobs.running !== null;
  const empty = missingEmptyState(health, window_.error);
  const roots = health?.unavailable_roots ?? [];

  const emptyState = (
    <div className="clean-empty">
      <p className="clean-empty__headline">{empty.headline}</p>
      {empty.hint && <p className="clean-empty__hint">{empty.hint}</p>}
      {empty.offer === "check_files" && (
        <Button
          variant="secondary"
          disabled={running}
          onClick={() => check("check-all", WHOLE_LIBRARY_SELECTION)}
        >
          Check every file
        </Button>
      )}
    </div>
  );

  return (
    <div className="clean-missing">
      <div className="clean-note">
        <ol className="clean-note__steps" aria-label="How to fix a missing file">
          <li>
            In Rekordbox, right-click the track, choose Relocate and point it at the file.
          </li>
          <li>In Rekordbox, choose File, then Export Collection in xml format.</li>
          <li>
            Here,{" "}
            <Button
              variant="secondary"
              onClick={() => navigate("/library", { state: libraryRefreshState() })}
            >
              Check Rekordbox for changes
            </Button>
            .
          </li>
        </ol>
        {roots.map((root) => (
          <p key={root.root} className="clean-note__finding" role="status">
            At the last check: {root.summary}.
          </p>
        ))}
      </div>

      <div className="clean-toolbar" role="toolbar" aria-label="Missing files">
        <span className="clean-toolbar__spacer" />
        <Button
          variant="secondary"
          disabled={window_.total === 0 || running}
          loading={jobs.running === "check-shown"}
          onClick={() =>
            check(
              "check-shown",
              selection.count > 0
                ? batchSelection(selection.selection, query)
                : batchSelection(selectAll(EMPTY_SELECTION), query),
            )
          }
        >
          {selection.count > 0 ? "Check selected again" : "Check these again"}
        </Button>
        <Button
          variant="secondary"
          disabled={running}
          loading={jobs.running === "check-all"}
          onClick={() => check("check-all", WHOLE_LIBRARY_SELECTION)}
        >
          Check every file
        </Button>
      </div>

      <div className="clean-missing__table">
        <TrackTable<LibraryTrackRow>
          columns={columns.visible}
          source={window_.source}
          widths={columns.widths}
          onWidthsChange={columns.setWidths}
          onColumnMove={columns.move}
          sort={{ key: order.sort, direction: order.dir }}
          onSortChange={(next) => setOrder({ sort: next.key, dir: next.direction })}
          selectedKeys={selectedKeys}
          getRowKey={(entry) => entry.id ?? -1}
          onSelect={selection.onRowClick}
          activeIndex={selection.selection.anchor}
          emptyState={emptyState}
          resetKey={queryKey(query)}
          ariaLabel="Missing files"
        />
      </div>

      <div className="clean-review__selection">
        <SelectionActions
          count={selection.count}
          describedByQuery={selection.selection.all}
          revealPath={onlyRow?.file_path ?? null}
          total={window_.total}
          busy={copying}
          onCopy={() => void copy()}
          onReveal={() => reveal(onlyId)}
          onClear={selection.clear}
          onSelectAll={selection.selectAllMatching}
        />
        <Button variant="secondary" onClick={() => setColumnsOpen(true)}>
          Columns…
        </Button>
      </div>

      <ColumnPicker
        open={columnsOpen}
        onClose={() => setColumnsOpen(false)}
        columns={MISSING_COLUMNS}
        layout={columns.layout}
        onToggle={columns.toggle}
        onNudge={columns.nudge}
        onReset={columns.reset}
      />
    </div>
  );
}
