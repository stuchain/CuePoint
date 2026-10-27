/**
 * Missing files (CLEAN-12, DEC-073).
 *
 * A `TrackTable` over the Library's browse, scoped to files the last check
 * found missing or unreadable at the path each track has now. Where each was
 * expected is a column; "show in folder" opens the nearest folder that still
 * exists. One check button at a time (K4): "Check every file" until files have
 * been checked, then "Check again", which reads "Check 12 again" and checks
 * those rows when some are selected, and checks every file when none are.
 *
 * **Nothing here fixes a file.** Relocation is Rekordbox's (DEC-073), and the
 * page gives the fix in three steps (CLN-8) rather than offering a control that
 * would have to be undone by the next refresh. The last step is a button to the
 * Library's Check for changes. A disconnected drive is one line above the
 * table, not four thousand rows to scroll past.
 *
 * **Nothing missing is one line** (K13): "All 300 files found · checked <time> ·
 * Check again". The steps, the table, its headers, "0 tracks" and Columns show
 * only when something is missing; before any check, the one "Check every file".
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
import { Button, EmptyState, Notice, useToast } from "../../components";
import { formatCount, plural } from "../../format/counts";
import { RETRY, couldNot } from "../../format/words";
import { formatDayTimeInSentence } from "../../format/dates";
import { displayPathNameFirst } from "../../format/paths";
import { LIBRARY_SUMMARY, useSharedRead } from "../../api/sharedReads";
import { ColumnPicker, TrackTable, useColumnLayout } from "../../components/table";
import { useInspectorSlot } from "../../components/shell";
import { useReportSelectedTrack } from "../../components/shell/useReportSelectedTrack";
import { libraryRefreshState } from "../library/libraryLink";
import { SelectionActions } from "../library/SelectionActions";
import { TrackDetailPanel } from "../library/TrackDetailPanel";
import { batchSelection } from "../library/libraryBatch";
import { queryKey, type SortDirection } from "../library/libraryQuery";
import { copySummary, gatherTracksAsText, writeClipboard } from "../library/trackClipboard";
import { onlySelectedId } from "../library/trackSelection";
import { useTrackDetail } from "../library/useTrackDetail";
import { useTrackSelection } from "../library/useTrackSelection";
import { useTrackWindow } from "../library/useTrackWindow";
import { MISSING_COLUMNS, MISSING_TABLE_LAYOUT_KEY } from "./cleanColumns";
import { trackCount } from "./cleanFormat";
import { checkedLine, lastRun, missingEmptyState } from "./cleanEmpty";
import { MISSING_FILES_RULES, WHOLE_LIBRARY, cleanQuery } from "./cleanRules";
import { revealTrack } from "./revealTrack";
import { useCleanJob, type CleanMessageTone } from "./useCleanJob";
import { needsDesktopApp } from "../../api/userMessage";

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
  // Step 2 names the file to save over, so the person need not remember it (M158).
  const sourcePath = useSharedRead(LIBRARY_SUMMARY).value?.source?.xml_path ?? null;
  const copySourcePath = useCallback(async () => {
    if (!sourcePath) return;
    const wrote = await writeClipboard(sourcePath);
    push(wrote ? "Copied the path" : couldNot("copy to the clipboard"), wrote ? "success" : "warning");
  }, [push, sourcePath]);

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
        push(needsDesktopApp(), "warning");
        return;
      }
      void jobs.run<FileCheckStarted & CleanJobStarted>(
        key,
        () => bridge({ selection: target }),
        {
          started: (answer) => `Checking ${trackCount(answer.tracks)}`,
          succeeded: "Finished checking files",
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
        wrote ? copySummary(rows.length, selection.count) : couldNot("copy to the clipboard"),
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
  // Files never checked is the engine's own answer (`cleanEmpty.ts`): until then
  // the one check button is "Check every file" (K4).
  const neverChecked = empty.offer === "check_files";

  const checkButton = neverChecked ? (
    <Button
      variant="secondary"
      className="cp-btn--framed"
      disabled={running}
      loading={jobs.running === "check-all"}
      onClick={() => check("check-all", WHOLE_LIBRARY_SELECTION)}
    >
      Check every file
    </Button>
  ) : (
    <Button
      variant="secondary"
      className="cp-btn--framed"
      disabled={running}
      loading={jobs.running === "check-again"}
      onClick={() =>
        check(
          "check-again",
          selection.count > 0 ? batchSelection(selection.selection, query) : WHOLE_LIBRARY_SELECTION,
        )
      }
    >
      {selection.count > 0 ? `Check ${formatCount(selection.count)} again` : "Check again"}
    </Button>
  );

  // K13: the last check found nothing missing, and the loaded list agrees. One
  // line with the one button; the steps and the table have nothing to say. Health
  // says only whether files were ever checked. Until the list has loaded, the
  // button alone, so the steps do not flash up for a library with nothing missing.
  if (!neverChecked && !window_.error && (!window_.answered || window_.total === 0)) {
    const found = health?.track_count ?? 0;
    const lastChecked = health ? lastRun(health, "files") : undefined;
    const checkedBar = lastChecked ? checkedLine(lastChecked) : "";
    return (
      <div className="clean-missing clean-missing--clear">
        <div className="cp-toolbar" role="toolbar" aria-label="Missing files">
          {/* Status on the left, the button on the right (C235). */}
          {window_.answered && checkedBar && (
            <span className="clean-toolbar__status" role="status">
              {checkedBar}
            </span>
          )}
          <span className="clean-toolbar__spacer" />
          {checkButton}
        </div>
        {window_.answered && (
          <EmptyState
            tone="clear"
            icon="clean"
            headline="No missing files"
            // Said with when it was true: a check from last month is not a statement about today (M156).
            description={
              lastChecked && formatDayTimeInSentence(lastChecked)
                ? `All ${plural(found, "file")} ${found === 1 ? "was" : "were"} where your library says ${formatDayTimeInSentence(lastChecked)}. Check again to be sure.`
                : `All ${plural(found, "file")} ${found === 1 ? "was" : "were"} where your library says.`
            }
          />
        )}
      </div>
    );
  }

  // A failed read is a red notice with Try again, the same on every page (C142).
  const emptyState = window_.error ? (
    <Notice kind="danger" action={<Button variant="secondary" onClick={window_.reload}>{RETRY}</Button>}>
      {window_.error}
    </Notice>
  ) : (
    <EmptyState compact icon={neverChecked ? "search" : undefined} headline={empty.headline} description={empty.hint ?? undefined} />
  );

  return (
    <div className="clean-missing">
      <div className="clean-note">
        <ol className="clean-note__steps" aria-label="How to fix a missing file">
          <li>
            In Rekordbox, right-click the track, choose Relocate and point it at the file.
          </li>
          <li>
            In Rekordbox, choose File, then Export Collection in xml format
            {sourcePath ? (
              <>
                , saving over <strong>{displayPathNameFirst(sourcePath)}</strong>{" "}
                <Button variant="quiet" size="sm" onClick={() => void copySourcePath()}>
                  Copy path
                </Button>
              </>
            ) : null}
            .
          </li>
          <li>
            Here,{" "}
            <Button
              variant="secondary"
              onClick={() => navigate("/library", { state: libraryRefreshState() })}
            >
              Check for changes in the Library
            </Button>
            .
          </li>
        </ol>
        {roots.map((root) => (
          <Notice key={root.root} kind="warning">
            At the last check: {root.summary}.
          </Notice>
        ))}
      </div>

      <div className="cp-toolbar" role="toolbar" aria-label="Missing files">
        <span className="cp-count" role="status">
          {plural(window_.total, "file")} missing
        </span>
        {checkButton}
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
          onSelectAll={selection.selectAllMatching}
          activeIndex={selection.selection.anchor}
          emptyState={emptyState}
          onColumns={() => setColumnsOpen(true)}
          resetKey={queryKey(query)}
          ariaLabel="Missing files"
        />
      </div>

      <div className="cp-toolbar clean-review__selection">
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
      </div>

      <ColumnPicker
        open={columnsOpen}
        onClose={() => setColumnsOpen(false)}
        columns={MISSING_COLUMNS}
        layout={columns.layout}
        onToggle={columns.toggle}
        onNudge={columns.nudge}
        onReset={columns.reset}
        onRestore={columns.restore}
      />
    </div>
  );
}
