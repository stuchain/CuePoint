/**
 * The Prepare page: DEC-104's Set Builder (PREP-10).
 *
 * One Set, with its chapters, planned times, notes and warnings, laid out side
 * by side with the source panel (DEC-112). A header names the Set and says how
 * long it is planned to run and what its checks found; the Set table below is a
 * `TrackTable` over its entries and its chapters' headings; the entry selected
 * is planned in the Inspector's "In this Set" zone. Beside the Set, the source
 * panel fills it from Suggestions and the library; above it, the lanes draw
 * its tempo and key (PREP-11).
 *
 * - **The address is the Set.** `/prepare/:setId` opens one; `/prepare`
 *   opens the Set last open, or the first, as DEC-027 reopens a page. With no
 *   Sets the page says what a Set is and offers to make one.
 * - **Every edit is the engine's.** A drag, a menu entry and a field in the
 *   Inspector each make one call and re-read the Set (`usePreparedSet`).
 * - **Playing is the queue** (DEC-108): "Play Set" and a double-click hand
 *   the entries, in order and with their repeats, to `playQueue`. The player
 *   is not told it is playing a Set.
 * - **Nothing blocks** (DEC-017, DEC-106): a warning is drawn, never a reason
 *   a button is greyed.
 * - **One place to insert** (PREP-11): the gap after the selected entry, or the
 *   end of the Set. "Insert here" puts tracks there and selects the last one
 *   put in, so the next suggestion fits after it; a drop puts them where it
 *   lands. Either way the tracks go in one at a time through the one path that
 *   writes an entry (PREP-02).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type {
  EntityKind,
  LibraryPlaylistNode,
  LibraryTrackRow,
  SetChapterPlan,
  SetChapterUpdate,
  SetRefusal,
  SetWarning,
  TrackCreditLinks,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { Panel } from "../../components/Panel";
import { TrackContextMenu } from "../../components/TrackContextMenu";
import { useToast } from "../../components/Toast";
import { useInspectorSlot } from "../../components/shell/inspectorSlot";
import { ColumnPicker, TrackTable, inMemorySource, useColumnLayout } from "../../components/table";
import { entityPath, similarPath } from "../discover/discoverLinks";
import { useBeatportSelection } from "../discover/useBeatportSelection";
import { NewSetFromDialog } from "../library/NewSetFromDialog";
import { RekordboxExportDialog } from "../library/RekordboxExportDialog";
import type { FolderOption } from "../library/SaveSmartDialog";
import { TrackDetailPanel } from "../library/TrackDetailPanel";
import { flattenCollections, isSet, setPickerNodes } from "../library/collectionTree";
import { TRACK_IDS_MIME, draggedTrackIds } from "../library/collectionDrag";
import { creditsFor, discoverMenuItems } from "../library/libraryDiscover";
import { newSetMadeLine, setSourceOf, type NewSetSource } from "../library/newSetFrom";
import { useCollectionTree } from "../library/useCollectionTree";
import { queuedMessage, toQueueItem } from "../library/useLibraryPlayback";
import { useTrackDetail } from "../library/useTrackDetail";
import { ChapterDialog } from "./ChapterDialog";
import { NewSetDialog, SetSourceDialog } from "./NewSetDialogs";
import { PrepareLayout } from "./PrepareLayout";
import { SetEntryZone } from "./SetEntryZone";
import { SetLanes } from "./SetLanes";
import { SourcePanel } from "./SourcePanel";
import { newSetSources } from "./newSetSources";
import { PREPARE_COLUMNS, PREPARE_TABLE_LAYOUT_KEY } from "./prepareColumns";
import {
  EMPTY_SET,
  NO_SETS,
  WHAT_A_SET_IS,
  deletionLine,
  headerFacts,
} from "./prepareFormat";
import {
  PREPARE_PATH,
  forgetLastSetId,
  loadLastSetId,
  preparePath,
  saveLastSetId,
  setIdFromRoute,
  setToOpen,
} from "./prepareLink";
import { entryMenuItems, headingMenuItems } from "./prepareMenus";
import {
  buildSetRows,
  canSplitAt,
  chapterMove,
  chapterName,
  dropMove,
  dropPlace,
  entriesOf,
  isEntryRow,
  repeatAfter,
  rowKey,
  type EntryRow,
  type HeadingRow,
  type PrepareRow,
} from "./prepareRows";
import {
  insertedLine,
  insertionPoint,
  roomFor,
  type InsertPlace,
} from "./prepareSource";
import { loadLanesOpen, saveLanesOpen } from "./sourcePanelState";
import { useSetList } from "./useSetList";
import { usePreparedSet, type Tone } from "./usePreparedSet";
import "../screens.css";
import "./prepare.css";

/** The page's own memory of the tree's folders, apart from the Library pane's. */
export const PREPARE_TREE_STORAGE_KEY = "cuepoint-prepare-tree";

/** What an entry drag carries: the entry, which is not the track (DEC-107). */
export const SET_ENTRY_MIME = "application/x-cuepoint-set-entry";

/** Said when the Set open is deleted, here or elsewhere, or by a refresh. */
export const SET_GONE_LINE = "The Set that was open is not there any more.";

export interface PrepareScreenProps {
  /** Where the Inspector's "Open on the Clean page" goes. */
  onOpenInClean?: (trackId: number) => void;
  /** Clean's missing-file view, which the export's count links to (DEC-088). */
  onOpenMissingFiles?: () => void;
  /** The export's "Refresh first" (DEC-082): the Library's refresh. */
  onRefreshLibrary?: () => void;
}

type Menu =
  | { kind: "entry"; x: number; y: number; rows: EntryRow[]; credits: TrackCreditLinks | null }
  | { kind: "heading"; x: number; y: number; row: HeadingRow };

const idOfRow = (row: PrepareRow) => rowKey(row);

export function PrepareScreen({
  onOpenInClean,
  onOpenMissingFiles,
  onRefreshLibrary,
}: PrepareScreenProps = {}) {
  const { setId: param } = useParams();
  const setId = setIdFromRoute(param);
  const navigate = useNavigate();
  const { push } = useToast();
  const tree = useCollectionTree(PREPARE_TREE_STORAGE_KEY);
  const bridge = window.cuepoint?.sets;

  const say = useCallback((message: string, tone: Tone) => push(message, tone), [push]);

  // --- which Set

  const onGone = useCallback(
    (_refusal?: SetRefusal) => {
      forgetLastSetId();
      push(SET_GONE_LINE, "warning");
      tree.reload();
      navigate(PREPARE_PATH, { replace: true });
    },
    [navigate, push, tree],
  );

  const prepared = usePreparedSet({ setId, onMessage: say, onGone });
  const shown = prepared.set;

  // `/prepare` names no Set: open the last one, or the first (DEC-027).
  useEffect(() => {
    if (param !== undefined || tree.status !== "ready") return;
    const target = setToOpen(tree.tree, loadLastSetId());
    if (target) navigate(preparePath(target.id), { replace: true });
  }, [navigate, param, tree.status, tree.tree]);

  useEffect(() => {
    if (shown) saveLastSetId(shown.setId);
  }, [shown]);

  // --- the rows

  const rows = useMemo(
    () => (shown ? buildSetRows(shown.plan, shown.entries, shown.analysis) : []),
    [shown],
  );
  const entries = useMemo(() => entriesOf(rows), [rows]);
  const source = useMemo(() => inMemorySource(rows), [rows]);
  const loadedRows = useCallback(() => rows.map((row, index) => ({ row, index })), [rows]);
  const selection = useBeatportSelection<PrepareRow>({
    key: String(setId),
    idOf: idOfRow,
    getRow: source.getRow,
    loadedRows,
  });
  const columns = useColumnLayout<PrepareRow>(PREPARE_TABLE_LAYOUT_KEY, PREPARE_COLUMNS);

  // The selected entries as they are now: a removed one is not selected.
  const selected = useMemo(() => {
    const keys = selection.keys;
    return rows.filter((row): row is EntryRow => isEntryRow(row) && keys.has(rowKey(row)));
  }, [rows, selection.keys]);
  const picked = selection.rows.filter(isEntryRow);
  const lastPicked = picked[picked.length - 1];
  const focused =
    (lastPicked && selected.find((row) => row.entry.entry_id === lastPicked.entry.entry_id)) ??
    selected[selected.length - 1] ??
    null;

  // Selecting an entry from outside the table: the lanes, or an insert that
  // selects what it put in. The row may not be there until the Set is re-read.
  const [toSelect, setToSelect] = useState<number | null>(null);
  const [scrollTo, setScrollTo] = useState<number | null>(null);
  const { select } = selection;
  useEffect(() => {
    if (toSelect === null) return;
    const index = rows.findIndex((row) => isEntryRow(row) && row.entry.entry_id === toSelect);
    if (index < 0) return;
    select(rows[index], index);
    setScrollTo(index);
    setToSelect(null);
  }, [rows, select, toSelect]);
  // A scroll is asked for once: the next selection from outside asks again,
  // even for the same row.
  useEffect(() => {
    if (scrollTo !== null) setScrollTo(null);
  }, [scrollTo]);

  const point = useMemo(
    () => (shown ? insertionPoint(shown.plan, entries, focused ? focused.entry.entry_id : null) : null),
    [entries, focused, shown],
  );

  // --- playing (DEC-108)

  const player = window.cuepoint?.player;
  const report = useCallback(
    (result: { ok: boolean; error?: string } | void) => {
      if (result && !result.ok && result.error) push(result.error, "warning");
    },
    [push],
  );
  const playFrom = useCallback(
    async (index: number) => {
      if (!player?.playQueue || entries.length === 0) return;
      report(await player.playQueue(entries.map((entry) => toQueueItem(entry.track)), index));
    },
    [entries, player, report],
  );
  const playEntries = useCallback(
    async (chosen: EntryRow[], how: "play" | "next" | "end") => {
      if (!player || chosen.length === 0) return;
      const items = chosen.map((row) => toQueueItem(row.entry.track));
      if (how === "play") {
        report(await player.playQueue(items, 0));
        return;
      }
      await (how === "next" ? player.playNext(items) : player.addToQueue(items));
      push(queuedMessage(chosen.length, how), "info");
    },
    [player, push, report],
  );
  const indexOfEntry = useCallback(
    (entryId: number) => entries.findIndex((entry) => entry.entry_id === entryId),
    [entries],
  );

  // --- editing

  const { edit, write } = prepared;
  const [chapterEditing, setChapterEditing] = useState<SetChapterPlan | null>(null);
  const [chapterError, setChapterError] = useState<string | null>(null);
  const [chapterDeleting, setChapterDeleting] = useState<SetChapterPlan | null>(null);

  const saveChapter = useCallback(
    async (update: SetChapterUpdate) => {
      setChapterError(null);
      const done = await edit((sets) => sets.updateChapter(update), { onRefused: setChapterError });
      if (done) setChapterEditing(null);
    },
    [edit],
  );

  const moveChapter = useCallback(
    (chapter: SetChapterPlan, delta: -1 | 1) =>
      void edit((sets) => sets.moveChapter({ chapter_id: chapter.id, position: chapter.position + delta })),
    [edit],
  );

  const deleteChapter = useCallback(
    async (chapter: SetChapterPlan) => {
      setChapterDeleting(null);
      await edit((sets) => sets.deleteChapter({ chapter_id: chapter.id }));
    },
    [edit],
  );

  const splitAt = useCallback(
    (row: EntryRow) => void edit((sets) => sets.splitChapter({ entry_id: row.entry.entry_id })),
    [edit],
  );

  const insertRepeat = useCallback(
    (row: EntryRow) => {
      const insert = window.cuepoint?.insertTrackInCollection;
      if (!insert || setId === null) return;
      void write(() =>
        insert({ collection_id: setId, track_id: row.entry.track_id, ...repeatAfter(row.entry) }),
      );
    },
    [setId, write],
  );

  const removeEntries = useCallback(
    async (chosen: EntryRow[]) => {
      const remove = window.cuepoint?.removeCollectionEntries;
      if (!remove || chosen.length === 0 || !shown) return;
      const done = await write(() => remove({ entry_ids: chosen.map((row) => row.entry.entry_id) }));
      if (!done) return;
      selection.clear();
      tree.reload();
      const what = done.removed === 1 ? "1 entry" : `${done.removed.toLocaleString()} entries`;
      push(`Removed ${what} from “${shown.plan.name}”.`, "success");
    },
    [push, selection, shown, tree, write],
  );

  /**
   * Put tracks into the Set at a place, in order, one insert each: the one
   * path that writes an entry, which plans each into its chapter (PREP-02).
   * The room is checked first, so a Set too full for the gesture refuses it
   * whole rather than part-way. Selects the last entry put in, so the
   * insertion point follows it.
   */
  const insertTracks = useCallback(
    async (trackIds: readonly number[], place: InsertPlace, titles: readonly (string | null)[]) => {
      const insert = window.cuepoint?.insertTrackInCollection;
      if (!insert || !shown || trackIds.length === 0) return;
      const full = roomFor(trackIds.length, shown.entries.entries.length, shown.entries.limit);
      if (full) {
        push(full, "warning");
        return;
      }
      const last = await write(async () => {
        let made: { entry: { id: number } } | null = null;
        for (const [offset, trackId] of trackIds.entries()) {
          made = await insert({
            collection_id: shown.setId,
            track_id: trackId,
            position: place.position + offset,
            chapter_id: place.chapter_id,
          });
        }
        return made;
      });
      if (!last) return;
      setToSelect(last.entry.id);
      tree.reload();
      push(insertedLine(titles, shown.plan.name), "success");
    },
    [push, shown, tree, write],
  );

  /** "Insert here": the tracks, at the point. */
  const insertRows = useCallback(
    (tracks: LibraryTrackRow[]) => {
      if (!point) return;
      const chosen = tracks.filter((track) => track.id != null);
      void insertTracks(
        chosen.map((track) => track.id as number),
        { position: point.position, chapter_id: point.chapter?.id ?? null },
        chosen.map((track) => track.title),
      );
    },
    [insertTracks, point],
  );

  const moveByDrop = useCallback(
    (insertAt: number, transfer: DataTransfer, over: number) => {
      if (!Array.from(transfer.types ?? []).includes(SET_ENTRY_MIME)) {
        // Tracks from the source panel, where they land (PREP-11).
        const place = dropPlace(rows, insertAt, over);
        const ids = draggedTrackIds(transfer);
        // A drag carries ids only, so the toast counts rather than names them.
        if (place && ids.length > 0) void insertTracks(ids, place, ids.map(() => null));
        return;
      }
      const id = Number(transfer.getData(SET_ENTRY_MIME));
      const moving = entries.find((entry) => entry.entry_id === id);
      if (!moving) return;
      const move = dropMove(rows, moving, insertAt, over);
      if (move) void edit((sets) => sets.moveEntry(move));
    },
    [edit, entries, insertTracks, rows],
  );

  // --- the Inspector: the entry's plan above the track (PREP-10)

  const detail = useTrackDetail(focused ? focused.entry.track_id : null);
  const previousEntryId = focused ? (entries[indexOfEntry(focused.entry.entry_id) - 1]?.entry_id ?? null) : null;
  const acknowledge = useCallback(
    (warning: SetWarning, accept: boolean) => {
      if (!focused || previousEntryId === null) return;
      const ref = {
        from_entry_id: previousEntryId,
        to_entry_id: focused.entry.entry_id,
        warning: warning.kind as "tempo_jump" | "key_clash" | "tempo_unknown" | "key_unknown",
      };
      if (accept) void edit((sets) => sets.acknowledge(ref));
      else void edit((sets) => sets.unacknowledge(ref));
    },
    [edit, focused, previousEntryId],
  );

  const openEntity = useCallback(
    (kind: EntityKind, ref: string) => navigate(entityPath(kind, ref)),
    [navigate],
  );

  const zone =
    focused && shown ? (
      <SetEntryZone
        key={focused.entry.entry_id}
        row={focused}
        chapters={shown.plan.chapters}
        onSaveTimes={async (inTime, outTime) =>
          (await edit((sets) =>
            sets.setEntryTimes({ entry_id: focused.entry.entry_id, in_time: inTime, out_time: outTime }),
          )) !== null
        }
        onSaveNote={async (note) =>
          (await edit((sets) => sets.setEntryNote({ entry_id: focused.entry.entry_id, note }))) !== null
        }
        onMoveToChapter={(chapterId) => {
          const move = chapterMove(shown.plan, focused.entry, chapterId);
          if (move) void edit((sets) => sets.moveEntry(move));
        }}
        onAcknowledge={acknowledge}
      />
    ) : undefined;

  useInspectorSlot(
    <TrackDetailPanel
      detail={detail.detail}
      loading={detail.loading}
      error={detail.error}
      selectionCount={selected.length}
      leadZone={zone}
      onError={(message) => push(message, "warning")}
      onMessage={(message) => push(message, "success")}
      onTrackChanged={() => {
        prepared.reload();
        detail.reload();
      }}
      onOpenInClean={onOpenInClean}
      onOpenEntity={openEntity}
    />,
  );

  // --- menus

  const [menu, setMenu] = useState<Menu | null>(null);
  const [exportMenu, setExportMenu] = useState<{ x: number; y: number } | null>(null);
  // The facts line holds one link: the lanes and the columns share its menu,
  // so the line stays one line and the Set keeps its rows (DEC-112).
  const [viewMenu, setViewMenu] = useState<{ x: number; y: number } | null>(null);

  const openEntryMenu = useCallback(
    async (row: EntryRow, index: number, x: number, y: number) => {
      selection.onRowMenu(row, index);
      const chosen = selection.keys.has(rowKey(row)) && selected.length > 1 ? selected : [row];
      const credits = chosen.length === 1 ? await creditsFor(chosen[0].entry.track_id, detail.detail) : null;
      setMenu({ kind: "entry", x, y, rows: chosen, credits });
    },
    [detail.detail, selected, selection],
  );

  const menuItems = useMemo(() => {
    if (!menu || !shown) return [];
    if (menu.kind === "heading") {
      const { chapter } = menu.row;
      return headingMenuItems(
        { position: chapter.position, chapters: shown.plan.chapters.length },
        {
          onEdit: () => {
            setChapterError(null);
            setChapterEditing(chapter);
          },
          onMoveUp: () => moveChapter(chapter, -1),
          onMoveDown: () => moveChapter(chapter, 1),
          onDelete: () => setChapterDeleting(chapter),
        },
      );
    }
    const chosen = menu.rows;
    const one = chosen.length === 1 ? chosen[0] : null;
    return entryMenuItems(
      { count: chosen.length, canSplit: one ? canSplitAt(rows, one.entry.entry_id) : false },
      {
        onPlay: () =>
          void (one ? playFrom(indexOfEntry(one.entry.entry_id)) : playEntries(chosen, "play")),
        onPlayNext: () => void playEntries(chosen, "next"),
        onAddToQueue: () => void playEntries(chosen, "end"),
        onSplit: () => one && splitAt(one),
        onRepeat: () => one && insertRepeat(one),
        onRemove: () => void removeEntries(chosen),
      },
      one
        ? discoverMenuItems(
            { count: 1, credits: menu.credits },
            { onSimilar: () => navigate(similarPath(one.entry.track_id)), onOpenPage: openEntity },
          )
        : [],
    );
  }, [
    indexOfEntry,
    insertRepeat,
    menu,
    moveChapter,
    navigate,
    openEntity,
    playEntries,
    playFrom,
    removeEntries,
    rows,
    shown,
    splitAt,
  ]);

  // --- set lists, the export, new Sets

  const setList = useSetList({ onMessage: say, onGone });
  const [exporting, setExporting] = useState(false);
  const [picking, setPicking] = useState(false);
  const [lanesOpen, setLanesOpen] = useState(loadLanesOpen);
  const toggleLanes = useCallback(() => {
    const next = !lanesOpen;
    setLanesOpen(next);
    saveLanesOpen(next);
  }, [lanesOpen]);

  // Every node of the tree, flat: the pool picker lists folders' children too.
  const allNodes = useMemo(() => flattenCollections(tree.tree), [tree.tree]);
  const folders = useMemo(
    (): FolderOption[] =>
      allNodes
        .filter((node) => node.kind === "folder")
        .map((node) => ({ id: node.id, name: node.name, depth: node.depth })),
    [allNodes],
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [choosingSource, setChoosingSource] = useState(false);
  const [playlists, setPlaylists] = useState<LibraryPlaylistNode[]>([]);
  const [copying, setCopying] = useState<NewSetSource | null>(null);
  const [busy, setBusy] = useState(false);

  const makeSet = useCallback(
    async (name: string, parentId: number | null) => {
      setBusy(true);
      const made = await tree.create("set", name, parentId);
      setBusy(false);
      if (!made.ok || !made.node) {
        setCreateError(made.error ?? "The Set could not be made.");
        return;
      }
      setCreating(false);
      push(`Made the Set “${made.node.name}”.`, "success");
      navigate(preparePath(made.node.id));
    },
    [navigate, push, tree],
  );

  const chooseSource = useCallback(async () => {
    setCreateError(null);
    const read = window.cuepoint?.getLibraryPlaylists;
    try {
      setPlaylists(read ? (await read()).playlists : []);
    } catch {
      // The CuePoint sources are still offered without the Rekordbox ones.
      setPlaylists([]);
    }
    setChoosingSource(true);
  }, []);

  const makeSetFrom = useCallback(
    async (name: string, parentId: number | null) => {
      if (!copying) return;
      setBusy(true);
      const made = await tree.createSetFrom(setSourceOf(copying), name, parentId);
      setBusy(false);
      if (!made.ok || !made.node) {
        setCreateError(made.error ?? "The Set could not be made.");
        return;
      }
      setCopying(null);
      push(newSetMadeLine(made.node.name, made.trackCount ?? 0), "success");
      navigate(preparePath(made.node.id));
    },
    [copying, navigate, push, tree],
  );

  const dialogs = (
    <>
      <NewSetDialog
        open={creating}
        folders={folders}
        busy={busy}
        error={createError}
        onCreate={(name, parentId) => void makeSet(name, parentId)}
        onClose={() => setCreating(false)}
      />
      <SetSourceDialog
        open={choosingSource}
        groups={newSetSources(tree.tree, playlists)}
        onChoose={(chosen) => {
          setChoosingSource(false);
          setCreateError(null);
          setCopying(chosen);
        }}
        onClose={() => setChoosingSource(false)}
      />
      <NewSetFromDialog
        source={copying}
        folders={folders}
        busy={busy}
        error={createError}
        onCreate={(name, parentId) => void makeSetFrom(name, parentId)}
        onClose={() => setCopying(null)}
      />
    </>
  );

  // --- what the page draws when there is no Set to draw

  if (!bridge) {
    return (
      <div className="screen screen--stack screen--scroll prepare-screen--waiting">
        <Panel title="Prepare">
          <p className="prepare-note">{NO_SETS}</p>
        </Panel>
      </div>
    );
  }

  const noSets =
    tree.status === "ready" && !flattenCollections(tree.tree).some((node) => isSet(node));

  if (param === undefined || (noSets && !shown)) {
    return (
      <div className="screen screen--stack screen--scroll prepare-screen--waiting">
        {noSets ? (
          <Panel title="Prepare a Set">
            <p className="prepare-note">{WHAT_A_SET_IS}</p>
            <div className="prepare-empty__actions">
              <Button
                onClick={() => {
                  setCreateError(null);
                  setCreating(true);
                }}
              >
                New Set
              </Button>
              <Button variant="secondary" onClick={() => void chooseSource()}>
                New Set from…
              </Button>
            </div>
          </Panel>
        ) : tree.status === "error" ? (
          <Panel title="Prepare">
            <p className="prepare-note">{tree.error}</p>
            <Button variant="secondary" onClick={tree.reload}>
              Try again
            </Button>
          </Panel>
        ) : (
          <p className="prepare-note">Reading your Sets…</p>
        )}
        {dialogs}
      </div>
    );
  }

  if (!shown) {
    return (
      <div className="screen screen--stack screen--scroll prepare-screen--waiting">
        {setId === null ? (
          <Panel title="Prepare">
            <p className="prepare-note">This address names no Set.</p>
            <Button variant="secondary" onClick={() => navigate(PREPARE_PATH)}>
              Open your Sets
            </Button>
          </Panel>
        ) : prepared.problem ? (
          <Panel title="The Set could not open">
            <p className="prepare-note">{prepared.problem}</p>
            <Button variant="secondary" onClick={prepared.reload}>
              Try again
            </Button>
          </Panel>
        ) : (
          <p className="prepare-note">Reading the Set…</p>
        )}
      </div>
    );
  }

  // --- the Set

  const { plan, analysis } = shown;
  const pickerNodes = setPickerNodes(tree.tree);
  const setName = plan.name;
  const titles = new Map(entries.map((entry) => [entry.entry_id, entry.track.title]));
  const target = { id: shown.setId, name: setName };

  const accepts = (transfer: DataTransfer) => {
    const types = Array.from(transfer.types ?? []);
    return types.includes(SET_ENTRY_MIME) || types.includes(TRACK_IDS_MIME);
  };
  const firstChapter = [...plan.chapters].sort((a, b) => a.position - b.position)[0];

  const table = (
    <div className={`prepare-set${lanesOpen ? " prepare-set--lanes" : ""}`}>
      {lanesOpen && analysis.shape.entries.length > 0 && (
        <SetLanes
          shape={analysis.shape}
          titles={titles}
          chapters={plan.chapters}
          selectedEntryId={focused ? focused.entry.entry_id : null}
          onSelect={setToSelect}
        />
      )}
      <div className="prepare-set__rows">
        <TrackTable<PrepareRow>
          columns={columns.visible}
          source={source}
          widths={columns.widths}
          onWidthsChange={columns.setWidths}
          onColumnMove={columns.move}
          selectedKeys={selection.keys}
          getRowKey={idOfRow}
          rowClassName={(row) => (row.kind === "heading" ? "prepare-heading" : undefined)}
          onSelect={(row, index, event) => {
            if (row.kind === "entry") selection.onRowClick(row, index, event);
          }}
          onRowActivate={(row) => {
            if (row.kind === "entry") void playFrom(indexOfEntry(row.entry.entry_id));
            else {
              setChapterError(null);
              setChapterEditing(row.chapter);
            }
          }}
          onRowContextMenu={(row, index, anchor) => {
            if (row.kind === "entry") void openEntryMenu(row, index, anchor.x, anchor.y);
            else setMenu({ kind: "heading", x: anchor.x, y: anchor.y, row });
          }}
          activeIndex={selection.anchor}
          canDragRow={(row) => row.kind === "entry"}
          onRowDragStart={(row, _index, transfer) => {
            if (row.kind !== "entry") return;
            transfer.setData(SET_ENTRY_MIME, String(row.entry.entry_id));
            transfer.effectAllowed = "move";
          }}
          acceptsRowDrop={accepts}
          onRowDrop={moveByDrop}
          scrollToIndex={scrollTo}
          emptyState={
            // An empty Set has no rows to drop on, so its note takes the drop:
            // the first track goes to the start of the first chapter.
            <div
              className="prepare-set__drop"
              onDragOver={(event) => {
                if (!event.dataTransfer || !Array.from(event.dataTransfer.types ?? []).includes(TRACK_IDS_MIME)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(event) => {
                const ids = draggedTrackIds(event.dataTransfer);
                if (ids.length === 0) return;
                event.preventDefault();
                void insertTracks(ids, { position: 0, chapter_id: firstChapter?.id ?? null }, ids.map(() => null));
              }}
            >
              <p className="prepare-note">{EMPTY_SET}</p>
            </div>
          }
          resetKey={String(shown.setId)}
          ariaLabel="Set entries"
        />
      </div>
    </div>
  );

  return (
    <div className="screen prepare-screen">
      <header className="prepare-header">
        {/* The picker is the page's title: it names the Set open and opens
            another, so the name is not drawn twice (DEC-112's height). */}
        <h1 className="prepare-visually-hidden">{setName}</h1>
        <div className="prepare-header__controls">
          <label className="prepare-header__picker">
            <span className="prepare-visually-hidden">Set</span>
            <select
              className="cp-select__control"
              value={String(shown.setId)}
              onChange={(event) => navigate(preparePath(Number(event.target.value)))}
            >
              {pickerNodes.map((node) => (
                <option key={node.id} value={String(node.id)} disabled={!isSet(node)}>
                  {`${"　".repeat(node.depth)}${node.name}`}
                </option>
              ))}
            </select>
          </label>
          <Button onClick={() => void playFrom(0)} disabled={entries.length === 0 || !player}>
            Play Set
          </Button>
          <Button
            variant="secondary"
            aria-haspopup="menu"
            aria-expanded={exportMenu !== null}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setExportMenu({ x: rect.left, y: rect.bottom });
            }}
          >
            Export ▾
          </Button>
        </div>
        <p className="prepare-header__facts" role="status">
          {headerFacts(entries.length, plan.running_time, analysis).map((fact, index) => (
            <span key={fact.text} title={fact.title} className={fact.strong ? "prepare-header__warnings" : undefined}>
              {index > 0 && <span aria-hidden="true"> · </span>}
              {fact.text}
            </span>
          ))}
          <button
            type="button"
            className="prepare-link"
            aria-haspopup="menu"
            aria-expanded={viewMenu !== null}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setViewMenu({ x: rect.left, y: rect.bottom });
            }}
          >
            View ▾
          </button>
        </p>
      </header>

      <PrepareLayout
        set={table}
        source={
          point && (
            <SourcePanel
              setId={shown.setId}
              chapters={plan.chapters}
              point={point}
              revision={shown}
              collections={allNodes}
              onInsert={insertRows}
              onStale={(refusal) => {
                push(refusal.message, "warning");
                prepared.reload();
              }}
              onGone={onGone}
              onMessage={(message, tone) => push(message, tone)}
              onOpenSimilar={(trackId) => navigate(similarPath(trackId))}
              onOpenEntity={openEntity}
            />
          )
        }
      />

      {menu && (
        <TrackContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          label={
            menu.kind === "heading"
              ? `Chapter “${chapterName(menu.row.chapter)}”`
              : menu.rows.length > 1
                ? `Actions for ${menu.rows.length.toLocaleString()} entries`
                : "Entry actions"
          }
        />
      )}
      {exportMenu && (
        <TrackContextMenu
          x={exportMenu.x}
          y={exportMenu.y}
          label="Export"
          onClose={() => setExportMenu(null)}
          items={[
            { id: "save", label: "Save set list…", onSelect: () => void setList.save(target) },
            { id: "copy", label: "Copy set list", onSelect: () => void setList.copy(target) },
            {
              id: "rekordbox",
              label: "Export to Rekordbox…",
              onSelect: () => setExporting(true),
              separatorBefore: true,
            },
          ]}
        />
      )}

      {viewMenu && (
        <TrackContextMenu
          x={viewMenu.x}
          y={viewMenu.y}
          label="View"
          onClose={() => setViewMenu(null)}
          items={[
            {
              id: "lanes",
              label: lanesOpen ? "Hide tempo and key lanes" : "Show tempo and key lanes",
              onSelect: toggleLanes,
            },
            { id: "columns", label: "Columns…", onSelect: () => setPicking(true) },
          ]}
        />
      )}

      <ChapterDialog
        chapter={chapterEditing}
        error={chapterError}
        onSave={(update) => void saveChapter(update)}
        onClose={() => setChapterEditing(null)}
      />
      <Modal
        open={chapterDeleting !== null}
        title={chapterDeleting ? `Delete the chapter “${chapterName(chapterDeleting)}”?` : "Delete chapter"}
        onClose={() => setChapterDeleting(null)}
        primaryAction={{
          label: "Delete chapter",
          onClick: () => chapterDeleting && void deleteChapter(chapterDeleting),
        }}
        secondaryAction={{ label: "Cancel", onClick: () => setChapterDeleting(null) }}
      >
        <p className="prepare-note">{chapterDeleting ? deletionLine(plan.chapters, chapterDeleting) : ""}</p>
      </Modal>
      <RekordboxExportDialog
        open={exporting}
        initialIds={[shown.setId]}
        tree={tree.tree}
        onClose={() => setExporting(false)}
        onRefreshFirst={() => {
          setExporting(false);
          onRefreshLibrary?.();
        }}
        onOpenMissingFiles={onOpenMissingFiles}
      />
      <ColumnPicker
        open={picking}
        onClose={() => setPicking(false)}
        columns={PREPARE_COLUMNS}
        layout={columns.layout}
        onToggle={columns.toggle}
        onNudge={columns.nudge}
        onReset={columns.reset}
      />
      {dialogs}
    </div>
  );
}
