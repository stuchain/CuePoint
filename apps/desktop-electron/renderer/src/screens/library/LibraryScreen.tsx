/**
 * The Library page (LIBRARY-11, then LIBUI-10 / DEC-039).
 *
 * LIBRARY-11 built this as counts and controls, and said in as many words that
 * it was deliberately *not* a track table — Phase 4 would build browsing. This
 * is Phase 4: the page is now the browser. The playlist tree scopes it, the
 * filter bar narrows it, the table shows it a window at a time, and the
 * Inspector says everything about whatever is selected.
 *
 * What did not change is the import and refresh flow: the same job handling,
 * the same DEC-032 preview, and every sentence still from `libraryFormat.ts`.
 * It is compressed into a header (`LibraryHeader`) rather than rewritten,
 * because whether a user understands what a refresh deletes is decided by
 * those words.
 *
 * The page holds one thing — the query — and hands it to everything else. Each
 * part was built to be handed exactly that and nothing more.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Button,
  Panel,
  TrackContextMenu,
  type TrackContextMenuItem,
  useToast,
} from "../../components";
import {
  ColumnPicker,
  LIBRARY_TABLE_LAYOUT_KEY,
  TrackTable,
  useColumnLayout,
} from "../../components/table";
import { useInspectorSlot } from "../../components/shell";
import type {
  CollectionNode,
  FilterRuleSet,
  LibraryPlaylistNode,
  LibrarySummary,
  LibraryTrackRow,
  RefreshApplied,
  RefreshDiff,
} from "../../api/cuepointBridge.types";
import { FilterBar } from "./FilterBar";
import { LibraryHeader } from "./LibraryHeader";
import { LIBRARY_COLUMNS } from "./libraryColumns";
import { LibraryPane } from "./LibraryPane";
import { RefreshPreviewDialog } from "./RefreshPreviewDialog";
import { SelectionActions } from "./SelectionActions";
import { QUEUE_ACTION_LIMIT, useLibraryPlayback } from "./useLibraryPlayback";
import { TrackDetailPanel } from "./TrackDetailPanel";
import { defaultSortForScope, findByPath } from "./playlistTree";
import { defaultSortForCollection, findCollection } from "./collectionTree";
import { useCollectionTree } from "./useCollectionTree";
import { followJob } from "./followJob";
import { appliedLine, jobErrorMessage } from "./libraryFormat";
import { DEFAULT_LIBRARY_QUERY, type LibraryQuery, queryKey } from "./libraryQuery";
import { copySummary, tracksAsText, writeClipboard } from "./trackClipboard";
import { onlySelectedId } from "./trackSelection";
import { useFacet, useFilterVocabulary } from "./useFilterVocabulary";
import { usePlaylistTree } from "./usePlaylistTree";
import { useTrackDetail } from "./useTrackDetail";
import { COPY_LIMIT, useTrackSelection } from "./useTrackSelection";
import { useTrackWindow } from "./useTrackWindow";
import "../screens.css";
import "./library.css";

/** What the page is doing, when it is doing something. */
type Busy = null | "importing" | "checking" | "applying";

const BUSY_LABEL: Record<Exclude<Busy, null>, string> = {
  importing: "Importing…",
  checking: "Checking…",
  applying: "Refreshing…",
};

export interface LibraryScreenProps {
  /** Opens the "how do I export from Rekordbox" dialog the shell owns. */
  onOpenRekordboxInstructions?: () => void;
}

export function LibraryScreen({ onOpenRekordboxInstructions }: LibraryScreenProps) {
  const { push } = useToast();
  const [summary, setSummary] = useState<LibrarySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [diff, setDiff] = useState<RefreshDiff | null>(null);
  const [lastApplied, setLastApplied] = useState<RefreshApplied | null>(null);
  const [query, setQuery] = useState<LibraryQuery>(DEFAULT_LIBRARY_QUERY);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copying, setCopying] = useState(false);

  const watching = useRef<{ stop: () => void }[]>([]);
  const mounted = useRef(true);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const handle of watching.current) handle.stop();
      watching.current = [];
    };
  }, []);

  const loadSummary = useCallback(async () => {
    const bridge = window.cuepoint;
    if (!bridge?.getLibrarySummary) {
      setSummary(null);
      setLoading(false);
      return;
    }
    try {
      const payload = await bridge.getLibrarySummary();
      if (mounted.current) setSummary(payload);
    } catch (error) {
      if (mounted.current) {
        push(error instanceof Error ? error.message : "Could not read the library", "warning");
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [push]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  // ---------------------------------------------------------------- browsing

  const playlists = usePlaylistTree();
  const collections = useCollectionTree();
  const { vocabulary } = useFilterVocabulary();
  const facet = useFacet(query);
  const columns = useColumnLayout<LibraryTrackRow>(
    LIBRARY_TABLE_LAYOUT_KEY,
    LIBRARY_COLUMNS,
  );
  const window_ = useTrackWindow(query);
  const selection = useTrackSelection(query, window_.total, window_.source.getRow);
  const playback = useLibraryPlayback({
    query,
    onMessage: (message) => push(message, "info"),
  });
  const [menu, setMenu] = useState<{ x: number; y: number; rows: LibraryTrackRow[]; index: number } | null>(
    null,
  );
  const detail = useTrackDetail(selection.selection.lastId);

  const scopeTo = useCallback(
    (node: LibraryPlaylistNode | null) => {
      // The pane hands over a tree node and the Inspector hands over a plain
      // playlist; both are the same node, and the tree is where its children
      // live, so it is looked up rather than cast.
      const inTree = node ? findByPath(playlists.tree, node.path) : null;
      playlists.select(inTree);
      // One scope at a time in the pane. The engine would AND the two
      // (ORG-08), but a user who clicks a playlist means the playlist, and a
      // Collection still highlighted beside it would be a lie about what the
      // table is showing.
      collections.select(null);
      setQuery((previous) => ({
        ...previous,
        playlistId: node?.id ?? null,
        scope: null,
        collectionId: null,
        // A set list is an order; a folder or the whole library is not
        // (DEC-044), so the scope decides what the table opens on.
        sort: defaultSortForScope(inTree),
        dir: "asc",
      }));
    },
    [collections, playlists],
  );

  const scopeToCollection = useCallback(
    (node: CollectionNode | null) => {
      collections.select(node);
      if (!node || node.kind === "folder") {
        // A folder is not a scope: it holds nodes, not tracks and not a
        // question. Selecting one moves the highlight and leaves the table
        // showing what it was showing.
        return;
      }
      playlists.select(null);
      const order = defaultSortForCollection(node);
      setQuery((previous) => ({
        ...previous,
        playlistId: null,
        scope: node.kind === "smart" ? "smart" : "collection",
        collectionId: node.id,
        sort: order.sort,
        dir: order.dir,
      }));
    },
    [collections, playlists],
  );

  // The Inspector belongs to the shell (SHELL-05); the page hands its content
  // up rather than rendering into it (DEC-024).
  useInspectorSlot(
    <TrackDetailPanel
      detail={detail.detail}
      loading={detail.loading}
      error={detail.error}
      selectionCount={selection.count}
      onSelectPlaylist={(playlist) => scopeTo(playlist)}
      // The detail read names a Collection by id, kind and name; the node with
      // its rules and its counts lives in the tree, so it is looked up rather
      // than reconstructed from three fields (ORG-10).
      onSelectCollection={(collection) =>
        scopeToCollection(findCollection(collections.tree, collection.id))
      }
      onReveal={(path) => void window.cuepoint?.showItemInFolder?.(path)}
      onError={(message) => push(message, "warning")}
    />,
  );

  /**
   * Copy rows as text, saying what was copied.
   *
   * Takes a gatherer rather than rows because the selection's rows are fetched
   * (they can name tracks no window holds) while the menu already has its own —
   * and the busy state has to cover the fetch, not start after it.
   */
  const copyRows = useCallback(
    async (gather: () => Promise<LibraryTrackRow[]>, requested: number) => {
      setCopying(true);
      try {
        const rows = await gather();
        const text = tracksAsText(columns.visible, rows);
        const wrote = text === "" ? false : await writeClipboard(text);
        if (!mounted.current) return;
        push(
          wrote ? copySummary(rows.length, requested) : "Could not copy to the clipboard",
          wrote ? "success" : "warning",
        );
      } finally {
        if (mounted.current) setCopying(false);
      }
    },
    [columns.visible, push],
  );

  const handleCopy = useCallback(
    () => copyRows(() => selection.gatherRows(), selection.count),
    [copyRows, selection],
  );

  /**
   * Open the menu on a row (PLAYER-09, DEC-045).
   *
   * The target is the selection when the clicked row belongs to it, and the
   * clicked row alone otherwise — the convention every file manager follows,
   * and the one users assume when they right-click inside a selection they
   * just made.
   */
  const openMenuFor = useCallback(
    async (row: LibraryTrackRow, index: number, x: number, y: number) => {
      const inSelection =
        row.id != null &&
        (selection.selection.all
          ? !selection.selection.excluded.has(row.id)
          : selection.selection.ids.has(row.id));
      const rows =
        inSelection && selection.count > 1 ? await selection.gatherRows(QUEUE_ACTION_LIMIT) : [row];
      setMenu({ x, y, rows, index });
    },
    [selection],
  );

  const menuItems = useMemo((): TrackContextMenuItem[] => {
    if (!menu) return [];
    const { rows, index } = menu;
    const many = rows.length > 1;
    const path = rows.length === 1 ? rows[0].file_path : null;
    return [
      {
        id: "play",
        // One row plays the view behind it (DEC-012); a selection *is* the
        // queue, because someone who picked five tracks meant those five.
        label: many ? `Play ${rows.length.toLocaleString()} tracks` : "Play",
        onSelect: () => void (many ? playback.playRows(rows) : playback.playRow(index)),
      },
      {
        id: "play-next",
        label: "Play next",
        onSelect: () => void playback.playNext(rows),
      },
      {
        id: "add-to-queue",
        label: "Add to queue",
        onSelect: () => void playback.addToQueue(rows),
      },
      {
        id: "reveal",
        label: "Show in folder",
        separatorBefore: true,
        disabled: !path,
        onSelect: () => void (path && window.cuepoint?.showItemInFolder?.(path)),
      },
      {
        id: "copy",
        label: many ? `Copy ${rows.length.toLocaleString()} tracks` : "Copy",
        // The menu's rows, not the selection's: right-clicking outside a
        // selection acts on the row under the pointer, and copy is no
        // exception. COPY_LIMIT still applies — the queue's cap is ten times
        // the clipboard's, and 50,000 rows of text is not a copy anyone meant.
        onSelect: () =>
          void copyRows(async () => rows.slice(0, COPY_LIMIT), rows.length),
      },
    ];
  }, [copyRows, menu, playback]);

  // Ctrl+A selects everything the query matches; Escape lets go of it;
  // Ctrl+F is the in-page search, matching the Results screen (SHELL-10's
  // shortcut list is the truth for both).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName);

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !typing) {
        event.preventDefault();
        selection.selectAllMatching();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchRef.current?.querySelector<HTMLInputElement>("input")?.focus();
        return;
      }
      // Escape belongs to whatever is on top, and already does: `Modal` takes
      // it in the capture phase and stops it, so closing a dialog never
      // reaches this listener. A `!dialogOpen` guard here was written and then
      // removed — mutation testing showed nothing could observe it.
      if (event.key === "Escape" && !typing) selection.clear();
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [selection]);

  // ------------------------------------------------- import and refresh flow

  const run = useCallback(
    async (
      state: Exclude<Busy, null>,
      start: () => Promise<{ job_id: string }>,
    ): Promise<{ jobId: string } | null> => {
      setBusy(state);
      let jobId: string;
      try {
        jobId = (await start()).job_id;
      } catch (error) {
        if (mounted.current) setBusy(null);
        push(error instanceof Error ? error.message : "The engine refused that", "warning");
        return null;
      }

      const handle = followJob(jobId);
      watching.current.push(handle);
      const outcome = await handle.finished;
      watching.current = watching.current.filter((entry) => entry !== handle);
      if (!mounted.current) return null;
      setBusy(null);

      if (outcome.state !== "succeeded") {
        push(jobErrorMessage(outcome.error), "warning");
        return null;
      }
      return { jobId };
    },
    [push],
  );

  const pickFile = useCallback(async (): Promise<string | null> => {
    const open = window.cuepoint?.openXmlFileDialog;
    if (!open) {
      push("Choosing a file needs the desktop app.", "warning");
      return null;
    }
    const picked = await open();
    return picked.canceled ? null : picked.filePath;
  }, [push]);

  const handleImport = useCallback(async () => {
    const start = window.cuepoint?.startLibraryImport;
    if (!start) {
      push("Importing needs the desktop app with the engine connected.", "warning");
      return;
    }
    const xmlPath = await pickFile();
    if (!xmlPath) return;

    setLastApplied(null);
    const done = await run("importing", () => start({ xml_path: xmlPath }));
    if (!done) return;
    await loadSummary();
    // Everything downstream of the collection has to be asked again: the tree
    // was replaced row for row, and the rows behind the table are a different
    // library now. `setQuery` alone would not do it — the question after an
    // import is the same question, and the window recognizes a stale answer by
    // comparing questions.
    playlists.reload();
    setQuery({ ...DEFAULT_LIBRARY_QUERY });
    window_.reload();
    push("Collection imported.", "success");
  }, [loadSummary, pickFile, playlists, push, run, window_]);

  const handleCheck = useCallback(async () => {
    const start = window.cuepoint?.startLibraryRefreshPreview;
    const results = window.cuepoint?.getJobResults;
    if (!start || !results) {
      push("Refreshing needs the desktop app with the engine connected.", "warning");
      return;
    }

    setLastApplied(null);
    const done = await run("checking", () => start({}));
    if (!done) return;

    try {
      const payload = await results(done.jobId);
      const previewed = payload.result as RefreshDiff | undefined;
      if (!previewed) {
        push("The check finished without a result.", "warning");
        return;
      }
      if (mounted.current) setDiff(previewed);
    } catch (error) {
      push(error instanceof Error ? error.message : "Could not read the preview", "warning");
    }
  }, [push, run]);

  const handleApply = useCallback(
    async ({ confirmReferences }: { confirmReferences: boolean }) => {
      const start = window.cuepoint?.startLibraryRefreshApply;
      const results = window.cuepoint?.getJobResults;
      if (!start || !results || !diff) return;

      const done = await run("applying", () =>
        start({ diff_id: diff.diff_id, confirm_references: confirmReferences }),
      );
      if (mounted.current) setDiff(null);
      if (!done) return;

      try {
        const payload = await results(done.jobId);
        if (mounted.current) setLastApplied((payload.result as RefreshApplied) ?? null);
      } catch {
        // The refresh succeeded; not being able to read its receipt is not a
        // failure worth reporting as one.
      }
      await loadSummary();
      // A refresh deletes tracks. Rows the table is still holding may name
      // some of them, so the window is asked again even though the query has
      // not moved.
      playlists.reload();
      setQuery({ ...DEFAULT_LIBRARY_QUERY });
      window_.reload();
      // A refresh can delete tracks a Collection holds (DEC-011), so the
      // counts beside its name are stale the moment it lands.
      collections.reload();
      push("Library refreshed.", "success");
    },
    [collections, diff, loadSummary, playlists, push, run, window_],
  );

  // ------------------------------------------------------------------ render

  const filtered = query.q.trim() !== "" || (query.filters?.rules.length ?? 0) > 0;
  const emptyState = useMemo(() => {
    // Three different problems, three different answers. "No tracks" over a
    // filtered view sends someone looking for a broken import.
    if (filtered) return "No tracks match this search.";
    if (query.playlistId != null) return "This playlist is empty.";
    if (query.scope === "smart") return "Nothing matches these rules right now.";
    if (query.scope === "collection") return "This Collection is empty. Drop tracks onto it.";
    return "No tracks yet.";
  }, [filtered, query.playlistId, query.scope]);

  const revealPath = useMemo(() => {
    const id = onlySelectedId(selection.selection, window_.total);
    if (id == null) return null;
    for (let index = 0; index < window_.total; index += 1) {
      const row = window_.source.getRow(index);
      if (row?.id === id) return row.file_path;
    }
    return detail.detail?.track.id === id ? detail.detail.track.file_path : null;
  }, [detail.detail, selection.selection, window_.source, window_.total]);

  const selectedKeys = useMemo(() => {
    const keys = new Set<number>();
    for (let index = 0; index < window_.total; index += 1) {
      const row = window_.source.getRow(index);
      if (!row?.id) continue;
      if (selection.selection.all) {
        if (!selection.selection.excluded.has(row.id)) keys.add(row.id);
      } else if (selection.selection.ids.has(row.id)) {
        keys.add(row.id);
      }
    }
    return keys;
  }, [selection.selection, window_.source, window_.total]);

  if (loading) {
    return (
      <div className="screen screen--stack library-screen">
        <p className="library-screen__loading">Reading your library…</p>
      </div>
    );
  }

  // Nothing imported: the page is the import prompt LIBRARY-11 wrote, unchanged.
  if (!summary || summary.library_empty || summary.source === null) {
    return (
      <div className="screen screen--stack screen--scroll library-screen">
        <header className="library-screen__header">
          <h1 className="screen__title">Library</h1>
          <p className="screen__subtitle">Your Rekordbox collection, as CuePoint sees it.</p>
        </header>
        <Panel title="No collection imported yet">
          <p className="library-screen__empty">
            CuePoint works from a Rekordbox XML export. Import one and it will
            remember where it came from, so refreshing later takes one click.
          </p>
          <div className="library-screen__actions">
            <Button
              variant="primary"
              onClick={() => void handleImport()}
              disabled={busy !== null}
            >
              {busy === "importing" ? BUSY_LABEL.importing : "Import a collection…"}
            </Button>
            {onOpenRekordboxInstructions && (
              <Button variant="secondary" onClick={onOpenRekordboxInstructions}>
                How do I export one?
              </Button>
            )}
          </div>
        </Panel>
        <RefreshPreviewDialog
          open={diff !== null}
          diff={diff}
          applying={busy === "applying"}
          onCancel={() => setDiff(null)}
          onApply={(options) => void handleApply(options)}
        />
      </div>
    );
  }

  return (
    <div className="screen library-screen library-screen--browser">
      <LibraryHeader
        summary={summary}
        busy={busy}
        busyLabel={busy ? BUSY_LABEL[busy] : null}
        onCheck={() => void handleCheck()}
        onImport={() => void handleImport()}
        appliedLine={lastApplied ? appliedLine(lastApplied) : null}
      />

      <div className="library-screen__body">
        <LibraryPane
          libraryTrackCount={summary.track_count}
          playlists={playlists}
          collections={collections}
          scopeIsLibrary={query.playlistId == null && query.collectionId == null}
          onSelectPlaylist={(node) => scopeTo(node)}
          onSelectCollection={(node) => scopeToCollection(node)}
          onNotify={(message, tone) => push(message, tone === "warning" ? "warning" : "success")}
        />

        <div className="library-screen__main">
          <div ref={searchRef}>
            <FilterBar
              vocabulary={vocabulary}
              filters={query.filters}
              onFiltersChange={(filters: FilterRuleSet | null) =>
                setQuery((previous) => ({ ...previous, filters }))
              }
              query={query.q}
              onQueryChange={(q) => setQuery((previous) => ({ ...previous, q }))}
              total={window_.total}
              facet={facet.facet}
              onRequestFacet={facet.load}
            />
          </div>

          <div className="library-screen__table">
            <TrackTable<LibraryTrackRow>
              columns={columns.visible}
              source={window_.source}
              widths={columns.widths}
              onWidthsChange={columns.setWidths}
              onColumnMove={columns.move}
              sort={{ key: query.sort, direction: query.dir }}
              onSortChange={(next) =>
                setQuery((previous) => ({
                  ...previous,
                  sort: next.key,
                  dir: next.direction,
                }))
              }
              selectedKeys={selectedKeys}
              getRowKey={(row) => row.id ?? -1}
              onSelect={selection.onRowClick}
              // DEC-046's seam, finally given DEC-012's meaning: the row plays
              // and the whole view — the query, not the loaded window — becomes
              // the queue.
              onRowActivate={(_row, index) => void playback.playRow(index)}
              onRowContextMenu={(row, index, anchor) =>
                void openMenuFor(row, index, anchor.x, anchor.y)
              }
              // Shift+F10 and the menu key open it on the last row clicked.
              activeIndex={selection.selection.anchor}
              emptyState={emptyState}
              resetKey={queryKey(query)}
              ariaLabel="Library tracks"
            />
          </div>

          {menu && (
            <TrackContextMenu
              x={menu.x}
              y={menu.y}
              items={menuItems}
              onClose={() => setMenu(null)}
              label={
                menu.rows.length > 1
                  ? `Actions for ${menu.rows.length.toLocaleString()} tracks`
                  : "Track actions"
              }
            />
          )}

          <SelectionActions
            count={selection.count}
            describedByQuery={selection.selection.all}
            revealPath={revealPath}
            total={window_.total}
            busy={copying}
            onCopy={() => void handleCopy()}
            onReveal={(path) => void window.cuepoint?.showItemInFolder?.(path)}
            onClear={selection.clear}
            onSelectAll={selection.selectAllMatching}
          />

          <div className="library-screen__columns">
            <Button variant="secondary" onClick={() => setPickerOpen(true)}>
              Columns…
            </Button>
            {window_.error && (
              <span className="library-screen__error" role="alert">
                {window_.error}{" "}
                <button type="button" onClick={window_.retry}>
                  Try again
                </button>
              </span>
            )}
          </div>
        </div>
      </div>

      <ColumnPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        columns={LIBRARY_COLUMNS}
        layout={columns.layout}
        onToggle={columns.toggle}
        onNudge={columns.nudge}
        onReset={columns.reset}
      />

      <RefreshPreviewDialog
        open={diff !== null}
        diff={diff}
        applying={busy === "applying"}
        onCancel={() => setDiff(null)}
        onApply={(options) => void handleApply(options)}
      />
    </div>
  );
}
