/**
 * The Prepare page: DEC-104's Set Builder (PREP-10).
 *
 * One Set, with its chapters, planned times, notes and warnings, laid out side
 * by side with the source panel (DEC-112). The shared `ScreenHeader` titles the
 * page "Prepare" with the Set picker beside it (this amends DEC-112, where the
 * picker was the title), has three buttons (Play Set, a Set menu and a View
 * menu), and under them one line of facts: how long the Set is planned to run
 * and what its checks found. The Set table below is a
 * `TrackTable` over its entries and its chapters' headings; the entry selected
 * is planned in the Inspector's "In this Set" zone. Beside the Set, the source
 * panel fills it from Suggestions and the library; above it, the lanes draw
 * its tempo and key (PREP-11), and the transition strip draws the selected
 * entry's waveform beside the next one's (WAVE-07).
 *
 * - **The address is the Set.** `/prepare/:setId` opens one; `/prepare`
 *   opens the Set last open, or the first, as DEC-027 reopens a page. With no
 *   Sets the page says what a Set is and offers to make one.
 * - **Every edit is the engine's.** A drag, a menu entry and a field in the
 *   Inspector each make one call and re-read the Set (`usePreparedSet`).
 * - **Playing is the queue** (DEC-108): "Play Set" and a double-click hand
 *   the entries, in order and with their repeats, to `playQueue`. The player
 *   is not told it is playing a Set.
 * - **Order, chapter and time without a menu** (FLW-17, FLW-18): the facts line
 *   carries Move up, Move down, Start a chapter here, Repeat after and Remove
 *   for the entries selected (and Alt+Up, Alt+Down and Delete on the table); a
 *   chapter's heading carries one button, Edit…, whose dialog moves and deletes the chapter
 *   (this amends DEC-209 and DEC-249, where the heading had four); Mix in and Mix out are typed in
 *   the table, and a refused time is said on the facts line.
 * - **Nothing blocks** (DEC-017, DEC-106): a warning is drawn, never a reason
 *   a button is greyed.
 * - **One place to insert** (PREP-11): the gap after the selected entry, or the
 *   end of the Set. "Insert here" puts tracks there and selects the last one
 *   put in, so the next suggestion fits after it; a drop puts them where it
 *   lands. Either way the tracks go in one at a time through the one path that
 *   writes an entry (PREP-02).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { LIBRARY_PLAYLISTS, useSharedRead } from "../../api/sharedReads";
import { Button } from "../../components/Button";
import { Hint } from "../../components/Hint";
import { Loading } from "../../components/Loading";
import { Notice } from "../../components/Notice";
import { Modal } from "../../components/Modal";
import { EmptyState } from "../../components/EmptyState";
import { Panel } from "../../components/Panel";
import { Select } from "../../components/Select";
import { TrackContextMenu, useMenuButton } from "../../components/TrackContextMenu";
import { useToast } from "../../components/Toast";
import { ScreenHeader } from "../../components/shell/ScreenHeader";
import { useInspectorSlot } from "../../components/shell/inspectorSlot";
import { settingsFocusState } from "../settingsLink";
import { ColumnPicker, TrackTable, inMemorySource, useColumnLayout } from "../../components/table";
import { useRowHeight } from "../../components/table/trackTableLayout";
import { useScaleFactor } from "../../tokens/ScaleContext";
import { formatLength } from "../../format/durations";
import { countNoun } from "../../format/counts";
import { NO_SETS, RETRY, UNDO, couldNot, deleteLead, deleteTitle, opensDialog, quoted, removedFrom } from "../../format/words";
import { cleanSectionState } from "../clean/cleanLink";
import { entityPath, similarPath } from "../discover/discoverLinks";
import { useReportSelectedTrack } from "../../components/shell/useReportSelectedTrack";
import { useBeatportSelection } from "../discover/useBeatportSelection";
import { NewSetFromDialog } from "../library/NewSetFromDialog";
import { RekordboxExportDialog } from "../library/RekordboxExportDialog";
import type { FolderOption } from "../library/SaveSmartDialog";
import { TrackDetailPanel } from "../library/TrackDetailPanel";
import { flattenCollections, isSet, setPickerNodes } from "../library/collectionTree";
import { TRACK_IDS_MIME, draggedTrackIds, isTrackDrag } from "../library/collectionDrag";
import { creditsFor } from "../library/libraryDiscover";
import { newSetMadeLine, setSourceOf, type NewSetSource } from "../library/newSetFrom";
import { useCollectionTree } from "../library/useCollectionTree";
import { queuedMessage, toQueueItem } from "../library/useLibraryPlayback";
import { useTrackDetail } from "../library/useTrackDetail";
import { ChapterDialog } from "./ChapterDialog";
import { NewSetDialog, SetSourceDialog } from "./NewSetDialogs";
import { PrepareLayout } from "./PrepareLayout";
import { ENTRY_TITLE_KEEP_PX } from "./entryButtonsRoom";
import { EntryButtons } from "./prepareEditing";
import { PrepareEditingContext, type PrepareEditing, type TimeSaveResult } from "./prepareEditingContext";
import { SetEntryZone } from "./SetEntryZone";
import { SetLanes } from "./SetLanes";
import { SetNotesDialog } from "./SetNotesDialog";
import { SetTransition } from "./SetTransition";
import { useSetAreaFloor } from "./setAreaFloor";
import { SourcePanel } from "./SourcePanel";
import { useDetailsPanelOpen } from "./useDetailsPanelOpen";
import { columnsToDrop, useMeasuredWidth } from "./prepareWidthRule";
import { entryButtonDomId, entryButtons, stepMoves, type EntryButton } from "./entryActions";
import { nextTimeTarget, timeRefusalWords, timeTexts, timesToSave, type TimeField, type TimeTarget, type TimeTexts } from "./timeEditing";
import { newSetSources } from "./newSetSources";
import { PREPARE_COLUMNS, PREPARE_TABLE_LAYOUT_KEY } from "./prepareColumns";
import {
  EMPTY_SET_HEADLINE,
  EMPTY_SET_HELP,
  SETS_NEED_DESKTOP,
  WHAT_A_SET_IS,
  deletionLine,
  headerFacts,
  notesLinkLabel,
  notesLinkTitle,
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
import { entryMenuItems, headingMenuItems, moreEntries } from "./prepareMenus";
import { copyTrackRows, revealOne } from "./prepareTrackActions";
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
import { loadLanesOpen, loadTransitionOpen, saveLanesOpen, saveTransitionOpen } from "./sourcePanelState";
import { useSetList } from "./useSetList";
import { usePreparedSet, type Tone } from "./usePreparedSet";
import "../screens.css";
import "./prepare.css";
import { useTrackPlayMarks } from "../../components/player/playedTracks";

/** What Undo needs of a removed entry to put it back. */
interface SavedEntry {
  track_id: number;
  position: number;
  chapter_id: number;
  in_seconds: number | null;
  out_seconds: number | null;
  note: string | null;
}

const trackIdOfRow = (row: PrepareRow) => (row.kind === "entry" ? row.entry.track.id : null);

const NO_PLAYLISTS: LibraryPlaylistNode[] = [];
/** The playlists read, switched off until the "copy from" dialog is first asked for. */
const NOT_WANTED = { ...LIBRARY_PLAYLISTS, available: () => false };
/** The page's own memory of the tree's folders, apart from the Library pane's. */
const PREPARE_TREE_STORAGE_KEY = "cuepoint-prepare-tree";

/** What an entry drag carries: the entry, which is not the track (DEC-107). */
export const SET_ENTRY_MIME = "application/x-cuepoint-set-entry";

/** Said when the Set open is deleted, here or elsewhere, or by a refresh. */
export const SET_GONE_LINE = "The Set that was open is not there any more.";

interface PrepareScreenProps {
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

/**
 * A page still reading says so inside a panel, not as bare text (PRP-12). The
 * pixel loading motion (DEC-134) is PAGES-12's; this is where it will play.
 */
function LoadingPanel({ title, what }: { title?: string; what: string }) {
  return (
    <Panel title={title}>
      <Loading what={what} />
    </Panel>
  );
}

export function PrepareScreen({
  onOpenInClean,
  onOpenMissingFiles,
  onRefreshLibrary,
}: PrepareScreenProps = {}) {
  const playMarks = useTrackPlayMarks(trackIdOfRow);
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
  // Only entries are ever selected: a chapter heading is no track (Ctrl+A skips it).
  const loadedRows = useCallback(
    () => rows.flatMap((row, index) => (isEntryRow(row) ? [{ row, index }] : [])),
    [rows],
  );
  const selection = useBeatportSelection<PrepareRow>({
    key: String(setId),
    idOf: idOfRow,
    getRow: source.getRow,
    loadedRows,
  });
  const columns = useColumnLayout<PrepareRow>(PREPARE_TABLE_LAYOUT_KEY, PREPARE_COLUMNS);
  // Mix in and Mix out go together (R4-5). The item is ticked when both show; ticked, it hides both,
  // else it shows both. The two can be out of step (Mix in alone is the default, C246, or after
  // Columns…), so they are set, not each flipped.
  const timeEntries = columns.layout.filter((entry) => entry.id === "in" || entry.id === "out");
  const timesShown = timeEntries.length === 2 && timeEntries.every((entry) => !entry.hidden);
  const toggleTimes = () => {
    for (const entry of columns.layout) {
      if ((entry.id === "in" || entry.id === "out") && entry.hidden === !timesShown) {
        columns.toggle(entry.id);
      }
    }
  };

  // The selected entries as they are now: a removed one is not selected.
  const selected = useMemo(() => {
    const keys = selection.keys;
    return rows.filter((row): row is EntryRow => isEntryRow(row) && keys.has(rowKey(row)));
  }, [rows, selection.keys]);
  const picked = selection.rows.filter(isEntryRow);
  const lastPicked = picked[picked.length - 1];
  useEffect(() => setHeadingAt(null), [rows]);

  // A chapter's heading is no entry, so it is never selected; the one last clicked is
  // the table's active row all the same, so Enter on it opens Edit as a double-click does.
  const [headingAt, setHeadingAt] = useState<number | null>(null);
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
    setChosenIn("set");
    setScrollTo(index);
    setToSelect(null);
  }, [rows, select, toSelect]);
  // A scroll is asked for once: the next selection from outside asks again,
  // even for the same row.
  useEffect(() => {
    if (scrollTo !== null) setScrollTo(null);
  }, [scrollTo]);

  // The wheel lights the track last chosen in either table (PAGES-03, DEC-157):
  // an entry of the Set, or a row picked in the source panel beside it.
  const [panelPicked, setPanelPicked] = useState<LibraryTrackRow[]>([]);
  const [chosenIn, setChosenIn] = useState<"set" | "panel">("set");
  const onPanelPicked = useCallback((picked: LibraryTrackRow[]) => {
    setPanelPicked(picked);
    if (picked.length > 0) setChosenIn("panel");
  }, []);
  const panelTrack = panelPicked[panelPicked.length - 1];
  useReportSelectedTrack(
    chosenIn === "panel" && panelTrack?.id != null
      ? { id: panelTrack.id, key: panelTrack.effective_key ?? null }
      : focused
        ? { id: focused.entry.track_id, key: focused.entry.track.effective_key ?? null }
        : null,
  );

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
      const done = await edit((sets) => sets.updateChapter(update), {
        onRefused: (message) => setChapterError(message),
      });
      if (done) setChapterEditing(null);
    },
    [edit],
  );

  // The Set's own notes (PREP-03's `set_notes`): one dialog, one write.
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesRefusals, setNotesRefusals] = useState(0);
  const shownId = shown?.setId ?? null;
  const saveNotes = useCallback(
    async (notes: string | null) => {
      if (shownId === null) return;
      setNotesError(null);
      const done = await edit((sets) => sets.setNotes({ set_id: shownId, notes }), {
        onRefused: (message) => {
          setNotesError(message);
          setNotesRefusals((n) => n + 1);
        },
      });
      if (done) setNotesOpen(false);
    },
    [edit, shownId],
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

  // Put removed entries back where they were, in their order, with their times and notes (Undo on
  // the toast that says they were removed). Warnings marked OK are not brought back.
  const restoreEntries = useCallback(
    async (saved: SavedEntry[], setName: string) => {
      const insert = window.cuepoint?.insertTrackInCollection;
      if (!insert || setId === null || saved.length === 0) return;
      const made = await write(async () => {
        // One that cannot go back (its track left the library, say) does not stop the rest.
        const ids: Array<number | null> = [];
        for (const entry of saved) {
          try {
            const put = await insert({
              collection_id: setId,
              track_id: entry.track_id,
              position: entry.position,
              chapter_id: entry.chapter_id,
            });
            ids.push(put.entry.id);
          } catch {
            ids.push(null);
          }
        }
        return ids;
      });
      if (!made) return;
      const failed = made.filter((id) => id === null).length;
      if (failed > 0) {
        push(
          failed === saved.length
            ? couldNot("undo the removal from", setName)
            : `${couldNot(`undo the removal of ${failed} of ${countNoun(saved.length, "track")}`)} The rest are back.`,
          "error",
        );
      }
      for (const [at, entry] of saved.entries()) {
        const id = made[at];
        if (id == null) continue;
        if (entry.in_seconds != null || entry.out_seconds != null) {
          await edit((sets) =>
            sets.setEntryTimes({
              entry_id: id,
              in_time: entry.in_seconds == null ? null : formatLength(entry.in_seconds),
              out_time: entry.out_seconds == null ? null : formatLength(entry.out_seconds),
            }),
          );
        }
        if (entry.note) await edit((sets) => sets.setEntryNote({ entry_id: id, note: entry.note }));
      }
      tree.reload();
    },
    [edit, push, setId, tree, write],
  );

  const removeEntries = useCallback(
    async (chosen: EntryRow[]) => {
      const remove = window.cuepoint?.removeCollectionEntries;
      if (!remove || chosen.length === 0 || !shown) return;
      const saved: SavedEntry[] = chosen
        .map((row) => row.entry)
        .sort((a, b) => a.position - b.position)
        .map(({ track_id, position, chapter_id, in_seconds, out_seconds, note }) => ({
          track_id,
          position,
          chapter_id,
          in_seconds,
          out_seconds,
          note,
        }));
      const done = await write(() => remove({ entry_ids: chosen.map((row) => row.entry.entry_id) }));
      if (!done) return;
      selection.clear();
      tree.reload();
      // Reversible, so it runs at once with an Undo (SB2); no confirm.
      push(removedFrom(done.removed, shown.plan.name), "success", {
        label: UNDO,
        onClick: () => void restoreEntries(saved, shown.plan.name),
      });
    },
    [push, restoreEntries, selection, shown, tree, write],
  );

  // --- the entry buttons and the table's keys (FLW-17)

  const selectedIds = useMemo(() => new Set(selected.map((row) => row.entry.entry_id)), [selected]);
  const buttons = useMemo(() => entryButtons(rows, selectedIds), [rows, selectedIds]);

  // One step for every selected entry, a move at a time: each is the engine's
  // answer to the one before, so a refusal stops the rest. `edit` settles once
  // the page has re-read the Set, and a press that comes meanwhile waits its
  // turn and is worked out from the order then on screen, never the old one.
  const stepRef = useRef<(direction: -1 | 1) => Promise<void>>(async () => {});
  stepRef.current = async (direction) => {
    for (const move of stepMoves(rows, selectedIds, direction)) {
      if ((await edit((sets) => sets.moveEntry(move), { settle: true })) === null) break;
    }
  };
  const moving = useRef<Promise<void>>(Promise.resolve());
  const moveSelected = useCallback((direction: -1 | 1) => {
    moving.current = moving.current.then(() => stepRef.current(direction));
    return moving.current;
  }, []);

  // The button last pressed, for getting focus back: pressing "↓" has React move the row's DOM node,
  // and Remove unmounts the buttons, and either leaves focus on the page's body.
  const pressed = useRef<{ id: EntryButton["id"]; at: number } | null>(null);
  const rowsBox = useRef<HTMLDivElement>(null);
  // Artist gives way when the columns do not fit the pane (C246).
  const [rowsWidth, measureRows] = useMeasuredWidth(rowsBox);
  const narrowDrop = useMemo(
    () => columnsToDrop(columns.visible, columns.widths, rowsWidth),
    [columns.visible, columns.widths, rowsWidth],
  );
  const fittingColumns = useMemo(
    () => (narrowDrop.length === 0 ? columns.visible : columns.visible.filter((column) => !narrowDrop.includes(column.id))),
    [columns.visible, narrowDrop],
  );
  useLayoutEffect(() => {
    const last = pressed.current;
    if (!last) return;
    // Only a press that was just made, and only if focus was lost to the page.
    if (Date.now() - last.at > 5000) pressed.current = null;
    if (document.activeElement && document.activeElement !== document.body) return;
    const host = rowsBox.current;
    const target =
      last.id === "remove"
        ? host?.querySelector<HTMLElement>('[role="table"]')
        : host?.querySelector<HTMLElement>(`#${entryButtonDomId(last.id)}:not(:disabled)`);
    if (!target) return;
    pressed.current = null;
    target.focus();
  }, [rows]);

  const pressEntryButton = useCallback(
    (id: EntryButton["id"]) => {
      pressed.current = { id, at: Date.now() };
      const first = selected[0];
      if (id === "up") void moveSelected(-1);
      else if (id === "down") void moveSelected(1);
      else if (id === "remove") void removeEntries(selected);
      else if (id === "split" && first) splitAt(first);
      else if (id === "repeat" && first) insertRepeat(first);
    },
    [insertRepeat, moveSelected, removeEntries, selected, splitAt],
  );

  // --- Mix in and Mix out typed in the table (FLW-18)

  const [timeEditing, setTimeEditing] = useState<TimeTarget | null>(null);
  const [timeWords, setTimeWords] = useState<({ entryId: number; n: number } & ReturnType<typeof timeRefusalWords>) | null>(null);
  // Each refusal is its own, so the words shake again when the same one comes twice (Alerts, DEC-154).
  const refusals = useRef(0);
  const startTimeEdit = useCallback((entryId: number, field: TimeField) => {
    setTimeWords(null);
    setTimeEditing({ entryId, field });
  }, []);
  // What each save wrote until the Set is read again: the next cell's save is
  // built on it, so a quick Tab and Enter never send an old time back.
  const written = useRef(new Map<number, TimeTexts>());
  useEffect(() => {
    for (const id of [...written.current.keys()]) {
      if (timeEditing === null || timeEditing.entryId !== id) written.current.delete(id);
    }
  }, [timeEditing]);
  const stopTimeEdit = useCallback((keepWords: boolean, only?: TimeTarget) => {
    // A late answer for a cell the typing has left must not close the one it is in now.
    setTimeEditing((current) =>
      only && current && (current.entryId !== only.entryId || current.field !== only.field) ? current : null,
    );
    if (!keepWords) setTimeWords(null);
  }, []);
  // Saves of one entry go one after another: a blur's save and the Enter after
  // it must not both read the times as they stood before either.
  const pendingSaves = useRef(new Map<number, Promise<TimeSaveResult>>());
  const saveTime = useCallback(
    async (entryId: number, field: TimeField, text: string, move: 1 | -1 | 0): Promise<TimeSaveResult> => {
      const entry = entries.find((candidate) => candidate.entry_id === entryId);
      if (!entry) return "refused";
      const current = written.current.get(entryId) ?? timeTexts(entry);
      const save = timesToSave(current, field, text);
      let result: TimeSaveResult = "unchanged";
      if (save.changed) {
        const refusal: { message: string | null } = { message: null };
        const done = await edit(
          (sets) => sets.setEntryTimes({ entry_id: entryId, in_time: save.in_time, out_time: save.out_time }),
          { onRefused: (message) => (refusal.message = message) },
        );
        if (done === null) {
          if (refusal.message !== null) {
            setTimeWords({ entryId, n: (refusals.current += 1), ...timeRefusalWords(entry.track.title ?? "", refusal.message) });
          }
          return "refused";
        }
        written.current.set(entryId, {
          in: save.in_time ?? "",
          out: save.out_time ?? "",
        });
        result = "saved";
      }
      setTimeWords(null);
      const next = move === 0 ? null : nextTimeTarget(entries, entryId, field, move);
      // Only if this cell is still the one being typed in: a click on another
      // cell has already moved on.
      setTimeEditing((current) =>
        current && current.entryId === entryId && current.field === field ? next : current,
      );
      if (next && next.entryId !== entryId) setToSelect(next.entryId);
      return result;
    },
    [edit, entries],
  );
  const commitTime = useCallback(
    (entryId: number, field: TimeField, text: string, move: 1 | -1 | 0): Promise<TimeSaveResult> => {
      const run = () => saveTime(entryId, field, text, move);
      const queued = (pendingSaves.current.get(entryId) ?? Promise.resolve("unchanged" as TimeSaveResult)).then(run, run);
      pendingSaves.current.set(entryId, queued);
      const clear = () => {
        if (pendingSaves.current.get(entryId) === queued) pendingSaves.current.delete(entryId);
      };
      queued.then(clear, clear);
      return queued;
    },
    [saveTime],
  );

  // Alt+Up, Alt+Down and Delete act on the entries selected while the table itself has focus;
  // a field being typed in keeps its keys. Enter plays from the row and F2 types its Mix in
  // time: those are the table's own (onRowActivate, onRowEdit).
  const onSetKeys = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      // Tab goes from the table to the focused row's buttons, which sit at the row's right end where
      // the browser's order (the row's cells, then the page) would pass them by; Shift+Tab on the
      // first of them comes back to the table.
      if (event.key === "Tab" && !event.altKey && !event.ctrlKey && !event.metaKey) {
        const group = rowsBox.current?.querySelector<HTMLElement>('.prepare-row-buttons[role="group"]');
        const first = group?.querySelector<HTMLElement>("button:not(:disabled)");
        if (!event.shiftKey && target.getAttribute("role") === "table" && first) {
          event.preventDefault();
          first.focus();
        } else if (event.shiftKey && first && target === first) {
          event.preventDefault();
          target.closest<HTMLElement>('[role="table"]')?.focus();
        }
        return;
      }
      if (target.getAttribute("role") !== "table") return;
      const plain = !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
      const act = (run: () => void) => {
        event.preventDefault();
        event.stopPropagation();
        run();
      };
      if (event.altKey && !event.ctrlKey && !event.metaKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        if (selected.length > 0) act(() => void moveSelected(event.key === "ArrowUp" ? -1 : 1));
      } else if (plain && (event.key === "Delete" || event.key === "Backspace")) {
        if (selected.length > 0) act(() => void removeEntries(selected));
      } else if (plain && event.key === "Escape") {
        if (selected.length > 0) act(() => selection.clear());
      }
    },
    [moveSelected, removeEntries, selected, selection],
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

  // A track drag is in progress somewhere on the page: the Set outlines itself before the pointer
  // arrives. Document-level, because the drag starts in the source panel, not here. A Set entry's
  // own drag does not need it.
  const [trackDragging, setTrackDragging] = useState(false);
  useEffect(() => {
    const start = (event: DragEvent) => setTrackDragging(isTrackDrag(event.dataTransfer));
    const end = () => setTrackDragging(false);
    document.addEventListener("dragstart", start);
    document.addEventListener("dragend", end);
    document.addEventListener("drop", end);
    // A drag can end without a dragend reaching the document (the source row was re-rendered
    // away, a drop outside the window). Pointer and mouse events do not fire during a native
    // drag, so the next one means it is over.
    document.addEventListener("pointermove", end);
    document.addEventListener("mousedown", end);
    return () => {
      document.removeEventListener("pointermove", end);
      document.removeEventListener("mousedown", end);
      document.removeEventListener("dragstart", start);
      document.removeEventListener("dragend", end);
      document.removeEventListener("drop", end);
    };
  }, []);

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

  // Track details follow the row last clicked in either list: the Set, or the picker beside it.
  const panelShown = chosenIn === "panel" && panelTrack?.id != null ? panelTrack : undefined;
  const detail = useTrackDetail(panelShown ? (panelShown.id as number) : focused ? focused.entry.track_id : null);
  const previousEntryId = focused ? (entries[indexOfEntry(focused.entry.entry_id) - 1]?.entry_id ?? null) : null;
  /** Accept a transition warning between two entries, or withdraw the acceptance. */
  const acknowledgeBetween = useCallback(
    (fromEntryId: number, toEntryId: number, warning: SetWarning, accept: boolean) => {
      const ref = {
        from_entry_id: fromEntryId,
        to_entry_id: toEntryId,
        warning: warning.kind as "tempo_jump" | "key_clash" | "tempo_unknown",
      };
      if (accept) void edit((sets) => sets.acknowledge(ref));
      else void edit((sets) => sets.unacknowledge(ref));
    },
    [edit],
  );
  const acknowledge = useCallback(
    (warning: SetWarning, accept: boolean) => {
      if (!focused || previousEntryId === null) return;
      acknowledgeBetween(previousEntryId, focused.entry.entry_id, warning, accept);
    },
    [acknowledgeBetween, focused, previousEntryId],
  );

  const openEntity = useCallback(
    (kind: EntityKind, ref: string) => navigate(entityPath(kind, ref)),
    [navigate],
  );

  const zone =
    focused && shown && !panelShown ? (
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
      selectionCount={panelShown ? panelPicked.length : selected.length}
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
    // Picking a row is picking: Track details open from the Details button (C226), so the source
    // panel does not vanish under a click, and one right-hand panel shows at a time.
    { autoOpen: false },
  );
  const detailsOpen = useDetailsPanelOpen();

  // --- menus

  const [menu, setMenu] = useState<Menu | null>(null);
  // The header holds two menus: "Set" (new, notes, set list, export) and "View" (the lanes, the
  // transition strip, times and the columns), so the page keeps its rows (DEC-112).
  // The two menus open from their own button and close from it too (C113, C106).
  const setMenuButton = useMenuButton();
  const viewMenuButton = useMenuButton();
  const belowButton = (anchor: { current: HTMLElement | null }) => {
    const box = anchor.current?.getBoundingClientRect();
    return { x: box?.left ?? 0, y: box?.bottom ?? 0 };
  };

  const openEntryMenu = useCallback(
    async (row: EntryRow, index: number, x: number, y: number) => {
      selection.onRowMenu(row, index);
      setHeadingAt(null);
      setChosenIn("set");
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
      moreEntries(
        { count: chosen.length, credits: menu.credits, revealable: one !== null && one.entry.track.file_path !== "" },
        {
          onSimilar: one ? () => navigate(similarPath(one.entry.track_id)) : null,
          onOpenPage: openEntity,
          onCopy: () => void copyTrackRows(columns.visible, chosen, push),
          onReveal: one ? () => void revealOne(one.entry.track_id, push) : null,
        },
      ),
    );
  }, [
    columns.visible,
    push,
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

  // The Set's pane, for the floor below; the scale, for what the title keeps free of the entry buttons.
  const setBox = useRef<HTMLDivElement>(null);
  const scale = useScaleFactor();
  const titleMinWidth = ENTRY_TITLE_KEEP_PX * scale;

  const editing = useMemo(
    (): PrepareEditing => ({
      editing: timeEditing,
      invalid: timeWords !== null && timeEditing !== null && timeWords.entryId === timeEditing.entryId,
      startTimeEdit,
      commitTime,
      stopTimeEdit,
      entryButtons: {
        buttons,
        entryId: focused ? focused.entry.entry_id : null,
        press: pressEntryButton,
        openMenu: (row, anchor) =>
          void openEntryMenu(row, Math.max(0, rows.findIndex((candidate) => candidate === row)), anchor.x, anchor.y),
        titleMinWidth,
      },
      chapters: {
        edit: (chapter) => {
          setChapterError(null);
          setChapterEditing(chapter);
        },
      },
    }),
    [buttons, commitTime, focused, openEntryMenu, pressEntryButton, rows, startTimeEdit, stopTimeEdit, timeEditing, timeWords, titleMinWidth],
  );

  // The buttons are on the focused entry's row, and not while a time on that row is being typed in:
  // they would cover the Mix in and Mix out fields.
  const focusedId = focused ? focused.entry.entry_id : null;
  const typingId = timeEditing ? timeEditing.entryId : null;
  const hasButtons = buttons.length > 0;
  const rowEnd = useCallback(
    (row: PrepareRow) =>
      row.kind === "entry" && hasButtons && focusedId === row.entry.entry_id && typingId !== row.entry.entry_id ? (
        <EntryButtons row={row} />
      ) : null,
    [focusedId, hasButtons, typingId],
  );

  // A different Set starts with nothing being typed.
  useEffect(() => {
    setTimeEditing(null);
    setTimeWords(null);
  }, [shownId]);

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
  const [transitionOpen, setTransitionOpen] = useState(loadTransitionOpen);
  const toggleTransition = useCallback(() => {
    const next = !transitionOpen;
    setTransitionOpen(next);
    saveTransitionOpen(next);
  }, [transitionOpen]);
  const lanesShown = lanesOpen && (shown?.analysis.shape.entries.length ?? 0) > 0;
  const transitionShown = transitionOpen && entries.length > 0;

  // The Set keeps two whole rows under the lanes and the strip (WAVE-07).
  const rowHeight = useRowHeight();
  const setFloor = useSetAreaFloor(
    setBox,
    rowHeight,
    [shown?.setId ?? "none", lanesShown, transitionShown, scale].join(":"),
  );

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
  const [createRefusals, setCreateRefusals] = useState(0);
  const [choosingSource, setChoosingSource] = useState(false);
  // The Rekordbox playlists the "copy from" dialog offers: read through the
  // shared cache from the first time the dialog is asked for (not on every
  // visit), and kept for the next one.
  const [wantsPlaylists, setWantsPlaylists] = useState(false);
  const playlistRead = useSharedRead(wantsPlaylists ? LIBRARY_PLAYLISTS : NOT_WANTED);
  const playlists: LibraryPlaylistNode[] = playlistRead.value?.playlists ?? NO_PLAYLISTS;
  const playlistsSettled = !playlistRead.loading;
  const [copying, setCopying] = useState<NewSetSource | null>(null);
  const [busy, setBusy] = useState(false);

  const makeSet = useCallback(
    async (name: string, parentId: number | null) => {
      setBusy(true);
      const made = await tree.create("set", name, parentId);
      setBusy(false);
      if (!made.ok || !made.node) {
        setCreateError(made.error ?? "The Set could not be made.");
        setCreateRefusals((n) => n + 1);
        return;
      }
      setCreating(false);
      push(`Made the Set ${quoted(made.node.name)}`, "success");
      navigate(preparePath(made.node.id));
    },
    [navigate, push, tree],
  );

  // The dialog opens once the playlists are there (or could not be read: the
  // CuePoint sources are still offered without the Rekordbox ones).
  const [asking, setAsking] = useState(false);
  const chooseSource = useCallback(() => {
    setCreateError(null);
    setWantsPlaylists(true);
    setAsking(true);
  }, []);
  useEffect(() => {
    if (!asking || !wantsPlaylists || !playlistsSettled) return;
    setAsking(false);
    setChoosingSource(true);
  }, [asking, wantsPlaylists, playlistsSettled]);

  const makeSetFrom = useCallback(
    async (name: string, parentId: number | null) => {
      if (!copying) return;
      setBusy(true);
      const made = await tree.createSetFrom(setSourceOf(copying), name, parentId);
      setBusy(false);
      if (!made.ok || !made.node) {
        setCreateError(made.error ?? "The Set could not be made.");
        setCreateRefusals((n) => n + 1);
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
        errorKey={createRefusals}
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
        <ScreenHeader title="Prepare" />
        <Panel>
          <p className="prepare-note">{SETS_NEED_DESKTOP}</p>
        </Panel>
      </div>
    );
  }

  const noSets =
    tree.status === "ready" && !flattenCollections(tree.tree).some((node) => isSet(node));

  if (param === undefined || (noSets && !shown)) {
    return (
      <div className="screen screen--stack screen--scroll prepare-screen--waiting">
        <ScreenHeader title="Prepare" />
        {noSets ? (
          <>
            <EmptyState
              icon="prepare"
              headline={NO_SETS}
              description={WHAT_A_SET_IS}
              action={
                <div className="cp-button-row">
                  <Button
                    variant="primary"
                    onClick={() => {
                      setCreateError(null);
                      setCreating(true);
                    }}
                  >
                    {opensDialog("New Set")}
                  </Button>
                  <Button variant="secondary" onClick={() => void chooseSource()}>
                    {opensDialog("New Set from")}
                  </Button>
                </div>
              }
            />
          </>
        ) : tree.status === "error" ? (
          <Notice
            action={
              <Button variant="secondary" onClick={tree.reload}>
                {RETRY}
              </Button>
            }
          >
            {tree.error}
          </Notice>
        ) : (
          <LoadingPanel what="your Sets" />
        )}
        {dialogs}
      </div>
    );
  }

  if (!shown) {
    return (
      <div className="screen screen--stack screen--scroll prepare-screen--waiting">
        <ScreenHeader title="Prepare" />
        {setId === null ? (
          <Panel>
            <EmptyState
              icon="prepare"
              headline="This address names no Set"
              action={{ label: "Open your Sets", onClick: () => navigate(PREPARE_PATH) }}
            />
          </Panel>
        ) : prepared.problem ? (
          <Notice
            title="The Set could not open"
            action={
              <Button variant="secondary" onClick={prepared.reload}>
                {RETRY}
              </Button>
            }
          >
            {prepared.problem}
          </Notice>
        ) : (
          <LoadingPanel what="the Set" />
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
  // The chapter the dialog is open on as the Set has it now: a move changes its position under the dialog.
  const editingChapter = chapterEditing ? (plan.chapters.find((chapter) => chapter.id === chapterEditing.id) ?? null) : null;
  const firstChapter = [...plan.chapters].sort((a, b) => a.position - b.position)[0];
  // The transition the strip draws: the selected entry into the next one.
  const nextEntry = focused ? (entries[indexOfEntry(focused.entry.entry_id) + 1] ?? null) : null;
  const nextRow = nextEntry ? rows.find((row) => isEntryRow(row) && row.entry.entry_id === nextEntry.entry_id) : undefined;
  const stripWarnings = nextRow && isEntryRow(nextRow) ? nextRow.transition : [];
  const facts = headerFacts(entries.length, plan.running_time, analysis);

  const table = (
    <div className="prepare-set" ref={setBox}>
      {lanesShown && (
        <SetLanes
          shape={analysis.shape}
          titles={titles}
          chapters={plan.chapters}
          selectedEntryId={focused ? focused.entry.entry_id : null}
          onSelect={setToSelect}
        />
      )}
      {transitionShown && (
        <SetTransition
          entries={entries}
          selectedEntryId={focused ? focused.entry.entry_id : null}
          onSelect={setToSelect}
          onSeeProgress={() => navigate("/settings", { state: settingsFocusState("waveforms") })}
          shape={analysis.shape}
          warnings={stripWarnings}
          onAccept={(warning, accept) => {
            if (focused && nextEntry) acknowledgeBetween(focused.entry.entry_id, nextEntry.entry_id, warning, accept);
          }}
        />
      )}
      <div className="prepare-set__rows" ref={measureRows} onKeyDownCapture={onSetKeys}>
        <PrepareEditingContext.Provider value={editing}>
        <TrackTable<PrepareRow>
          columns={fittingColumns}
          source={source}
          widths={columns.widths}
          onWidthsChange={columns.setWidths}
          onColumnMove={columns.move}
          onColumns={() => setPicking(true)}
          onSelectAll={() => {
            setHeadingAt(null);
            setChosenIn("set");
            selection.selectAll();
          }}
          selectedKeys={selection.keys}
          getRowKey={idOfRow}
          {...playMarks}
          rowClassName={(row) => (row.kind === "heading" ? "prepare-heading" : undefined)}
          rowEnd={rowEnd}
          onSelect={(row, index, event) => {
            // Picking is only picking. A Set's entry does not move into the Inspector as a shared
            // element: a view transition sends the pointer to the page root while it plays, which
            // would swallow the second click of a double-click-to-play and a shift-click range.
            if (row.kind !== "entry") {
              setHeadingAt(index);
              return;
            }
            setHeadingAt(null);
            setChosenIn("set");
            selection.onRowClick(row, index, event);
          }}
          onRowActivate={(row) => {
            if (row.kind === "entry") void playFrom(indexOfEntry(row.entry.entry_id));
            else {
              setChapterError(null);
              setChapterEditing(row.chapter);
            }
          }}
          onRowEdit={(row) => {
            // F2 types the Mix in time of an entry; a chapter's heading has no time to type.
            if (row.kind !== "entry") return;
            // The input lives in the Mix in column: show it first, else F2 would type into nothing.
            if (!columns.visible.some((column) => column.id === "in")) columns.toggle("in");
            startTimeEdit(row.entry.entry_id, "in");
          }}
          onRowContextMenu={(row, index, anchor) => {
            if (row.kind === "entry") void openEntryMenu(row, index, anchor.x, anchor.y);
            else setMenu({ kind: "heading", x: anchor.x, y: anchor.y, row });
          }}
          activeIndex={headingAt ?? selection.anchor}
          canDragRow={(row) => row.kind === "entry"}
          onRowDragStart={(row, _index, transfer) => {
            if (row.kind !== "entry") return;
            transfer.setData(SET_ENTRY_MIME, String(row.entry.entry_id));
            transfer.effectAllowed = "move";
          }}
          acceptsRowDrop={accepts}
          onRowDrop={moveByDrop}
          scrollToIndex={scrollTo}
          onEmptyDrop={(transfer) => {
            // An empty Set has no rows to drop on, so the whole table takes it: the first track
            // goes to the start of the first chapter.
            const ids = draggedTrackIds(transfer);
            if (ids.length === 0) return;
            void insertTracks(ids, { position: 0, chapter_id: firstChapter?.id ?? null }, ids.map(() => null));
          }}
          dropLabel={`Drop here to add to “${setName}”`}
          dragActive={trackDragging}
          dropTag={(row) => (row.kind === "heading" ? chapterName(row.chapter) : undefined)}
          emptyState={<EmptyState icon="prepare" headline={EMPTY_SET_HEADLINE} description={`${EMPTY_SET_HELP}.`} />}
          resetKey={String(shown.setId)}
          ariaLabel="Set entries"
        />
        </PrepareEditingContext.Provider>
      </div>
    </div>
  );

  return (
    <div
      className="screen prepare-screen"
      style={setFloor === null ? undefined : ({ "--prepare-set-floor": `${setFloor}px` } as CSSProperties)}
    >
      <ScreenHeader
        title="Prepare"
        beside={
          <Select
            label="Set"
            className="prepare-header__picker"
            value={String(shown.setId)}
            onChange={(event) => navigate(preparePath(Number(event.target.value)))}
            options={pickerNodes.map((node) => ({
              value: String(node.id),
              label: `${"　".repeat(node.depth)}${node.name}`,
              disabled: !isSet(node),
            }))}
          />
        }
        actions={
          <>
            <Button variant="secondary" menu {...setMenuButton.buttonProps}>
              Set
            </Button>
            <Button variant="secondary" menu {...viewMenuButton.buttonProps}>
              View
            </Button>
          </>
        }
        pageActions={
          <>
            <Button variant="primary" onClick={() => void playFrom(0)} disabled={entries.length === 0 || !player}>
              Play Set
            </Button>
            <Button variant="secondary" onClick={() => setExporting(true)}>
              {opensDialog("Export to Rekordbox")}
            </Button>
          </>
        }
        summary={
          <span className="prepare-header__facts" role="status">
            {timeWords && (
              <Hint text={timeWords.line} inline>
                <span key={timeWords.n} className="prepare-header__refusal" tabIndex={0}>
                  <span className="prepare-header__refusal-reason">{timeWords.reason}</span>
                  <span className="prepare-header__refusal-entry">{timeWords.entry}</span>
                </span>
              </Hint>
            )}
            <span className="prepare-header__summary">
              {facts
                .filter((fact) => !fact.action)
                .map((fact, index) => (
                  <span key={fact.text} className={fact.strong ? "prepare-header__warnings" : undefined}>
                    {index > 0 && <span aria-hidden="true"> · </span>}
                    <Hint text={fact.title} inline>
                      <span tabIndex={fact.title ? 0 : undefined}>{fact.text}</span>
                    </Hint>
                  </span>
                ))}
            </span>
            {facts
              .filter((fact) => fact.action)
              .map((fact) => (
                <span key={fact.action} className="prepare-header__action">
                  {fact.text}
                  <span aria-hidden="true"> · </span>
                  <Hint text={fact.title} inline>
                    <button
                      type="button"
                      className="cp-link cp-link--go prepare-header__link"
                      onClick={() => navigate("/clean", { state: cleanSectionState("missing") })}
                    >
                      {fact.actionText}
                    </button>
                  </Hint>
                </span>
              ))}
          </span>
        }
      />

      <PrepareLayout
        set={table}
        sourceHidden={detailsOpen}
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
              onPickedChange={onPanelPicked}
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
                ? `Actions for ${countNoun(menu.rows.length, "entry", "entries")}`
                : "Entry actions"
          }
        />
      )}
      {setMenuButton.open && (
        <TrackContextMenu
          {...belowButton(setMenuButton.anchor)}
          anchor={setMenuButton.anchor}
          label="Set"
          onClose={setMenuButton.close}
          items={[
            {
              id: "new",
              label: "New Set…",
              onSelect: () => {
                setCreateError(null);
                setCreating(true);
              },
            },
            { id: "new-from", label: "New Set from…", onSelect: () => void chooseSource() },
            {
              id: "notes",
              label: `${notesLinkLabel(plan.notes)}…`,
              title: notesLinkTitle(plan.notes),
              onSelect: () => {
                setNotesError(null);
                setNotesOpen(true);
              },
            },
            { id: "save", label: "Save set list…", onSelect: () => void setList.save(target), separatorBefore: true },
            { id: "copy", label: "Copy set list", onSelect: () => void setList.copy(target) },
          ]}
        />
      )}

      {viewMenuButton.open && (
        <TrackContextMenu
          {...belowButton(viewMenuButton.anchor)}
          anchor={viewMenuButton.anchor}
          label="View"
          onClose={viewMenuButton.close}
          // Ticked items (C126): the label never flips, the tick says on or off, and the menu stays
          // open so several can be set.
          items={[
            { id: "lanes", label: "Tempo lane", checked: lanesOpen, onSelect: toggleLanes },
            { id: "transition", label: "Transition strip", checked: transitionOpen, onSelect: toggleTransition },
            { id: "times", label: "Mix in and Mix out", checked: timesShown ? true : timeEntries.some((entry) => !entry.hidden) ? "mixed" : false, onSelect: toggleTimes },
          ]}
        />
      )}

      <SetNotesDialog
        set={notesOpen ? { name: setName, notes: plan.notes } : null}
        error={notesError}
        errorKey={notesRefusals}
        onSave={(notes) => void saveNotes(notes)}
        onClose={() => setNotesOpen(false)}
      />
      <ChapterDialog
        chapter={editingChapter}
        error={chapterError}
        onSave={(update) => void saveChapter(update)}
        onClose={() => setChapterEditing(null)}
        canMoveUp={editingChapter !== null && editingChapter.position > 0}
        canMoveDown={editingChapter !== null && editingChapter.position < plan.chapters.length - 1}
        canDelete={plan.chapters.length > 1}
        onMove={(delta) => editingChapter && moveChapter(editingChapter, delta)}
        onDelete={() => {
          if (!editingChapter) return;
          setChapterDeleting(editingChapter);
          setChapterEditing(null);
        }}
      />
      <Modal
        open={chapterDeleting !== null}
        title={chapterDeleting ? deleteTitle("chapter", chapterName(chapterDeleting)) : deleteTitle("chapter")}
        onClose={() => setChapterDeleting(null)}
        variant="danger"
        size="small"
        primaryAction={{
          label: "Delete chapter",
          onClick: () => chapterDeleting && void deleteChapter(chapterDeleting),
        }}
        secondaryAction={{ label: "Cancel", onClick: () => setChapterDeleting(null) }}
      >
        <p className="prepare-note">{deleteLead}</p>
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
        onRestore={columns.restore}
      />
      {dialogs}
    </div>
  );
}
