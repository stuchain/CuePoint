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
  Modal,
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
  BatchSelection,
  CollectionNode,
  EntityKind,
  FilterRuleSet,
  LibraryPlaylistNode,
  LibrarySummary,
  LibraryTrackRow,
  RefreshApplied,
  RefreshDiff,
  TagUsage,
  TrackCreditLinks,
} from "../../api/cuepointBridge.types";
import { FilterBar, type FilterCollectionOption } from "./FilterBar";
import { LibraryHeader } from "./LibraryHeader";
import { LIBRARY_COLUMNS } from "./libraryColumns";
import { LibraryPane } from "./LibraryPane";
import { RefreshPreviewDialog } from "./RefreshPreviewDialog";
import { RekordboxExportDialog } from "./RekordboxExportDialog";
import { rekordboxExportBridge } from "../../api/rekordboxExportBridge";
import { SelectionActions } from "./SelectionActions";
import { QUEUE_ACTION_LIMIT, useLibraryPlayback } from "./useLibraryPlayback";
import { TrackDetailPanel } from "./TrackDetailPanel";
import { defaultSortForScope, findByPath, type PlaylistTreeNode } from "./playlistTree";
import {
  canReorder,
  defaultSortForCollection,
  findCollection,
  flattenCollections,
  holdsTracks,
  iconForKind,
  isCollection,
  isSet,
  movedPosition,
  rulesOf,
  setPickerNodes,
} from "./collectionTree";
import { NewSetFromDialog } from "./NewSetFromDialog";
import {
  SET_ENTRY_LIMIT,
  newSetMadeLine,
  selectionSource,
  selectionTooLarge,
  setSourceOf,
  type NewSetSource,
} from "./newSetFrom";
import { setScopeNote } from "./setScope";
import { useSetList } from "../prepare/useSetList";
import {
  draggedTracks,
  isTrackDrag,
  setDraggedQuerySelection,
  setDraggedTrackIds,
  type DraggedTracks,
} from "./collectionDrag";
import { PickerDialog, type PickerItem } from "./PickerDialog";
import { SaveSmartDialog, type FolderOption } from "./SaveSmartDialog";
import { TagManagerDialog } from "./TagManagerDialog";
import { smartQuery, type SmartAttachment } from "./smartFilter";
import { deletedLine, mergedLine, type TagPatch } from "./tagManager";
import { describeRule, type ValueNames } from "./filterText";
import { emptyStateFor } from "./libraryEmpty";
import type { LibraryOpening } from "./libraryLink";
import { batchConsequence, batchSelection, type BatchAction } from "./libraryBatch";
import { cleanMenuItems } from "./libraryClean";
import { creditsFor, discoverMenuItems } from "./libraryDiscover";
import { organizationMenuItems } from "./trackMenu";
import { useLibraryBatch } from "./useLibraryBatch";
import { useLibraryClean } from "./useLibraryClean";
import { useLibraryChanges } from "../../api/libraryChanges";
import { revealTrack } from "../clean/revealTrack";
import { forgetWaveforms } from "../../components/waveform/waveformCache";
import { useCollectionTree } from "./useCollectionTree";
import { followJob } from "./followJob";
import { appliedLine, jobErrorMessage } from "./libraryFormat";
import { DEFAULT_LIBRARY_QUERY, type LibraryQuery, queryKey } from "./libraryQuery";
import { copySummary, tracksAsText, writeClipboard } from "./trackClipboard";
import { isSelected, onlySelectedId } from "./trackSelection";
import { useFacet, useFilterVocabulary } from "./useFilterVocabulary";
import { usePlaylistTree } from "./usePlaylistTree";
import { useTrackDetail } from "./useTrackDetail";
import { COPY_LIMIT, useTrackSelection } from "./useTrackSelection";
import { useTrackWindow } from "./useTrackWindow";
import "../screens.css";
import "./library.css";

/** What the page is doing, when it is doing something. */
type Busy = null | "importing" | "checking" | "applying";

/**
 * The tracks an organization action will apply to, and how many (DEC-045).
 *
 * Resolved when the menu opens rather than when an entry is chosen, because
 * the two are not always the same tracks: right-clicking a row outside the
 * selection acts on that row, which is the convention every file manager
 * follows and the one a user assumes.
 */
interface BatchTarget {
  selection: BatchSelection;
  count: number;
  /** The one track, when the target is exactly one known track (CLEAN-13). */
  trackId?: number | null;
}

/** What the page's picker chooses: a Collection, a Set, or a tag to add or remove. */
type PickerKind = "collection" | "set" | "tag-add" | "tag-remove";

/** What the header's export opens with ticked: nothing (DEC-087). */
const NOTHING_TICKED: readonly number[] = [];

const BUSY_LABEL: Record<Exclude<Busy, null>, string> = {
  importing: "Importing…",
  checking: "Checking…",
  applying: "Refreshing…",
};

export interface LibraryScreenProps {
  /** Opens the "how do I export from Rekordbox" dialog the shell owns. */
  onOpenRekordboxInstructions?: () => void;
  /**
   * Which part of the page the user asked for (DEC-062, ORG-13).
   *
   * The Collections nav destination renders this same page aimed at the tree.
   * It is a prop rather than a route read here, so the page stays a component
   * that is handed what it needs and the routing stays in `App.tsx`.
   */
  focus?: "collections";
  /**
   * Rules to open the whole library filtered by (CLEAN-12, DEC-075).
   *
   * What a Health count hands over. Applied once per navigation — its token is
   * the navigation's — so clicking the same count again opens it again, and a
   * later render does not undo whatever the user did with the bar since.
   */
  openWith?: LibraryOpening | null;
  /**
   * Start "Check for changes" once, for the navigation this token names
   * (PREP-10): the Rekordbox export's "Refresh first" from the Prepare page.
   */
  refreshWith?: string | null;
  /**
   * Open a track on the Clean page (CLEAN-13). A prop for `focus`'s reason:
   * routing stays in `App.tsx`. Absent, the Inspector offers no link.
   */
  onOpenInClean?: (trackId: number) => void;
  /**
   * Clean's missing-file view (DEC-088), which the Rekordbox export's
   * missing-file count links to. A prop for `focus`'s reason.
   */
  onOpenMissingFiles?: () => void;
  /**
   * Open an artist's or a label's page (DISCOVER-11): from the Inspector's
   * credits, a filter chip and the operations list. A prop for `focus`'s
   * reason. Absent, none of them is offered.
   */
  onOpenEntity?: (kind: EntityKind, ref: string) => void;
  /** Open Similar tracks for one track (DISCOVER-11). Absent, not offered. */
  onOpenSimilar?: (trackId: number) => void;
  /**
   * Open a Set on the Prepare page (DEC-104): the tree's "Open in Prepare",
   * the Inspector's Sets and the Set scope's note. A prop for `focus`'s
   * reason. Absent, nothing offers it.
   */
  onOpenInPrepare?: (setId: number) => void;
}

export function LibraryScreen({
  onOpenRekordboxInstructions,
  focus,
  openWith,
  refreshWith,
  onOpenInClean,
  onOpenMissingFiles,
  onOpenEntity,
  onOpenSimilar,
  onOpenInPrepare,
}: LibraryScreenProps) {
  const { push } = useToast();
  const [summary, setSummary] = useState<LibrarySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Busy>(null);
  const [diff, setDiff] = useState<RefreshDiff | null>(null);
  const [lastApplied, setLastApplied] = useState<RefreshApplied | null>(null);
  const [query, setQuery] = useState<LibraryQuery>(DEFAULT_LIBRARY_QUERY);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  /**
   * The Rekordbox export, open, and what it opened with ticked (EXPORT-07).
   * One dialog for both ways in — the header and a Collection's menu — so
   * there is one preview and one confirm path (DEC-087).
   */
  const [exporting, setExporting] = useState<{ ids: readonly number[] } | null>(null);

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
  /**
   * "Save set list…" and "Copy set list" (DEC-110), shared with Prepare. Its
   * `available` is also whether this shell can do anything with a Set at all,
   * which every Set affordance on the page is offered by (PREP-09).
   */
  const setList = useSetList({
    onMessage: (message, tone) => push(message, tone),
    onGone: collections.reload,
  });
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
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    rows: LibraryTrackRow[];
    index: number;
    target: BatchTarget;
    /** A row's menu carries playback; the toolbar's carries the actions only. */
    kind: "row" | "selection";
    /** The one track's credits, for its Artist and Label pages (DISCOVER-11). */
    credits: TrackCreditLinks | null;
  } | null>(null);
  const [picker, setPicker] = useState<{
    kind: PickerKind;
    target: BatchTarget;
  } | null>(null);
  /** "New Set from…" open on a source, and the engine's last refusal (DEC-104). */
  const [newSetFrom, setNewSetFrom] = useState<NewSetSource | null>(null);
  const [newSetBusy, setNewSetBusy] = useState(false);
  const [newSetError, setNewSetError] = useState<string | null>(null);
  const [tags, setTags] = useState<TagUsage[]>([]);
  /**
   * The rules the bar is showing, which are not always the query's (ORG-12).
   *
   * While a Smart Collection is open and unchanged the table asks for it by
   * id and `query.filters` is empty, so the bar's copy is the only place the
   * rules are. `smartQuery` is what keeps the two in step.
   */
  const [barRules, setBarRules] = useState<FilterRuleSet | null>(null);
  const [smart, setSmart] = useState<SmartAttachment | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingError, setSavingError] = useState<string | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  /**
   * Collections this session's last refresh took tracks out of (DEC-011).
   *
   * The preview already had to work out which ones to warn about, so this is
   * the answer it gave, kept long enough to say something better than "drop
   * tracks onto it" to someone whose tracks have just gone.
   */
  const [emptiedByRefresh, setEmptiedByRefresh] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  /**
   * Bumped to put the keyboard in the Collections tree (ORG-13).
   *
   * A count rather than a flag: arriving on the Collections destination is an
   * event, and a flag that stayed true would pull focus back out of whatever
   * the user did next on every render.
   */
  const [collectionsFocus, setCollectionsFocus] = useState(0);
  /**
   * What the Beatport ids in rules an Artist or Label page sent are called
   * (DISCOVER-11), so their chips read as names. Kept while the page stays,
   * since a rule the user keeps is still that artist.
   */
  const [openedNames, setOpenedNames] = useState<Readonly<Record<string, string>>>({});

  useEffect(() => {
    if (focus === "collections") setCollectionsFocus((token) => token + 1);
  }, [focus]);

  /**
   * Open on the rules a Health count sent (CLEAN-12).
   *
   * The whole library, those rules in the bar, and nothing else: a playlist or
   * Collection left selected would narrow the count, and the number shown on
   * Health is a count of the library.
   */
  const openedWith = useRef<string | null>(null);
  useEffect(() => {
    if (!openWith || openedWith.current === openWith.token) return;
    openedWith.current = openWith.token;
    playlists.select(null);
    collections.select(null);
    setSmart(null);
    setBarRules(openWith.rules);
    setOpenedNames(openWith.names ?? {});
    setQuery({ ...DEFAULT_LIBRARY_QUERY, filters: openWith.rules });
  }, [collections, openWith, playlists]);
  /** Where a row drag started, which is the only Collection position in hand. */
  const draggingRow = useRef<{ index: number; count: number } | null>(null);
  const detail = useTrackDetail(selection.selection.lastId);

  /** The Collection the table is showing, when it is one that holds rows. */
  const scopedCollection = useMemo(() => {
    if (query.scope !== "collection" || query.collectionId == null) return null;
    const node = findCollection(collections.tree, query.collectionId);
    return node && holdsTracks(node) ? node : null;
  }, [collections.tree, query.collectionId, query.scope]);

  /**
   * The Set the table is showing, when it is one (PREP-09). The Library lists
   * each of its tracks once (fact 3), so order and removal are Prepare's: no
   * row drag and no "Remove from" here, and a note says what the rows are.
   */
  const scopedSet = scopedCollection && isSet(scopedCollection) ? scopedCollection : null;

  const batch = useLibraryBatch({
    onMessage: (message, tone) => push(message, tone),
    onApplied: () => {
      // The table and the pane agree about what happened without a manual
      // refresh: the rows are re-read and the tree's counts with them — and
      // the Inspector, whose values a Clean batch changes (CLEAN-13).
      window_.reload();
      collections.reload();
      detail.reload();
    },
  });

  const clean = useLibraryClean({
    batch,
    onMessage: (message, tone) => push(message, tone),
    onChanged: () => {
      window_.reload();
      detail.reload();
    },
  });

  // A revert or a restore started from Activity changed what this page shows.
  useLibraryChanges(() => {
    window_.reload();
    detail.reload();
    collections.reload();
  });

  /**
   * Show a track's file, or the nearest folder when it has moved (CLEAN-12's
   * reveal). A build without the folder route shows the path as it always did.
   */
  const reveal = useCallback(
    (trackId: number | null | undefined, path: string) => {
      if (trackId != null && window.cuepoint?.getTrackFolder) {
        void revealTrack(trackId).then((outcome) => {
          if (outcome) push(outcome.message, outcome.tone);
        });
        return;
      }
      void window.cuepoint?.showItemInFolder?.(path);
    },
    [push],
  );

  /**
   * Let go of the Smart Collection the bar was editing, rules and all.
   *
   * Its rules came with it and they go with it: leaving them in the bar would
   * narrow a playlist by clauses the user never typed there, and they would
   * have no way of knowing where they came from.
   */
  const leaveSmart = useCallback(() => {
    setSmart(null);
    setBarRules(null);
  }, []);

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
      const dropped = smart !== null;
      leaveSmart();
      setQuery((previous) => ({
        ...previous,
        playlistId: node?.id ?? null,
        scope: null,
        collectionId: null,
        ...(dropped ? { filters: null } : {}),
        // A set list is an order; a folder or the whole library is not
        // (DEC-044), so the scope decides what the table opens on.
        sort: defaultSortForScope(inTree),
        dir: "asc",
      }));
    },
    [collections, leaveSmart, playlists, smart],
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

      if (node.kind === "smart") {
        // Opening a Smart Collection puts its rules in the bar — visibly the
        // same clauses a user would have built by hand, because they *are* the
        // same clauses (DEC-016). The table still asks for it by id, so the
        // rules resolve on the engine's side rather than being sent twice.
        const attached: SmartAttachment = {
          id: node.id,
          name: node.name,
          saved: rulesOf(node),
        };
        setSmart(attached);
        setBarRules(attached.saved);
        setQuery((previous) => ({
          ...previous,
          playlistId: null,
          sort: order.sort,
          dir: order.dir,
          ...smartQuery(attached, attached.saved),
        }));
        return;
      }

      // A plain Collection is a scope of its own. Rules a Smart Collection
      // brought with it leave with it; rules the user built by hand stay,
      // which is the same rule `scopeTo` follows for a playlist.
      const dropped = smart !== null;
      leaveSmart();
      setQuery((previous) => ({
        ...previous,
        playlistId: null,
        scope: "collection",
        collectionId: node.id,
        ...(dropped ? { filters: null } : {}),
        sort: order.sort,
        dir: order.dir,
      }));
    },
    [collections, leaveSmart, playlists, smart],
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
      onOpenInPrepare={onOpenInPrepare ? (set) => onOpenInPrepare(set.id) : undefined}
      onReveal={(path) => reveal(detail.detail?.track.id, path)}
      onError={(message) => push(message, "warning")}
      onTrackChanged={() => {
        window_.reload();
        detail.reload();
      }}
      onOpenInClean={onOpenInClean}
      onMessage={(message) => push(message, "success")}
      onOpenEntity={onOpenEntity}
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
   * The credits the Discover entries need, for a target of one known track,
   * or null when no entry needs them.
   *
   * Read before the menu opens, as a selection's rows are, so the menu never
   * changes shape under the pointer. A menu that needs nothing read opens at
   * once, as it always has: only the one-track menu of a page that can open
   * pages waits.
   */
  const discoverCredits = useCallback(
    (target: BatchTarget): Promise<TrackCreditLinks | null> | null => {
      if (!onOpenEntity || !onOpenSimilar || target.count !== 1 || target.trackId == null) {
        return null;
      }
      return creditsFor(target.trackId, detail.detail);
    },
    [detail.detail, onOpenEntity, onOpenSimilar],
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
      const inSelection = row.id != null && isSelected(selection.selection, row.id);
      const rows =
        inSelection && selection.count > 1 ? await selection.gatherRows(QUEUE_ACTION_LIMIT) : [row];
      // Playback takes rows and is capped; an organization action takes the
      // selection *as a description* and is not. The two must not be confused:
      // gathering 47,913 rows to tag them is the mistake DEC-045 exists to
      // prevent, and `rows` here is already a capped sample.
      const target: BatchTarget =
        inSelection && selection.count > 0
          ? {
              selection: batchSelection(selection.selection, query),
              count: selection.count,
              trackId: selection.count === 1 ? row.id : null,
            }
          : {
              selection: { track_ids: row.id == null ? [] : [row.id] },
              count: 1,
              trackId: row.id,
            };
      const reading = discoverCredits(target);
      const credits = reading ? await reading : null;
      setMenu({ x, y, rows, index, target, kind: "row", credits });
    },
    [discoverCredits, query, selection],
  );

  /** Run one organization action over a target, through ORG-07's entry point. */
  const runAction = useCallback(
    (action: BatchAction, target: BatchTarget) =>
      void batch.start({ action, selection: target.selection, count: target.count }),
    [batch],
  );

  // ------------------------------------------------- rules, saved and edited

  /**
   * The bar changed its rules.
   *
   * Everything the page has to decide about a rule set is in `smartQuery`:
   * whether the table asks a Collection by id or asks these rules directly.
   * Nothing here knows which of the three cases it is in.
   */
  const changeFilters = useCallback(
    (next: FilterRuleSet | null) => {
      setBarRules(next);
      setQuery((previous) => ({ ...previous, ...smartQuery(smart, next) }));
    },
    [smart],
  );

  /** Keep the rules and let go of the Collection they came from. */
  const detachSmart = useCallback(() => {
    setSmart(null);
    setQuery((previous) => ({ ...previous, ...smartQuery(null, barRules) }));
    collections.select(null);
  }, [barRules, collections]);

  /**
   * Write the bar's rules over the Smart Collection they came from.
   *
   * Only when asked. The whole reason the bar tracks "modified" is that a
   * saved rule set must not change because somebody narrowed a view.
   */
  const updateSmart = useCallback(async () => {
    if (!smart || !barRules) return;
    setSaving(true);
    const result = await collections.updateSmart(smart.id, barRules);
    setSaving(false);
    if (!result.ok) {
      push(result.error ?? "Could not update that Smart Collection.", "warning");
      return;
    }
    const saved: SmartAttachment = { id: smart.id, name: smart.name, saved: barRules };
    setSmart(saved);
    // Unmodified again, so the table goes back to asking the engine for the
    // Collection rather than for a copy of its rules.
    setQuery((previous) => ({ ...previous, ...smartQuery(saved, barRules) }));
    push(`Updated “${smart.name}”.`, "success");
  }, [barRules, collections, push, smart]);

  /** Save the bar's rules as a new Smart Collection, and open it. */
  const saveSmart = useCallback(
    async (name: string, parentId: number | null) => {
      if (!barRules) return;
      setSaving(true);
      setSavingError(null);
      const result = await collections.saveSmart(name, barRules, parentId);
      setSaving(false);
      if (!result.ok || !result.node) {
        setSavingError(result.error ?? "Could not save that Smart Collection.");
        return;
      }
      setSaveOpen(false);
      // Saved and opened, so what was just made is what is on screen. The node
      // the engine answered with carries the rules it stored, which is what
      // the bar now holds — not the copy that was sent.
      const node = result.node;
      const attached: SmartAttachment = {
        id: node.id,
        name: node.name,
        saved: rulesOf(node),
      };
      setSmart(attached);
      setBarRules(attached.saved);
      collections.select(node);
      playlists.select(null);
      const order = defaultSortForCollection(node);
      setQuery((previous) => ({
        ...previous,
        playlistId: null,
        sort: order.sort,
        dir: order.dir,
        ...smartQuery(attached, attached.saved),
      }));
      push(`Saved “${node.name}”.`, "success");
    },
    [barRules, collections, playlists, push],
  );

  /** The library's tags, read when a picker needs them and again after a change. */
  const loadTags = useCallback(async () => {
    const bridge = window.cuepoint?.getTags;
    if (!bridge) return;
    try {
      const payload = await bridge();
      if (mounted.current) setTags(payload.tags);
    } catch {
      // Suggestions are a convenience; a name can still be typed.
    }
  }, []);

  const openPicker = useCallback(
    (kind: PickerKind, target: BatchTarget) => {
      setPicker({ kind, target });
      if (kind === "tag-add" || kind === "tag-remove") void loadTags();
    },
    [loadTags],
  );

  // The vocabulary is read once at the start rather than only when a picker
  // opens: a chip that says "Tag has Peak-time" needs the name behind the id
  // the rule carries, and a Smart Collection can be opened before any picker.
  useEffect(() => {
    void loadTags();
  }, [loadTags]);

  // ------------------------------------------------------- the tag vocabulary

  /**
   * One write against the tag vocabulary, and everything it makes stale.
   *
   * A rename changes what every chip says, a merge and a delete change which
   * tracks a rule matches, and all three change the counts in the pane. The
   * table is re-read for the same reason ORG-11's batch re-reads it: what is
   * on screen has to be what the engine has.
   */
  const runTagWrite = useCallback(
    async (run: () => Promise<string>) => {
      setTagError(null);
      try {
        const said = await run();
        await loadTags();
        window_.reload();
        collections.reload();
        detail.reload();
        push(said, "success");
      } catch (error) {
        setTagError(error instanceof Error ? error.message : "That change did not go through.");
      }
    },
    [collections, detail, loadTags, push, window_],
  );

  /**
   * "New Set from the selection…" (PREP-12, DEC-063): the tracks the menu acts
   * on, in the table's order, become a Set's one chapter. A Set is an order
   * and a selection is a description, so the ids are read once, here, and the
   * dialog shows how many before anything is written. Too many is refused
   * whole, before any id is read. Filed beside the Collection the table is
   * showing, as "New Set from…" files a Set beside its source.
   */
  const openNewSetFromSelection = useCallback(
    async (target: BatchTarget) => {
      const tooMany = selectionTooLarge(target.count);
      if (tooMany) {
        push(tooMany, "warning");
        return;
      }
      const inSelection = target.count > 1 || target.trackId == null;
      const ids = inSelection
        ? await selection.gatherIds(SET_ENTRY_LIMIT)
        : [target.trackId as number];
      if (!mounted.current || ids.length === 0) return;
      setNewSetError(null);
      setNewSetFrom(selectionSource(ids, scopedCollection?.parent_id ?? null));
    },
    [push, scopedCollection, selection],
  );

  /** The organization entries, for whichever surface asked for them. */
  const actionItems = useCallback(
    (target: BatchTarget, credits: TrackCreditLinks | null): TrackContextMenuItem[] => [
      // Discover's ways out of one track (DISCOVER-11), in the same list.
      ...(onOpenEntity && onOpenSimilar && target.trackId != null
        ? discoverMenuItems(
            { count: target.count, credits },
            {
              onSimilar: () => target.trackId != null && onOpenSimilar(target.trackId),
              onOpenPage: onOpenEntity,
            },
          )
        : []),
      ...organizationMenuItems(
        {
          count: target.count,
          collection:
            scopedCollection && !scopedSet
              ? { id: scopedCollection.id, name: scopedCollection.name }
              : null,
        },
        {
          onAddToCollection: () => openPicker("collection", target),
          onAddToSet: setList.available ? () => openPicker("set", target) : undefined,
          onNewSetFromSelection: setList.available
            ? () => void openNewSetFromSelection(target)
            : undefined,
          onRemoveFromCollection: () =>
            scopedCollection &&
            runAction(
              {
                kind: "remove_from_collection",
                value: scopedCollection.id,
                target: scopedCollection.name,
              },
              target,
            ),
          onAddTag: () => openPicker("tag-add", target),
          onRemoveTag: () => openPicker("tag-remove", target),
          onRate: (starsWanted) =>
            runAction(
              {
                kind: "set_rating",
                value: starsWanted,
                target: starsWanted == null ? "no rating" : String(starsWanted),
              },
              target,
            ),
          onFavorite: (favorite) =>
            runAction({ kind: "set_favorite", value: favorite, target: "favorite" }, target),
        },
      ),
      // Clean's entries (CLEAN-13), in the same list both surfaces render.
      ...cleanMenuItems({ count: target.count }, clean.handlersFor(target)),
    ],
    [
      clean,
      onOpenEntity,
      onOpenSimilar,
      openNewSetFromSelection,
      openPicker,
      runAction,
      scopedCollection,
      scopedSet,
      setList.available,
    ],
  );

  const menuItems = useMemo((): TrackContextMenuItem[] => {
    if (!menu) return [];
    const organization = actionItems(menu.target, menu.credits);
    if (menu.kind === "selection") {
      // Nothing above them here, so the first entry's divider would be a line
      // along the top of the menu.
      return organization.map((item, at) =>
        at === 0 ? { ...item, separatorBefore: false } : item,
      );
    }
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
        onSelect: () => path && reveal(rows[0]?.id, path),
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
      ...organization,
    ];
  }, [actionItems, copyRows, menu, playback, reveal]);

  /**
   * Tracks dropped on a Collection in the pane (ORG-09's target, ORG-11's source).
   *
   * A list of ids goes through the membership route, which answers with how
   * many were added and how many were already there. "Everything matching"
   * cannot: it is a query, and only the batch path takes one — so it goes
   * there, reports itself, and tells the pane to stay quiet rather than
   * announcing an outcome it does not have.
   */
  const dropTracks = useCallback(
    async (collectionId: number, carried: DraggedTracks) => {
      if ("ids" in carried) return collections.addTracks(collectionId, carried.ids);

      const node = findCollection(collections.tree, collectionId);
      const set = node !== null && isSet(node);
      await batch.start({
        action: {
          kind: "add_to_collection",
          value: collectionId,
          target: node?.name ?? (set ? "the Set" : "the Collection"),
          ...(set ? { holder: "set" as const } : {}),
        },
        selection: batchSelection(selection.selection, query),
        count: selection.count,
      });
      return { ok: true, silent: true };
    },
    [batch, collections, query, selection],
  );

  /**
   * A row dragged into a new place inside the Collection it belongs to.
   *
   * The position it came from is the only one the renderer knows without
   * reading the whole membership, which is why exactly one row moves and why
   * every other case is refused out loud rather than quietly.
   */
  const reorderTo = useCallback(
    async (toIndex: number, transfer: DataTransfer) => {
      const allowed = canReorder(
        {
          scope: query.scope,
          collectionId: query.collectionId,
          sort: query.sort,
          dir: query.dir,
          q: query.q,
          filtered: Boolean(query.filters && query.filters.rules.length > 0),
        },
        scopedCollection,
      );
      if (!allowed.ok) {
        push(allowed.why, "warning");
        return;
      }

      const carried = draggedTracks(transfer);
      const from = draggingRow.current?.index ?? null;
      if (!carried || from === null) return;
      if (!("ids" in carried) || carried.ids.length !== 1) {
        push("Tracks are rearranged one at a time.", "warning");
        return;
      }

      const read = window.cuepoint?.getCollectionEntries;
      const write = window.cuepoint?.reorderCollectionEntry;
      if (!read || !write || query.collectionId == null) return;

      try {
        // One entry, at the position the drag started from. With no duplicates
        // and no filter — both of which `canReorder` has just insisted on — a
        // row's index is its position in the Collection.
        const page = await read({
          collectionId: query.collectionId,
          offset: from,
          limit: 1,
        });
        const entry = page.entries[0];
        if (!entry) return;
        await write({ entry_id: entry.id, position: movedPosition(from, toIndex) });
        window_.reload();
        collections.reload();
      } catch (error) {
        push(
          error instanceof Error ? error.message : "Could not move that track.",
          "warning",
        );
      }
    },
    [collections, push, query, scopedCollection, window_],
  );

  const saveTag = useCallback(
    (id: number, patch: TagPatch) =>
      void runTagWrite(async () => {
        const bridge = window.cuepoint?.updateTag;
        if (!bridge) throw new Error("This build cannot edit tags.");
        const { tag } = await bridge({ id, ...patch });
        return `Saved “${tag.name}”.`;
      }),
    [runTagWrite],
  );

  const deleteTag = useCallback(
    (tag: TagUsage) =>
      void runTagWrite(async () => {
        const bridge = window.cuepoint?.deleteTag;
        if (!bridge) throw new Error("This build cannot edit tags.");
        const { untagged } = await bridge({ id: tag.id });
        return deletedLine(tag.name, untagged);
      }),
    [runTagWrite],
  );

  const mergeTags = useCallback(
    (source: TagUsage, target: TagUsage) =>
      void runTagWrite(async () => {
        const bridge = window.cuepoint?.mergeTags;
        if (!bridge) throw new Error("This build cannot edit tags.");
        const { moved } = await bridge({ source_id: source.id, target_id: target.id });
        return mergedLine(source.name, target.name, moved);
      }),
    [runTagWrite],
  );

  // ---------------------------------------------- what the bar is offered

  /** Every Collection a membership clause can name, folders drawn and unchoosable. */
  const filterCollections = useMemo(
    (): FilterCollectionOption[] =>
      flattenCollections(collections.tree).map((node) => ({
        id: node.id,
        name: node.name,
        depth: node.depth,
        selectable: holdsTracks(node),
        isSet: isSet(node),
      })),
    [collections.tree],
  );

  /** The folders a new Smart Collection can go in. Only folders hold nodes. */
  const folders = useMemo(
    (): FolderOption[] =>
      flattenCollections(collections.tree)
        .filter((node) => node.kind === "folder")
        .map((node) => ({ id: node.id, name: node.name, depth: node.depth })),
    [collections.tree],
  );

  /**
   * The names behind the ids a membership rule carries.
   *
   * A rule names a tag and a Collection by id so it survives a rename
   * (ORG-05); a chip has to read as the name anyway, so the page — which has
   * both vocabularies — hands the lookup to the bar.
   */
  const ruleNames = useMemo(
    (): ValueNames => ({
      tag: new Map(tags.map((tag) => [tag.id, tag.name])),
      // A Set's chip says so, as its picker entry does (PREP-09): "in Set X"
      // and "in Collection X" are one field and one rule (PREP-02).
      collection: new Map(
        flattenCollections(collections.tree).map((node) => [
          node.id,
          isSet(node) ? `${node.name} (Set)` : node.name,
        ]),
      ),
      beatport: new Map(Object.entries(openedNames)),
    }),
    [collections.tree, openedNames, tags],
  );

  /** What the open picker offers: the tree, or the tag vocabulary. */
  const pickerItems = useMemo((): PickerItem[] => {
    if (!picker) return [];
    if (picker.kind === "collection") {
      return flattenCollections(collections.tree).map((node) => ({
        id: node.id,
        label: node.name,
        depth: node.depth,
        icon: iconForKind(node.kind),
        // A folder holds nodes and a Smart Collection holds a question
        // (DEC-061). Both are drawn and neither can be chosen, because a tree
        // with its folders taken out is a list whose indentation lies. A Set
        // holds tracks but is not a crate (fact 2): it has its own entry.
        disabled: !isCollection(node),
        hint: isCollection(node) ? node.entry_count.toLocaleString() : undefined,
      }));
    }
    if (picker.kind === "set") {
      // The Sets and the folders on the way to them (`setPickerNodes`).
      return setPickerNodes(collections.tree).map((node) => ({
        id: node.id,
        label: node.name,
        depth: node.depth,
        icon: iconForKind(node.kind),
        disabled: !isSet(node),
        hint: isSet(node) ? node.entry_count.toLocaleString() : undefined,
      }));
    }
    return tags.map((tag) => ({
      id: tag.id,
      label: tag.name,
      icon: "tag" as const,
      hint: tag.track_count.toLocaleString(),
    }));
  }, [collections.tree, picker, tags]);

  const choosePicked = useCallback(
    (item: PickerItem) => {
      const current = picker;
      setPicker(null);
      if (!current) return;
      if (current.kind === "set") {
        // The same operation as a Collection's (DEC-102): the engine appends
        // to the Set's last chapter and skips what it already holds (DEC-058).
        runAction(
          { kind: "add_to_collection", value: item.id, target: item.label, holder: "set" },
          current.target,
        );
        return;
      }
      const kind =
        current.kind === "collection"
          ? "add_to_collection"
          : current.kind === "tag-add"
            ? "add_tag"
            : "remove_tag";
      runAction({ kind, value: item.id, target: item.label }, current.target);
    },
    [picker, runAction],
  );

  const createAndTag = useCallback(
    async (name: string) => {
      const current = picker;
      setPicker(null);
      const create = window.cuepoint?.createTag;
      if (!current || !create) return;
      try {
        // `create_or_get`: typing a name that already exists in another
        // capitalization reuses the tag rather than making a second one, and
        // that rule stays in the engine where the unique index enforces it.
        const { tag } = await create({ name });
        void loadTags();
        runAction({ kind: "add_tag", value: tag.id, target: tag.name }, current.target);
      } catch (error) {
        push(error instanceof Error ? error.message : "Could not make that tag.", "warning");
      }
    },
    [loadTags, picker, push, runAction],
  );

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

  // Once per navigation that asked, as `openWith` is applied once.
  const refreshedWith = useRef<string | null>(null);
  useEffect(() => {
    if (!refreshWith || refreshedWith.current === refreshWith) return;
    refreshedWith.current = refreshWith;
    void handleCheck();
  }, [handleCheck, refreshWith]);

  const handleApply = useCallback(
    async ({ confirmReferences }: { confirmReferences: boolean }) => {
      const start = window.cuepoint?.startLibraryRefreshApply;
      const results = window.cuepoint?.getJobResults;
      if (!start || !results || !diff) return;

      // Read before the apply clears it: after this the diff is gone, and it
      // is the only thing that knows which Collections were about to lose
      // tracks (DEC-011).
      // Sets as well as Collections: PREP-02 counts them apart, so a Set a
      // refresh emptied is only known by its own list.
      const emptied = new Set([
        ...(diff.references?.collection_ids ?? []),
        ...(diff.references?.set_ids ?? []),
      ]);
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
      if (mounted.current) setEmptiedByRefresh(emptied);
      // A refresh can move a track to another file, whose waveform is another.
      forgetWaveforms();
      push("Library refreshed.", "success");
    },
    [collections, diff, loadSummary, playlists, push, run, window_],
  );

  // --------------------------------------------------------- Rekordbox export

  const openExport = useCallback(
    (ids: readonly number[]) => {
      if (!rekordboxExportBridge()) {
        push("Exporting to Rekordbox needs the desktop app with the engine connected.", "warning");
        return;
      }
      setExporting({ ids });
    },
    [push],
  );

  // ------------------------------------------------------------------- Sets

  /**
   * "New Set from…" a Collection, a Smart Collection or a Rekordbox playlist
   * (DEC-104): the dialog asks a name and a folder, and says what copying
   * means for this source before anything is written.
   */
  const openNewSetFrom = useCallback((node: CollectionNode | PlaylistTreeNode) => {
    setNewSetError(null);
    if ("path" in node) {
      setNewSetFrom({ kind: "playlist", id: node.id, name: node.name, parentId: null });
      return;
    }
    setNewSetFrom({
      kind: node.kind === "smart" ? "smart" : "collection",
      id: node.id,
      name: node.name,
      parentId: node.parent_id,
    });
  }, []);

  const makeSetFrom = useCallback(
    async (name: string, parentId: number | null) => {
      if (!newSetFrom) return;
      setNewSetBusy(true);
      setNewSetError(null);
      const result = await collections.createSetFrom(setSourceOf(newSetFrom), name, parentId);
      if (!mounted.current) return;
      setNewSetBusy(false);
      if (!result.ok || !result.node) {
        setNewSetError(result.error ?? "Could not make that Set.");
        return;
      }
      setNewSetFrom(null);
      // Made and opened, as a saved Smart Collection is: what was just made is
      // what the table shows, and the tree reveals it.
      scopeToCollection(result.node);
      push(newSetMadeLine(result.node.name, result.trackCount ?? 0), "success");
    },
    [collections, newSetFrom, push, scopeToCollection],
  );

  const exportDialog = (
    <RekordboxExportDialog
      open={exporting !== null}
      initialIds={exporting?.ids ?? NOTHING_TICKED}
      tree={collections.tree}
      onClose={() => setExporting(null)}
      // DEC-082: one click to the recommended path. The dialog closes and the
      // refresh starts; the export is not queued behind it, because the
      // refresh may change what the user meant to export.
      onRefreshFirst={() => {
        setExporting(null);
        void handleCheck();
      }}
      onImport={() => {
        setExporting(null);
        void handleImport();
      }}
      onOpenMissingFiles={
        onOpenMissingFiles
          ? () => {
              setExporting(null);
              onOpenMissingFiles();
            }
          : undefined
      }
    />
  );

  // ------------------------------------------------------------------ render

  const filtered = query.q.trim() !== "" || (query.filters?.rules.length ?? 0) > 0;
  const empty = useMemo(
    () =>
      emptyStateFor({
        error: window_.error,
        filtered,
        scope: query.scope,
        playlistId: query.playlistId,
        smartName: smart?.name ?? null,
        rules: (barRules?.rules ?? []).map((rule) =>
          describeRule(vocabulary, rule, ruleNames),
        ),
        emptiedByRefresh:
          query.collectionId != null && emptiedByRefresh.has(query.collectionId),
        isSet: scopedSet !== null,
      }),
    [
      barRules,
      emptiedByRefresh,
      filtered,
      query.collectionId,
      query.playlistId,
      query.scope,
      ruleNames,
      scopedSet,
      smart,
      vocabulary,
      window_.error,
    ],
  );

  const emptyState = (
    <div className="library-screen__empty-state">
      <p className="library-screen__empty-headline">{empty.headline}</p>
      {empty.rules.length > 0 && (
        <ul className="library-screen__empty-rules" aria-label="The rules being asked">
          {empty.rules.map((rule, index) => (
            <li key={`${rule}-${index}`}>{rule}</li>
          ))}
        </ul>
      )}
      {empty.hint && <p className="library-screen__empty-hint">{empty.hint}</p>}
    </div>
  );

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
        onExport={() => openExport(NOTHING_TICKED)}
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
          onDropTracks={dropTracks}
          onNotify={(message, tone) => push(message, tone === "warning" ? "warning" : "success")}
          collectionsFocusToken={collectionsFocus}
          onExportCollection={(node) => openExport([node.id])}
          onOpenInPrepare={onOpenInPrepare ? (node) => onOpenInPrepare(node.id) : undefined}
          onSaveSetList={setList.available ? (node) => void setList.save(node) : undefined}
          onCopySetList={setList.available ? (node) => void setList.copy(node) : undefined}
          onNewSetFrom={setList.available ? openNewSetFrom : undefined}
          canMakeSets={setList.available}
        />

        <div className="library-screen__main">
          <div ref={searchRef}>
            <FilterBar
              vocabulary={vocabulary}
              // The bar's rules, not the query's: a Smart Collection that is
              // still what it saved resolves on the engine's side, so the
              // query carries an id where the bar carries the clauses.
              filters={barRules}
              onFiltersChange={changeFilters}
              query={query.q}
              onQueryChange={(q) => setQuery((previous) => ({ ...previous, q }))}
              total={window_.total}
              facet={facet.facet}
              onRequestFacet={facet.load}
              collections={filterCollections}
              names={ruleNames}
              smart={smart}
              onSaveSmart={() => {
                setSavingError(null);
                setSaveOpen(true);
              }}
              onUpdateSmart={() => void updateSmart()}
              onDetachSmart={detachSmart}
              onManageTags={() => {
                setTagError(null);
                setTagsOpen(true);
                void loadTags();
              }}
              problem={window_.error}
              onRetry={window_.retry}
              onOpenPage={
                onOpenEntity ? (page) => onOpenEntity(page.kind, page.ref) : undefined
              }
            />
            {/* Inside the bar's grid row rather than a row of its own: the
                page's rows are positional, and the table must keep the one
                that grows. */}
            {scopedSet && (
              <p className="library-screen__scope-note" role="note">
                {setScopeNote(scopedSet)}
                {onOpenInPrepare && (
                  <button
                    type="button"
                    className="library-screen__scope-link"
                    onClick={() => onOpenInPrepare(scopedSet.id)}
                  >
                    Open in Prepare
                  </button>
                )}
              </p>
            )}
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
              // A row is picked up as the selection when it belongs to it, and
              // as itself otherwise — the same rule the context menu follows,
              // because they are the same gesture with a different hand.
              onRowDragStart={(row, index, transfer) => {
                const inSelection = row.id != null && isSelected(selection.selection, row.id);
                if (inSelection && selection.selection.all) {
                  setDraggedQuerySelection(transfer, selection.count);
                } else if (inSelection && selection.count > 1) {
                  setDraggedTrackIds(transfer, [...selection.selection.ids]);
                } else {
                  setDraggedTrackIds(transfer, row.id == null ? [] : [row.id]);
                }
                transfer.effectAllowed = "copyMove";
                draggingRow.current = {
                  index,
                  count: inSelection ? selection.count : 1,
                };
              }}
              // Offered inside a Collection and nowhere else. Whether *this*
              // Collection can be rearranged is answered on the drop, out
              // loud, because a user dragging a row inside one has said
              // plainly what they meant.
              acceptsRowDrop={(transfer) =>
                query.scope === "collection" &&
                query.collectionId != null &&
                // A Set's rows are its tracks once each, not its entries
                // (fact 3): its order is Prepare's to change (PREP-09).
                scopedSet === null &&
                isTrackDrag(transfer)
              }
              onRowDrop={(toIndex, transfer) => void reorderTo(toIndex, transfer)}
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

          <PickerDialog
            open={picker !== null}
            title={
              picker?.kind === "collection"
                ? "Add to Collection"
                : picker?.kind === "set"
                  ? "Add to Set"
                  : picker?.kind === "tag-remove"
                    ? "Remove a tag"
                    : "Add a tag"
            }
            items={pickerItems}
            onChoose={choosePicked}
            onClose={() => setPicker(null)}
            // Only a tag can be made from here: a new Collection needs a place
            // in the tree, and this dialog has no way to ask about one.
            onCreate={picker?.kind === "tag-add" ? (name) => void createAndTag(name) : undefined}
            emptyText={
              picker?.kind === "collection"
                ? "There are no Collections yet — make one in the pane on the left."
                : picker?.kind === "set"
                  ? "There are no Sets yet — make one with New Set in the pane on the left."
                  : "No tags yet."
            }
          />

          <Modal
            open={batch.pending !== null}
            title="That is a lot of tracks"
            onClose={batch.cancel}
            primaryAction={{
              label: "Apply",
              onClick: () => void batch.confirm(),
              loading: batch.busy,
            }}
            secondaryAction={{ label: "Cancel", onClick: batch.cancel }}
          >
            <p>{batch.question}</p>
            {batch.pending && (
              <p>{batchConsequence(batch.pending.action.kind, batch.pending.action.holder)}</p>
            )}
          </Modal>

          <SelectionActions
            count={selection.count}
            describedByQuery={selection.selection.all}
            revealPath={revealPath}
            total={window_.total}
            busy={copying}
            onCopy={() => void handleCopy()}
            onReveal={(path) =>
              reveal(onlySelectedId(selection.selection, window_.total), path)
            }
            onClear={selection.clear}
            onSelectAll={selection.selectAllMatching}
            onActions={(anchor) => {
              const target: BatchTarget = {
                selection: batchSelection(selection.selection, query),
                count: selection.count,
                trackId:
                  selection.count === 1
                    ? onlySelectedId(selection.selection, window_.total)
                    : null,
              };
              const open = (credits: TrackCreditLinks | null) =>
                setMenu({
                  x: anchor.x,
                  y: anchor.y,
                  rows: [],
                  index: -1,
                  target,
                  kind: "selection",
                  credits,
                });
              const reading = discoverCredits(target);
              if (reading) void reading.then(open);
              else open(null);
            }}
          />

          <div className="library-screen__columns">
            <Button variant="secondary" onClick={() => setPickerOpen(true)}>
              Columns…
            </Button>
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

      {exportDialog}

      <SaveSmartDialog
        open={saveOpen}
        rules={barRules}
        vocabulary={vocabulary}
        names={ruleNames}
        folders={folders}
        // Where the tree is pointing, so the obvious folder is already chosen.
        defaultParentId={collections.selected?.parent_id ?? null}
        busy={saving}
        error={savingError}
        onSave={(name, parentId) => void saveSmart(name, parentId)}
        onClose={() => setSaveOpen(false)}
      />

      {clean.dialogs}

      <NewSetFromDialog
        source={newSetFrom}
        folders={folders}
        busy={newSetBusy}
        error={newSetError}
        onCreate={(name, parentId) => void makeSetFrom(name, parentId)}
        onClose={() => setNewSetFrom(null)}
      />

      <TagManagerDialog
        open={tagsOpen}
        tags={tags}
        error={tagError}
        onSave={saveTag}
        onDelete={deleteTag}
        onMerge={mergeTags}
        onClose={() => setTagsOpen(false)}
      />
    </div>
  );
}
