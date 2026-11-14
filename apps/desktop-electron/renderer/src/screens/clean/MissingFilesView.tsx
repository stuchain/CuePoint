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
 * would have to be undone by the next refresh. The last step is the Library's
 * Check for changes, run here (M157): the export's changes are shown and applied
 * in place, the check of every file the engine runs after a refresh is waited
 * for, and the toolbar says "3 fixed · 1 still missing". A disconnected drive is
 * one line above the table, not four thousand rows to scroll past.
 *
 * **Nothing missing is one line** (K13): "All 300 files found · checked <time> ·
 * Check again". The steps, the table, its headers, "0 tracks" and Columns show
 * only when something is missing; before any check, the one "Check every file".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  BatchSelection,
  CleanJobStarted,
  EntityKind,
  FileCheckStarted,
  FileFindResult,
  LibraryHealth,
  LibraryTrackRow,
  RefreshDiff,
} from "../../api/cuepointBridge.types";
import { Button, EmptyState, Notice, useToast } from "../../components";
import { TrackContextMenu, type TrackContextMenuItem } from "../../components/TrackContextMenu";
import { inspectorShown } from "../../api/menuViewState";
import { emitShellCommand } from "../../components/shell/shellCommands";
import { formatCount, plural } from "../../format/counts";
import { RETRY, couldNot } from "../../format/words";
import { formatDayTimeInSentence } from "../../format/dates";
import { displayPathNameFirst } from "../../format/paths";
import { LIBRARY_SUMMARY, useSharedRead } from "../../api/sharedReads";
import { ColumnPicker, TrackTable, useColumnLayout } from "../../components/table";
import { useInspectorSlot } from "../../components/shell";
import { useReportSelectedTrack } from "../../components/shell/useReportSelectedTrack";
import { followJob } from "../library/followJob";
import { jobErrorMessage } from "../library/libraryFormat";
import { RefreshPreviewDialog } from "../library/RefreshPreviewDialog";
import { SelectionActions } from "../library/SelectionActions";
import { TrackDetailPanel } from "../library/TrackDetailPanel";
import { batchSelection } from "../library/libraryBatch";
import { browseParams, queryKey, type SortDirection } from "../library/libraryQuery";
import { copySummary, gatherTracksAsText, writeClipboard } from "../library/trackClipboard";
import { isSelected, onlySelectedId } from "../library/trackSelection";
import { useTrackDetail } from "../library/useTrackDetail";
import { useTrackSelection } from "../library/useTrackSelection";
import { useTrackWindow } from "../library/useTrackWindow";
import {
  MISSING_COLUMNS,
  MISSING_TABLE_LAYOUT_KEY,
  missingColumns,
  type FoundFile,
} from "./cleanColumns";
import { fixedLine, foundStatus, foundToast, trackCount } from "./cleanFormat";
import { checkedLine, lastRun, missingEmptyState } from "./cleanEmpty";
import { MISSING_FILES_RULES, WHOLE_LIBRARY, cleanQuery } from "./cleanRules";
import { revealTrack } from "./revealTrack";
import { useCleanJob, type CleanMessageTone } from "./useCleanJob";
import { needsDesktopApp, userMessage } from "../../api/userMessage";
import { reportUnexpected } from "../../reporting/reporting";

/** Every track in the library, as a selection. */
const WHOLE_LIBRARY_SELECTION: BatchSelection = { query: {} };

/** How long to look for the check the engine starts after a refresh, before going on without it. */
const FOLLOW_UP_TRIES = 5;
const FOLLOW_UP_WAIT_MS = 300;


/**
 * Wait for the check of every file that the engine starts once a refresh has been applied
 * (DEC-073), so the count after it is the new one. It starts a moment after the refresh ends, so it
 * is looked for a few times; when there is none (a check could not start), there is nothing to wait for.
 */
async function followUpCheck(): Promise<void> {
  const list = window.cuepoint?.listJobs;
  if (!list) return;
  for (let attempt = 0; attempt < FOLLOW_UP_TRIES; attempt += 1) {
    try {
      const check = (await list({ state: "active" })).jobs.find((job) => job.type === "file_check");
      if (check) {
        await followJob(check.id).finished;
        return;
      }
    } catch (cause) {
      reportUnexpected(cause);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, FOLLOW_UP_WAIT_MS));
  }
}

/** What a stopped find says: it looked and changed nothing, and keeps the files it had found. */
const STOPPED_FIND = "Stopped looking. Nothing was changed.";

/** What the find's start gives back, whether or not the person chose a folder. */
interface FindAnswer {
  canceled: boolean;
  job_id?: string;
  id?: string;
  folder?: string;
}

/** A right-click on a row: where, which row, and whether it was a group the row belongs to. */
interface RowMenu {
  x: number;
  y: number;
  row: LibraryTrackRow;
  group: boolean;
}

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
  const [order, setOrder] = useState<{ sort: string; dir: SortDirection }>({
    sort: "artist",
    dir: "asc",
  });
  const query = useMemo(() => cleanQuery(WHOLE_LIBRARY, MISSING_FILES_RULES, order), [order]);
  // Where a find saw files (DEC-073): shown on the rows, never written anywhere. A check, or a
  // refresh that changed the paths, makes it stale, so those clear it.
  const [foundAll, setFound] = useState<ReadonlyMap<number, FoundFile>>(() => new Map());
  // The find that was started and has not been read yet; and whether this view stopped following it
  // because it was hidden (Activity runs the cleanup), so showing it again picks it up.
  const [finding, setFinding] = useState(false);
  const pendingFind = useRef<{ jobId: string; wanted: number } | null>(null);
  const orphaned = useRef(false);
  const [menu, setMenu] = useState<RowMenu | null>(null);
  const window_ = useTrackWindow(query);
  const selection = useTrackSelection(query, window_.total, window_.source.getRow);
  const trackId = selection.selection.lastId;
  const detail = useTrackDetail(trackId);
  // What is found counts only for rows still in the list: once every row is loaded, a found track
  // that is no longer missing (a refresh fixed it, the list reloaded without it) is dropped.
  const loadedRows = useMemo(() => {
    const ids = new Set<number>();
    const unreadable = new Set<number>();
    let loadedAll = true;
    for (let index = 0; index < window_.total; index += 1) {
      const entry = window_.source.getRow(index);
      if (entry?.id == null) {
        loadedAll = false;
        continue;
      }
      ids.add(entry.id);
      if (entry.file_status === "unreadable") unreadable.add(entry.id);
    }
    return { ids, unreadable, loadedAll: loadedAll && !window_.stale };
    // Rows arrive after the first render of a new answer: `loadedRows` and `identity` say so.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [window_.source, window_.total, window_.loadedRows, window_.identity, window_.stale]);
  const found = useMemo(() => {
    if (!loadedRows.loadedAll) return foundAll;
    const kept = new Map([...foundAll].filter(([id]) => loadedRows.ids.has(id)));
    return kept.size === foundAll.size ? foundAll : kept;
  }, [foundAll, loadedRows]);
  // Forget what is no longer in the list, so it does not come back if the track is missing again.
  useEffect(() => {
    if (found !== foundAll) setFound(found);
  }, [found, foundAll]);
  const columnDefs = useMemo(() => missingColumns(found), [found]);
  const columns = useColumnLayout<LibraryTrackRow>(MISSING_TABLE_LAYOUT_KEY, columnDefs);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  // Check for changes, in place (M157): the export's changes to confirm, and what they fixed.
  const [refreshDiff, setRefreshDiff] = useState<RefreshDiff | null>(null);
  const [fixed, setFixed] = useState<string | null>(null);

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

  const copyText = useCallback(
    async (text: string, what: string) => {
      const wrote = await writeClipboard(text);
      push(wrote ? `Copied ${what}` : couldNot("copy to the clipboard"), wrote ? "success" : "warning");
    },
    [push],
  );

  // The page names the find and the track; the desktop shell reads the path from that find's
  // own result, so no path goes from here to the shell.
  const showFoundFile = useCallback(
    (trackId: number, hit: FoundFile) => {
      const show = window.cuepoint?.showFoundFile;
      if (!show) {
        push(needsDesktopApp("Showing a file"), "warning");
        return;
      }
      void Promise.resolve(show(hit.jobId, trackId))
        .then((shown) => {
          if (!shown) push("That file is not in the last search's results any more", "warning");
        })
        .catch((cause: unknown) => {
          reportUnexpected(cause);
          push(userMessage(cause), "warning");
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
            // Only what was checked is forgotten; other rows keep where they were found.
            const ids = target.track_ids;
            setFound((previous) => {
              if (!ids) return new Map();
              const next = new Map(previous);
              for (const id of ids) next.delete(id);
              return next;
            });
            window_.reload();
            detail.reload();
            onHealthChanged();
          },
        },
      );
    },
    [detail, jobs, onHealthChanged, push, window_],
  );

  // Read what a finished find says and show it on the rows.
  const applyFind = useCallback(
    async (jobId: string, wanted: number, skipped = 0, stopped = false) => {
      const results = window.cuepoint?.getJobResults;
      if (!results) return;
      try {
        const result = (await results(jobId)).result as FileFindResult | undefined;
        if (!result) {
          if (!stopped) push("The search finished without a result.", "warning");
          return;
        }
        setFound((previous) => {
          const next = new Map(previous);
          for (const hit of result.found) next.set(hit.track_id, { path: hit.path, folder: result.folder, jobId });
          return next;
        });
        // A stopped find has already said so; what it had found stays on the rows.
        if (stopped) return;
        push(
          foundToast(wanted, result.found.length, result.folder, {
            ambiguous: result.ambiguous.length,
            truncated: result.truncated,
            skipped,
          }),
          result.found.length > 0 ? "success" : "info",
        );
      } catch (cause) {
        reportUnexpected(cause);
        push(userMessage(cause, "Could not read what was found"), "warning");
      }
    },
    [push],
  );
  const latest = useRef({ push, applyFind });
  useEffect(() => {
    latest.current = { push, applyFind };
  });

  // Find in a folder (DEC-073). The desktop shell opens the folder picker itself and says which
  // folder was chosen; this never names a path. It shows where files are now and changes nothing:
  // pointing Rekordbox at them is its Relocate. `targeted` is how many rows the person pointed at,
  // so the answer can say how many were unreadable and so not looked for.
  const find = useCallback(
    (target: BatchSelection, targeted: number) => {
      const bridge = window.cuepoint?.startFileFind;
      if (!bridge || !window.cuepoint?.getJobResults) {
        push(needsDesktopApp(), "warning");
        return;
      }
      void (async () => {
        let endedStopped = false;
        const done = await jobs.run<FindAnswer>(
          "find",
          async () => {
            const answer = await bridge({ selection: target });
            if (!answer.canceled) {
              pendingFind.current = { jobId: answer.job_id as string, wanted: answer.tracks as number };
              setFinding(true);
            }
            return answer as FindAnswer;
          },
          {
            stopped: STOPPED_FIND,
            onEnded: (outcome) => {
              endedStopped = outcome.state === "cancelled";
            },
          },
        );
        // Only reached while this view is showing: a hidden view's follower is stopped, and the
        // effect below picks the job up when the view is back.
        const pending = pendingFind.current;
        pendingFind.current = null;
        setFinding(false);
        if (done && pending) {
          await applyFind(pending.jobId, pending.wanted, Math.max(0, targeted - pending.wanted));
        } else if (endedStopped && pending) {
          // The job kept what it had settled before it was stopped; show those rows.
          await applyFind(pending.jobId, pending.wanted, 0, true);
        }
      })();
    },
    [applyFind, jobs, push],
  );

  // This view hid while a find ran (Clean's tabs and pages are kept in Activity, which runs the
  // cleanups): the follower stopped and nothing would read the result. Showing it again follows
  // the same job, which may have finished meanwhile, and reads it then.
  useEffect(() => {
    let live = true;
    let handle: ReturnType<typeof followJob> | null = null;
    const pending = pendingFind.current;
    if (pending && orphaned.current) {
      orphaned.current = false;
      setFinding(true);
      handle = followJob(pending.jobId);
      void handle.finished.then(async (outcome) => {
        if (!live) return;
        pendingFind.current = null;
        setFinding(false);
        if (outcome.state === "succeeded") {
          await latest.current.applyFind(pending.jobId, pending.wanted);
        } else if (outcome.state === "cancelled") {
          latest.current.push(STOPPED_FIND, "info");
          await latest.current.applyFind(pending.jobId, pending.wanted, 0, true);
        } else {
          latest.current.push(jobErrorMessage(outcome.error), "warning");
        }
      });
    }
    return () => {
      live = false;
      handle?.stop();
      if (pendingFind.current) orphaned.current = true;
    };
  }, []);

  const checkForChanges = useCallback(async () => {
    const start = window.cuepoint?.startLibraryRefreshPreview;
    const results = window.cuepoint?.getJobResults;
    if (!start || !results) {
      push(needsDesktopApp(), "warning");
      return;
    }
    setFixed(null);
    setFound(new Map());
    let jobId: string | null = null;
    const done = await jobs.run("refresh-check", async () => {
      const answer = await start({});
      jobId = answer.job_id;
      return answer;
    });
    if (!done || !jobId) return;
    try {
      const previewed = (await results(jobId)).result as RefreshDiff | undefined;
      if (!previewed) {
        push("The check finished without a result.", "warning");
        return;
      }
      if (previewed.is_empty) {
        push("Your Rekordbox file has no changes", "info");
        return;
      }
      setRefreshDiff(previewed);
    } catch (cause) {
      reportUnexpected(cause);
      push(userMessage(cause, "Could not read the preview"), "warning");
    }
  }, [jobs, push]);

  const missingNow = useCallback(async (): Promise<number | null> => {
    const browse = window.cuepoint?.browseLibrary;
    if (!browse) return null;
    try {
      return (await browse(browseParams(query, 0, 1))).total;
    } catch (cause) {
      reportUnexpected(cause);
      return null;
    }
  }, [query]);

  const applyChanges = useCallback(
    async ({ confirmReferences }: { confirmReferences: boolean }) => {
      const apply = window.cuepoint?.startLibraryRefreshApply;
      const diff = refreshDiff;
      if (!apply || !diff) return;
      const before = window_.total;
      const done = await jobs.run("refresh-apply", () =>
        apply({ diff_id: diff.diff_id, confirm_references: confirmReferences }),
      );
      setRefreshDiff(null);
      if (!done) return;
      setFound(new Map());
      await followUpCheck();
      const left = await missingNow();
      if (left !== null) setFixed(fixedLine(before, left));
      window_.reload();
      detail.reload();
      onHealthChanged();
    },
    [detail, jobs, missingNow, onHealthChanged, refreshDiff, window_],
  );

  const refreshDialog = (
    <RefreshPreviewDialog
      open={refreshDiff !== null}
      diff={refreshDiff}
      applying={jobs.running === "refresh-apply"}
      onCancel={() => setRefreshDiff(null)}
      onApply={(options) => void applyChanges(options)}
    />
  );

  // M220: the artwork read, moved here from Statistics (which only reads). Every track, as the
  // read is of files and not of Collections.
  const readArtwork = useCallback(() => {
    const bridge = window.cuepoint?.startArtworkScan;
    if (!bridge) {
      push(needsDesktopApp(), "warning");
      return;
    }
    void jobs.run<CleanJobStarted>("artwork_scan", () => bridge({ selection: { query: {} } }), {
      succeeded: "Finished reading artwork",
      onEnded: onHealthChanged,
    });
  }, [jobs, onHealthChanged, push]);

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

  // Nothing missing, nothing to show details of: the slot is left empty, so no Details shows (M490).
  useInspectorSlot(
    window_.total === 0 ? null : (
      <TrackDetailPanel
        detail={detail.detail}
        loading={detail.loading}
        error={detail.error}
        selectionCount={selection.count}
        onReveal={() => reveal(trackId)}
        onError={(text) => push(text, "warning")}
        onOpenEntity={onOpenEntity}
      />
    ),
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

  const running = jobs.running !== null || finding;
  const unreadableReason =
    "Only missing files can be looked for. An unreadable file is there but cannot be opened";
  // Find looks for missing files only, so it is off when every row it would look at is unreadable
  // (known for the rows that are loaded).
  const everySelectedUnreadable =
    selection.count > 0 &&
    selectedKeys.size === selection.count &&
    [...selectedKeys].every((id) => loadedRows.unreadable.has(id));
  const wholeListUnreadable =
    window_.total > 0 && loadedRows.loadedAll && loadedRows.unreadable.size === window_.total;
  const findBlocked = selection.count > 0 ? everySelectedUnreadable : wholeListUnreadable;
  const onlyFound = onlyId != null ? found.get(onlyId) : undefined;

  /** Right-click: the row joins the selection first when it is not in it, as the Library does. */
  const openRowMenu = (row: LibraryTrackRow, _index: number, anchor: { x: number; y: number }) => {
    // The table has already selected a row that was outside the selection, so this reads the
    // selection as it was when the menu was asked for, as the Library does.
    const inSelection = row.id != null && isSelected(selection.selection, row.id);
    setMenu({ ...anchor, row, group: inSelection && selection.count > 1 });
  };

  const rowMenuItems = (open: RowMenu): TrackContextMenuItem[] => {
    const { row, group } = open;
    const here = row.id != null ? found.get(row.id) : undefined;
    const target: BatchSelection = group
      ? batchSelection(selection.selection, query)
      : { track_ids: row.id == null ? [] : [row.id] };
    const one = "Select one track";
    const items: TrackContextMenuItem[] = [
      {
        id: "find",
        label: group ? "Find them in a folder…" : "Find it in a folder…",
        title: "Look for the file in a folder you choose. Nothing is changed.",
        disabled: running || (group ? everySelectedUnreadable : row.file_status === "unreadable"),
        reason: running ? "Another task is running" : unreadableReason,
        onSelect: () => find(target, group ? selection.count : 1),
      },
    ];
    if (here) {
      items.push(
        {
          id: "show-found",
          label: "Show found file",
          disabled: group,
          reason: one,
          onSelect: () => showFoundFile(row.id as number, here),
        },
        {
          id: "copy-found",
          label: "Copy found path",
          disabled: group,
          reason: one,
          onSelect: () => void copyText(here.path, "the path"),
        },
      );
    }
    items.push(
      {
        id: "show-expected",
        label: "Show expected folder",
        separatorBefore: true,
        disabled: group || row.id == null,
        reason: one,
        onSelect: () => reveal(row.id ?? null),
      },
      {
        id: "copy-expected",
        label: "Copy expected path",
        disabled: group || !row.file_path,
        reason: one,
        onSelect: () => void copyText(row.file_path ?? "", "the path"),
      },
      {
        id: "check-again",
        label: group ? `Check ${formatCount(selection.count)} again` : "Check again",
        separatorBefore: true,
        disabled: running,
        reason: "Another task is running",
        onSelect: () => check("check-again", target),
      },
      {
        id: "details",
        label: "Show details",
        disabled: group,
        reason: one,
        onSelect: () => {
          if (!inspectorShown()) emitShellCommand("toggle-inspector");
        },
      },
    );
    return items;
  };

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

  const artworkRead = health ? lastRun(health, "artwork") : undefined;
  const findButton = (
    <Button
      variant="secondary"
      className="cp-btn--framed"
      disabled={running || findBlocked}
      loading={jobs.running === "find" || finding}
      title={
        findBlocked
          ? unreadableReason
          : "Look for the missing files in a folder you choose. Nothing is changed; Rekordbox's Relocate does that."
      }
      onClick={() =>
        find(
          selection.count > 0 ? batchSelection(selection.selection, query) : WHOLE_LIBRARY_SELECTION,
          selection.count > 0 ? selection.count : window_.total,
        )
      }
    >
      Find in a folder…
    </Button>
  );

  const readButton = (
    <Button
      variant="secondary"
      className="cp-btn--framed"
      disabled={running}
      loading={jobs.running === "artwork_scan"}
      onClick={readArtwork}
    >
      {artworkRead ? "Read artwork again" : "Read artwork"}
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
          {/* Status on the left, the button on the right (C235). Just after Check for changes, what
              it fixed (M157). */}
          {window_.answered && (fixed ?? checkedBar) && (
            <span className="clean-toolbar__status" role="status">
              {fixed ?? checkedBar}
            </span>
          )}
          <span className="clean-toolbar__spacer" />
          {checkButton}
          {readButton}
        </div>
        {window_.answered && (
          <EmptyState
            tone="clear"
            icon="clean"
            // The last check's answer, not a statement about today (M156).
            headline="No missing files at the last check"
            // Said with when it was true: a check from last month is not a statement about today (M156).
            description={
              lastChecked && formatDayTimeInSentence(lastChecked)
                ? `All ${plural(found, "file")} ${found === 1 ? "was" : "were"} where your library says ${formatDayTimeInSentence(lastChecked)}. Check again to be sure.`
                : `All ${plural(found, "file")} ${found === 1 ? "was" : "were"} where your library says.`
            }
          />
        )}
        {refreshDialog}
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
            {found.size > 0 && <> <strong>Found</strong> rows show where it is now.</>}
          </li>
          <li>
            In Rekordbox, choose File, then Export Collection in XML format
            {sourcePath ? (
              <>
                , saving over <strong>{displayPathNameFirst(sourcePath)}</strong>{" "}
                <Button variant="quiet" size="sm" className="clean-note__copy" onClick={() => void copySourcePath()}>
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
              disabled={running}
              loading={jobs.running === "refresh-check" || jobs.running === "refresh-apply"}
              onClick={() => void checkForChanges()}
            >
              Check for changes
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
          {found.size > 0 && (
            <span className="clean-found-status">
              {" · "}
              {foundStatus(found.size, [...found.values()].map((hit) => hit.folder))}
            </span>
          )}
        </span>
        {fixed && (
          <span className="clean-toolbar__status" role="status">
            {fixed}
          </span>
        )}
        {findButton}
        {checkButton}
        {readButton}
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
          onRowActivate={(row) => {
            if (row.id == null || running) return;
            if (row.file_status === "unreadable") {
              push(unreadableReason, "info");
              return;
            }
            find({ track_ids: [row.id] }, 1);
          }}
          onRowContextMenu={openRowMenu}
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
          leadingActions={
            <Button
              variant="secondary"
              disabled={running || findBlocked}
              loading={jobs.running === "find" || finding}
              title={findBlocked ? unreadableReason : undefined}
              onClick={() => find(batchSelection(selection.selection, query), selection.count)}
            >
              {selection.count > 1 ? "Find them…" : "Find it…"}
            </Button>
          }
          extraActions={
            <>
              {onlyFound && (
                <>
                  <Button variant="secondary" onClick={() => showFoundFile(onlyId as number, onlyFound)}>
                    Show found file
                  </Button>
                  <Button variant="secondary" onClick={() => void copyText(onlyFound.path, "the path")}>
                    Copy found path
                  </Button>
                </>
              )}
              {onlyRow?.file_path && (
                <Button variant="secondary" onClick={() => void copyText(onlyRow.file_path ?? "", "the path")}>
                  Copy expected path
                </Button>
              )}
            </>
          }
        />
      </div>

      {menu && (
        <TrackContextMenu
          x={menu.x}
          y={menu.y}
          label={menu.group ? `Actions for ${formatCount(selection.count)} tracks` : "Track actions"}
          items={rowMenuItems(menu)}
          onClose={() => setMenu(null)}
        />
      )}

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
      {refreshDialog}
    </div>
  );
}
