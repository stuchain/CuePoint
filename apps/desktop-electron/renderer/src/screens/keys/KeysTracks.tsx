/**
 * The tracks under the wheel (PAGES-16, FLW-21).
 *
 * The Library's own table over the rules the choice makes — "Key is any of …" and "In
 * playlist is any of …" — so these are the tracks **Open in Library** shows, in the same
 * order, and the count above is this table's. The row behaves as a Library row does: a
 * double-click plays it with the whole table behind it (DEC-012), a right-click opens the
 * menu, and the bar above the table is the Library's (FLW-8): `trackActionGroups` builds
 * its six buttons and `LibraryToolbar` draws them.
 *
 * What the Library does in its page — the Collection and tag pickers, and the batch that
 * runs after one — is repeated here at the size this page needs; Clean's windows are
 * opened by way of the page's `navigate` and the same link state the Library uses.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  LibraryTrackDetail,
  LibraryTrackRow,
  TagUsage,
  TrackCreditLinks,
  EntityKind,
  FilterRuleSet,
} from "../../api/cuepointBridge.types";
import { useToast } from "../../components/Toast";
import { TrackContextMenu, type TrackContextMenuItem } from "../../components/TrackContextMenu";
import { ColumnPicker, TrackTable, useColumnLayout } from "../../components/table";
import { reportUnexpected } from "../../reporting/reporting";
import type { CleanTracks } from "../clean/cleanTracks";
import type { FixAction } from "../clean/cleanLink";
import { revealTrack } from "../clean/revealTrack";
import { BatchConfirmDialog } from "../library/BatchConfirmDialog";
import { batchSelection, type BatchAction } from "../library/libraryBatch";
import { cleanCapLine, cleanTracksFor } from "../library/libraryClean";
import { LIBRARY_COLUMNS } from "../library/libraryColumns";
import { creditsFor } from "../library/libraryDiscover";
import { DEFAULT_LIBRARY_QUERY, queryKey, type LibraryQuery } from "../library/libraryQuery";
import { LibraryToolbar } from "../library/LibraryToolbar";
import { PickerDialog, type PickerItem } from "../library/PickerDialog";
import { copySummary, gatherTracksAsText, writeClipboard } from "../library/trackClipboard";
import {
  flattenCollections,
  iconForKind,
  isCollection,
  isSet,
  setPickerNodes,
  type CollectionTreeNode,
} from "../library/collectionTree";
import {
  menuFromGroups,
  trackActionGroups,
  type TrackActionGroup,
  type TrackActionGroupId,
} from "../library/trackActions";
import { isSelected, onlySelectedId, selectedRowIndex } from "../library/trackSelection";
import { useLibraryBatch } from "../library/useLibraryBatch";
import { QUEUE_ACTION_LIMIT, useLibraryPlayback } from "../library/useLibraryPlayback";
import { COPY_LIMIT, useTrackSelection } from "../library/useTrackSelection";
import { useTrackWindow } from "../library/useTrackWindow";

/** The keys table keeps a layout of its own, apart from the Library's. */
const KEYS_TABLE_LAYOUT_KEY = "cuepoint-keys-table-layout";

/**
 * The order the Library opens on (by artist, A to Z), not Camelot order: the list is the same
 * rows in the same order as **Open in Library**, which opens with the Library's default sort.
 * Clicking a column header sorts only this table.
 */
const KEYS_ORDER = { sort: DEFAULT_LIBRARY_QUERY.sort, dir: DEFAULT_LIBRARY_QUERY.dir };

/** What a bar action or menu acts on: the selection as it stands, never rows gathered. */
interface Target {
  selection: ReturnType<typeof batchSelection>;
  count: number;
  trackId: number | null;
}

type PickerKind = "collection" | "set" | "tag-add" | "tag-remove";

interface MenuState {
  x: number;
  y: number;
  rows: LibraryTrackRow[];
  index: number;
  target: Target;
  kind: "row" | "selection";
  group: TrackActionGroupId | null;
  first: number | null;
  credits: TrackCreditLinks | null;
}

interface KeysTracksProps {
  rules: FilterRuleSet;
  /** The track the Inspector should show, and how many are selected. */
  onSelectTrack: (trackId: number | null, count: number) => void;
  /** Changes when something outside the table changed its rows. */
  reloadToken: number;
  /** The detail the Inspector holds, reused for the one track's credits. */
  heldDetail: LibraryTrackDetail | null;
  /** The Collections tree, for "Add to Collection" and "Add to Set". */
  collections: readonly CollectionTreeNode[];
  onCollectionsChanged: () => void;
  onOpenEntity: (kind: EntityKind, ref: string) => void;
  onOpenSimilar: (trackId: number) => void;
  onOpenInClean: (trackId: number) => void;
  onOpenMatch: (tracks: CleanTracks) => void;
  onOpenFix: (tracks: CleanTracks, action: FixAction) => void;
}

export function KeysTracks({
  rules,
  onSelectTrack,
  reloadToken,
  heldDetail,
  collections,
  onCollectionsChanged,
  onOpenEntity,
  onOpenSimilar,
  onOpenInClean,
  onOpenMatch,
  onOpenFix,
}: KeysTracksProps) {
  const { push } = useToast();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const [order, setOrder] = useState<{ sort: string; dir: "asc" | "desc" }>(KEYS_ORDER);
  const [choosingColumns, setChoosingColumns] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [picker, setPicker] = useState<{ kind: PickerKind; target: Target } | null>(null);
  const [tags, setTags] = useState<TagUsage[]>([]);

  const query = useMemo<LibraryQuery>(
    () => ({ ...DEFAULT_LIBRARY_QUERY, filters: rules, sort: order.sort, dir: order.dir }),
    [order.dir, order.sort, rules],
  );
  const columns = useColumnLayout<LibraryTrackRow>(KEYS_TABLE_LAYOUT_KEY, LIBRARY_COLUMNS);
  const window_ = useTrackWindow(query);
  const selection = useTrackSelection(query, window_.total, window_.source.getRow);
  const playback = useLibraryPlayback({ query, onMessage: (message) => push(message, "info") });
  const { reload } = window_;

  useEffect(() => {
    if (reloadToken > 0) reload();
  }, [reload, reloadToken]);

  const lastId = selection.selection.lastId;
  const count = selection.count;
  useEffect(() => {
    onSelectTrack(count > 0 ? lastId : null, count);
  }, [count, lastId, onSelectTrack]);

  const batch = useLibraryBatch({
    onMessage: (message, tone) => push(message, tone),
    onApplied: () => {
      reload();
      onCollectionsChanged();
    },
  });

  const runAction = useCallback(
    (action: BatchAction, target: Target) =>
      void batch.start({ action, selection: target.selection, count: target.count }),
    [batch],
  );

  // ------------------------------------------------------------- the pickers

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
    (kind: PickerKind, target: Target) => {
      setPicker({ kind, target });
      if (kind === "tag-add" || kind === "tag-remove") void loadTags();
    },
    [loadTags],
  );

  const pickerItems = useMemo((): PickerItem[] => {
    if (!picker) return [];
    if (picker.kind === "collection") {
      return flattenCollections(collections).map((node) => ({
        id: node.id,
        label: node.name,
        depth: node.depth,
        icon: iconForKind(node.kind),
        disabled: !isCollection(node),
        hint: isCollection(node) ? node.entry_count.toLocaleString() : undefined,
      }));
    }
    if (picker.kind === "set") {
      return setPickerNodes(collections).map((node) => ({
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
  }, [collections, picker, tags]);

  const choosePicked = useCallback(
    (item: PickerItem) => {
      const current = picker;
      setPicker(null);
      if (!current) return;
      if (current.kind === "set") {
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
        const { tag } = await create({ name });
        void loadTags();
        runAction({ kind: "add_tag", value: tag.id, target: tag.name }, current.target);
      } catch (error) {
        reportUnexpected(error);
        push(error instanceof Error ? error.message : "Could not make that tag.", "warning");
      }
    },
    [loadTags, picker, push, runAction],
  );

  // ---------------------------------------------------------- the bar and menu

  const barTarget = useCallback(
    (): Target => ({
      selection: batchSelection(selection.selection, query),
      count: selection.count,
      trackId: selection.count === 1 ? onlySelectedId(selection.selection, window_.total) : null,
    }),
    [query, selection.count, selection.selection, window_.total],
  );

  const copyRows = useCallback(
    async (gather: () => Promise<LibraryTrackRow[]>, wanted: number) => {
      const rows = await gather();
      const text = await gatherTracksAsText(columns.visible, rows);
      const wrote = text === "" ? false : await writeClipboard(text);
      push(
        wrote ? copySummary(rows.length, wanted) : "Could not copy to the clipboard",
        wrote ? "success" : "warning",
      );
    },
    [columns.visible, push],
  );

  const revealPath = useMemo(() => {
    const id = onlySelectedId(selection.selection, window_.total);
    if (id == null) return null;
    for (let index = 0; index < window_.total; index += 1) {
      const row = window_.source.getRow(index);
      if (row?.id === id) return row.file_path;
    }
    return heldDetail?.track.id === id ? heldDetail.track.file_path : null;
  }, [heldDetail, selection.selection, window_.source, window_.total]);

  /** Hand tracks to Clean (FLW-8): ids, or the question and its count for "everything matching". */
  const openInCleanWith = useCallback(
    async (target: Target, open: (tracks: CleanTracks) => void) => {
      const tracks = await cleanTracksFor(
        target.selection,
        target.count,
        selection.gatherIds,
        QUEUE_ACTION_LIMIT,
      );
      if (!tracks || !mounted.current) return;
      if ("ids" in tracks && target.count > tracks.ids.length && !target.selection.track_ids) {
        push(cleanCapLine(tracks.ids.length, target.count), "warning");
      }
      open(tracks);
    },
    [push, selection.gatherIds],
  );

  const groupsFor = useCallback(
    (state: MenuState): TrackActionGroup[] => {
      const { target, rows, index, first, credits, kind } = state;
      const path = kind === "row" ? (rows.length === 1 ? rows[0]!.file_path : null) : revealPath;
      const revealId =
        kind === "row" ? rows[0]?.id : onlySelectedId(selection.selection, window_.total);
      return trackActionGroups(
        {
          count: target.count,
          // These rows come from several places at once: nothing to "remove from".
          collection: null,
          credits,
          revealable: target.count === 1 && Boolean(path),
        },
        {
          play: {
            onPlay: () =>
              void (target.count === 1 && index >= 0
                ? playback.playRow(index)
                : playback.playRows(rows)),
            onPlayNext: () => void playback.playNext(rows),
            onAddToQueue: () => void playback.addToQueue(rows),
          },
          organization: {
            onAddToCollection: () => openPicker("collection", target),
            onAddToSet: () => openPicker("set", target),
            onRemoveFromCollection: () => undefined,
            onAddTag: () => openPicker("tag-add", target),
            onRemoveTag: () => openPicker("tag-remove", target),
            onRate: (stars) =>
              runAction(
                {
                  kind: "set_rating",
                  value: stars,
                  target: stars == null ? "no rating" : String(stars),
                },
                target,
              ),
            onFavorite: (favorite) =>
              runAction({ kind: "set_favorite", value: favorite, target: "favorite" }, target),
          },
          explore:
            first != null
              ? { onSimilar: () => onOpenSimilar(first), onOpenPage: onOpenEntity }
              : undefined,
          beatport: {
            onMatch: () => void openInCleanWith(target, onOpenMatch),
            onReview: first != null ? () => onOpenInClean(first) : undefined,
            onUseBeatport: () =>
              void openInCleanWith(target, (tracks) => onOpenFix(tracks, "beatport")),
          },
          fix: {
            onEdit: () => void openInCleanWith(target, (tracks) => onOpenFix(tracks, "edit")),
            onWriteTags: () => void openInCleanWith(target, (tracks) => onOpenFix(tracks, "save")),
          },
          more: {
            onCopy: () =>
              void (kind === "row"
                ? copyRows(async () => rows.slice(0, COPY_LIMIT), rows.length)
                : copyRows(() => selection.gatherRows(COPY_LIMIT), selection.count)),
            onReveal:
              path && revealId != null
                ? () =>
                    void revealTrack(revealId).then((outcome) => {
                      if (outcome) push(outcome.message, outcome.tone);
                    })
                : null,
          },
        },
      );
    },
    [
      copyRows,
      onOpenEntity,
      onOpenFix,
      onOpenInClean,
      onOpenMatch,
      onOpenSimilar,
      openInCleanWith,
      openPicker,
      playback,
      push,
      revealPath,
      runAction,
      selection,
      window_.total,
    ],
  );

  const menuItems = useMemo((): TrackContextMenuItem[] => {
    if (!menu) return [];
    const groups = groupsFor(menu);
    if (menu.group) return groups.find((group) => group.id === menu.group)?.items ?? [];
    return menuFromGroups(groups);
  }, [groupsFor, menu]);

  const barGroups = groupsFor({
    x: 0,
    y: 0,
    rows: [],
    index: -1,
    target: barTarget(),
    kind: "selection",
    group: null,
    first: selection.count > 0 ? 0 : null,
    credits: null,
  });

  const openGroup = useCallback(
    async (id: TrackActionGroupId, anchor: { x: number; y: number }) => {
      const target = barTarget();
      const needsFirst = id === "explore" || id === "beatport";
      const rows = id === "play" ? await selection.gatherRows(QUEUE_ACTION_LIMIT) : [];
      const first = needsFirst
        ? (target.trackId ?? (await selection.gatherIds(1))[0] ?? null)
        : null;
      const credits = id === "explore" && first != null ? await creditsFor(first, heldDetail) : null;
      if (!mounted.current) return;
      setMenu({
        x: anchor.x,
        y: anchor.y,
        rows,
        index:
          selection.count === 1
            ? selectedRowIndex(
                selection.selection,
                window_.total,
                (at) => window_.source.getRow(at)?.id,
              )
            : -1,
        target,
        kind: "selection",
        group: id,
        first,
        credits,
      });
    },
    [barTarget, heldDetail, selection, window_.source, window_.total],
  );

  const openRowMenu = useCallback(
    async (row: LibraryTrackRow, index: number, x: number, y: number) => {
      const inSelection = row.id != null && isSelected(selection.selection, row.id);
      const rows =
        inSelection && selection.count > 1 ? await selection.gatherRows(QUEUE_ACTION_LIMIT) : [row];
      const target: Target =
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
      const first = rows[0]?.id ?? row.id ?? null;
      const credits = first == null ? null : await creditsFor(first, heldDetail);
      setMenu({ x, y, rows, index, target, kind: "row", group: null, first, credits });
    },
    [heldDetail, query, selection],
  );

  const selectedKeys = useMemo(() => {
    const keys = new Set<number>();
    for (let index = 0; index < window_.total; index += 1) {
      const row = window_.source.getRow(index);
      if (row?.id != null && isSelected(selection.selection, row.id)) keys.add(row.id);
    }
    return keys;
  }, [selection.selection, window_.source, window_.total]);

  const emptyState = (
    <div className="keys-empty">
      {window_.error ? (
        <>
          <p className="keys-empty__headline">The tracks could not be read.</p>
          <p className="keys-note">{window_.error}</p>
          <button type="button" className="keys-link" onClick={window_.retry}>
            Try again
          </button>
        </>
      ) : window_.loading ? (
        <p className="keys-note">Reading the tracks…</p>
      ) : (
        <p className="keys-empty__headline">No track is in these keys here.</p>
      )}
    </div>
  );

  return (
    <div className="keys-tracks">
      <LibraryToolbar
        groups={barGroups}
        total={window_.total}
        selected={selection.count}
        describedByQuery={selection.selection.all}
        openGroup={menu?.group ?? null}
        onOpenGroup={(id, anchor) => void openGroup(id, anchor)}
        onClear={selection.clear}
        onSelectAll={selection.selectAllMatching}
        onColumns={() => setChoosingColumns(true)}
      />

      <div className="keys-tracks__rows">
        <TrackTable<LibraryTrackRow>
          columns={columns.visible}
          source={window_.source}
          widths={columns.widths}
          onWidthsChange={columns.setWidths}
          onColumnMove={columns.move}
          sort={{ key: query.sort, direction: query.dir }}
          onSortChange={(next) => setOrder({ sort: next.key, dir: next.direction })}
          selectedKeys={selectedKeys}
          getRowKey={(row) => row.id ?? -1}
          onSelect={(row, index, event) => selection.onRowClick(row, index, event)}
          // DEC-012: the row plays, and the whole of this table becomes the queue.
          onRowActivate={(_row, index) => void playback.playRow(index)}
          onRowContextMenu={(row, index, anchor) =>
            void openRowMenu(row, index, anchor.x, anchor.y)
          }
          activeIndex={selection.selection.anchor}
          emptyState={emptyState}
          resetKey={queryKey(query)}
          ariaLabel="Tracks in these keys"
        />
      </div>

      {menu && (
        <TrackContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          label={
            menu.target.count > 1
              ? `Actions for ${menu.target.count.toLocaleString()} tracks`
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
        onCreate={picker?.kind === "tag-add" ? (name) => void createAndTag(name) : undefined}
        emptyText={
          picker?.kind === "collection"
            ? "There are no Collections yet. Make one in the Library."
            : picker?.kind === "set"
              ? "There are no Sets yet. Make one in the Library."
              : "No tags yet."
        }
      />

      <BatchConfirmDialog batch={batch} />

      <ColumnPicker
        open={choosingColumns}
        onClose={() => setChoosingColumns(false)}
        columns={LIBRARY_COLUMNS}
        layout={columns.layout}
        onToggle={columns.toggle}
        onNudge={columns.nudge}
        onReset={columns.reset}
      />
    </div>
  );
}
