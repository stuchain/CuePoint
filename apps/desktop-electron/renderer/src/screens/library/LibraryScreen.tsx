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
  FilterRuleSet,
  LibraryPlaylistNode,
  LibrarySummary,
  LibraryTrackRow,
  RefreshApplied,
  RefreshDiff,
  TagUsage,
} from "../../api/cuepointBridge.types";
import { FilterBar, type FilterCollectionOption } from "./FilterBar";
import { LibraryHeader } from "./LibraryHeader";
import { LIBRARY_COLUMNS } from "./libraryColumns";
import { LibraryPane } from "./LibraryPane";
import { RefreshPreviewDialog } from "./RefreshPreviewDialog";
import { SelectionActions } from "./SelectionActions";
import { QUEUE_ACTION_LIMIT, useLibraryPlayback } from "./useLibraryPlayback";
import { TrackDetailPanel } from "./TrackDetailPanel";
import { defaultSortForScope, findByPath } from "./playlistTree";
import {
  canReorder,
  defaultSortForCollection,
  findCollection,
  flattenCollections,
  holdsTracks,
  iconForKind,
  movedPosition,
  rulesOf,
} from "./collectionTree";
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
import type { ValueNames } from "./filterText";
import { batchSelection, type BatchAction } from "./libraryBatch";
import { organizationMenuItems } from "./trackMenu";
import { useLibraryBatch } from "./useLibraryBatch";
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
}

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
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    rows: LibraryTrackRow[];
    index: number;
    target: BatchTarget;
    /** A row's menu carries playback; the toolbar's carries the actions only. */
    kind: "row" | "selection";
  } | null>(null);
  const [picker, setPicker] = useState<{
    kind: "collection" | "tag-add" | "tag-remove";
    target: BatchTarget;
  } | null>(null);
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
  /** Where a row drag started, which is the only Collection position in hand. */
  const draggingRow = useRef<{ index: number; count: number } | null>(null);
  const detail = useTrackDetail(selection.selection.lastId);

  /** The Collection the table is showing, when it is one that holds rows. */
  const scopedCollection = useMemo(() => {
    if (query.scope !== "collection" || query.collectionId == null) return null;
    const node = findCollection(collections.tree, query.collectionId);
    return node && holdsTracks(node) ? node : null;
  }, [collections.tree, query.collectionId, query.scope]);

  const batch = useLibraryBatch({
    onMessage: (message, tone) => push(message, tone),
    onApplied: () => {
      // The table and the pane agree about what happened without a manual
      // refresh: the rows are re-read and the tree's counts with them.
      window_.reload();
      collections.reload();
    },
  });

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
      const inSelection = row.id != null && isSelected(selection.selection, row.id);
      const rows =
        inSelection && selection.count > 1 ? await selection.gatherRows(QUEUE_ACTION_LIMIT) : [row];
      // Playback takes rows and is capped; an organization action takes the
      // selection *as a description* and is not. The two must not be confused:
      // gathering 47,913 rows to tag them is the mistake DEC-045 exists to
      // prevent, and `rows` here is already a capped sample.
      const target: BatchTarget =
        inSelection && selection.count > 0
          ? { selection: batchSelection(selection.selection, query), count: selection.count }
          : { selection: { track_ids: row.id == null ? [] : [row.id] }, count: 1 };
      setMenu({ x, y, rows, index, target, kind: "row" });
    },
    [query, selection],
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
    (kind: "collection" | "tag-add" | "tag-remove", target: BatchTarget) => {
      setPicker({ kind, target });
      if (kind !== "collection") void loadTags();
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

  /** The organization entries, for whichever surface asked for them. */
  const actionItems = useCallback(
    (target: BatchTarget): TrackContextMenuItem[] =>
      organizationMenuItems(
        {
          count: target.count,
          collection: scopedCollection
            ? { id: scopedCollection.id, name: scopedCollection.name }
            : null,
        },
        {
          onAddToCollection: () => openPicker("collection", target),
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
    [openPicker, runAction, scopedCollection],
  );

  const menuItems = useMemo((): TrackContextMenuItem[] => {
    if (!menu) return [];
    const organization = actionItems(menu.target);
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
      ...organization,
    ];
  }, [actionItems, copyRows, menu, playback]);

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
      await batch.start({
        action: {
          kind: "add_to_collection",
          value: collectionId,
          target: node?.name ?? "the Collection",
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
      collection: new Map(
        flattenCollections(collections.tree).map((node) => [node.id, node.name]),
      ),
    }),
    [collections.tree, tags],
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
        // with its folders taken out is a list whose indentation lies.
        disabled: !holdsTracks(node),
        hint: holdsTracks(node) ? node.entry_count.toLocaleString() : undefined,
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
    // A refused question first. The engine names the clause it could not
    // honour, and "No tracks match this search" over a refusal sends someone
    // looking for tracks that were never asked for (ORG-12).
    if (window_.error) return window_.error;
    // Then three different problems, three different answers. "No tracks"
    // over a filtered view sends someone looking for a broken import.
    if (filtered) return "No tracks match this search.";
    if (query.playlistId != null) return "This playlist is empty.";
    if (smart || query.scope === "smart") return "Nothing matches these rules right now.";
    if (query.scope === "collection") return "This Collection is empty. Drop tracks onto it.";
    return "No tracks yet.";
  }, [filtered, query.playlistId, query.scope, smart, window_.error]);

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
          onDropTracks={dropTracks}
          onNotify={(message, tone) => push(message, tone === "warning" ? "warning" : "success")}
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
            <p>
              It runs in the background, and there is no undo — every change is
              recorded in each track&rsquo;s History.
            </p>
          </Modal>

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
            onActions={(anchor) =>
              setMenu({
                x: anchor.x,
                y: anchor.y,
                rows: [],
                index: -1,
                target: {
                  selection: batchSelection(selection.selection, query),
                  count: selection.count,
                },
                kind: "selection",
              })
            }
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
