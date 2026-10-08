/**
 * An Artist or Label page's library half (DISCOVER-11, DEC-094).
 *
 * The Library's own table over the rule set the engine answered for the page
 * — `useTrackWindow`, `useTrackSelection`, the Library's columns — so the
 * tracks here are the tracks **Open in Library** shows, in the same order,
 * and a count in the header is this table's (fact 5).
 *
 * **These are library rows**, so they behave as the Library's do: a
 * double-click plays the row with the whole table behind it as the queue
 * (DEC-012), and Play next and Add to queue append without interrupting
 * (DEC-013). One track leads on to its Similar tracks and its pages.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  EntityKind,
  FilterRuleSet,
  LibraryTrackDetail,
  LibraryTrackRow,
  TrackCreditLinks,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { TrackContextMenu, type TrackContextMenuItem } from "../../components/TrackContextMenu";
import { useToast } from "../../components/Toast";
import { ColumnPicker, TrackTable, useColumnLayout } from "../../components/table";
import { revealTrack } from "../clean/revealTrack";
import { LIBRARY_COLUMNS } from "../library/libraryColumns";
import { creditsFor, discoverMenuItems } from "../library/libraryDiscover";
import { DEFAULT_LIBRARY_QUERY, queryKey, type LibraryQuery } from "../library/libraryQuery";
import { moreItems, playItems, type TrackActionGroupId } from "../library/trackActions";
import { copySummary, gatherTracksAsText, writeClipboard } from "../library/trackClipboard";
import { isSelected, onlySelectedId } from "../library/trackSelection";
import { QUEUE_ACTION_LIMIT, useLibraryPlayback } from "../library/useLibraryPlayback";
import { COPY_LIMIT, useTrackSelection } from "../library/useTrackSelection";
import { useTrackWindow } from "../library/useTrackWindow";
import { DiscoverSelectionBar } from "./DiscoverSelectionBar";
import { libraryRowMenu } from "./libraryRowMenu";
import { nounOf } from "./entityFormat";

/** The page's library table keeps a layout of its own, apart from the Library's. */
const PAGE_LIBRARY_LAYOUT_KEY = "cuepoint-discover-page-library-layout";

/** Newest first: what a page about someone is usually read for. */
const PAGE_ORDER = { sort: "year", dir: "desc" as const };

interface LibraryHalfProps {
  kind: EntityKind;
  /** The engine's rule set for the page, handed to the browse unchanged. */
  rules: FilterRuleSet;
  /** False while the other half holds the page's selection: this one lets go. */
  active: boolean;
  /** A click here takes the page's selection. */
  onActivate: () => void;
  /** The track the Inspector should show, and how many are selected. */
  onSelectTrack: (trackId: number | null, count: number) => void;
  /** Changes when something outside the table changed its rows. */
  reloadToken: number;
  /** The detail the Inspector holds, reused for the one track's credits. */
  heldDetail: LibraryTrackDetail | null;
  onOpenEntity: (kind: EntityKind, ref: string) => void;
  onOpenSimilar: (trackId: number) => void;
}

interface MenuState {
  x: number;
  y: number;
  rows: LibraryTrackRow[];
  /** The row's place in the view, for DEC-012's Play; -1 for a selection. */
  index: number;
  /** The first row's credits, for Explore. */
  credits: TrackCreditLinks | null;
}

/** The tracks a group's entries act on, and what Explore needs of the first. */
type Target = Pick<MenuState, "rows" | "index" | "credits">;

/** The groups the bar and the menu hold (FLW-8). */
const GROUPS: readonly TrackActionGroupId[] = ["play", "explore", "more"];

export function LibraryHalf({
  kind,
  rules,
  active,
  onActivate,
  onSelectTrack,
  reloadToken,
  heldDetail,
  onOpenEntity,
  onOpenSimilar,
}: LibraryHalfProps) {
  const { push } = useToast();
  const [order, setOrder] = useState<{ sort: string; dir: "asc" | "desc" }>(PAGE_ORDER);
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);

  const query = useMemo<LibraryQuery>(
    () => ({ ...DEFAULT_LIBRARY_QUERY, filters: rules, sort: order.sort, dir: order.dir }),
    [order.dir, order.sort, rules],
  );
  const columns = useColumnLayout<LibraryTrackRow>(PAGE_LIBRARY_LAYOUT_KEY, LIBRARY_COLUMNS);
  const window_ = useTrackWindow(query);
  const selection = useTrackSelection(query, window_.total, window_.source.getRow);
  const playback = useLibraryPlayback({ query, onMessage: (message) => push(message, "info") });
  const { reload } = window_;
  const { clear } = selection;

  useEffect(() => {
    if (reloadToken > 0) reload();
  }, [reload, reloadToken]);

  // One selection per page: the other half took it.
  useEffect(() => {
    if (!active) clear();
  }, [active, clear]);

  const lastId = selection.selection.lastId;
  const count = selection.count;
  useEffect(() => {
    onSelectTrack(count > 0 ? lastId : null, count);
  }, [count, lastId, onSelectTrack]);

  const openMenu = useCallback(
    async (row: LibraryTrackRow, index: number, x: number, y: number) => {
      onActivate();
      const inSelection = row.id != null && isSelected(selection.selection, row.id);
      const rows =
        inSelection && selection.count > 1 ? await selection.gatherRows(QUEUE_ACTION_LIMIT) : [row];
      const firstId = rows[0]?.id;
      const credits = firstId == null ? null : await creditsFor(firstId, heldDetail);
      setMenu({ x, y, rows, index: rows.length === 1 ? index : -1, credits });
    },
    [heldDetail, onActivate, selection],
  );

  /**
   * The tracks the bar acts on. One track the table holds is taken from it, with its
   * place, so Play keeps the table behind it; a larger selection is gathered, as the
   * Library gathers one.
   */
  const selectedRows = useCallback(async () => {
    const only = onlySelectedId(selection.selection, window_.total);
    let loaded: { row: LibraryTrackRow; index: number } | null = null;
    for (let index = 0; only != null && index < window_.total; index += 1) {
      const row = window_.source.getRow(index);
      if (row?.id === only) {
        loaded = { row, index };
        break;
      }
    }
    const rows = loaded ? [loaded.row] : await selection.gatherRows(QUEUE_ACTION_LIMIT);
    return { rows, index: loaded ? loaded.index : -1 };
  }, [selection, window_.source, window_.total]);

  const copyRows = useCallback(
    async (rows: LibraryTrackRow[]) => {
      const copied = rows.slice(0, COPY_LIMIT);
      const text = await gatherTracksAsText(columns.visible, copied);
      const wrote = text === "" ? false : await writeClipboard(text);
      push(
        wrote ? copySummary(copied.length, rows.length) : "Could not copy to the clipboard",
        wrote ? "success" : "warning",
      );
    },
    [columns.visible, push],
  );

  const selectedKeys = useMemo(() => {
    const keys = new Set<number>();
    for (let index = 0; index < window_.total; index += 1) {
      const row = window_.source.getRow(index);
      if (row?.id != null && isSelected(selection.selection, row.id)) keys.add(row.id);
    }
    return keys;
  }, [selection.selection, window_.source, window_.total]);

  /**
   * One group's entries for these tracks: what the bar's button opens and what the
   * right-click menu's submenu holds are this one list (FLW-8).
   */
  const groupItems = useCallback(
    (group: TrackActionGroupId, { rows, index, credits }: Target): TrackContextMenuItem[] => {
      const first = rows[0];
      if (!first || first.id == null) return [];
      const firstId = first.id;
      if (group === "play") {
        return playItems(rows.length, {
          // One row plays the page's table behind it (DEC-012); a selection is
          // the queue, as in the Library.
          onPlay: () =>
            void (rows.length === 1 && index >= 0 ? playback.playRow(index) : playback.playRows(rows)),
          onPlayNext: () => void playback.playNext(rows),
          onAddToQueue: () => void playback.addToQueue(rows),
        });
      }
      if (group === "explore") {
        // Several tracks: the first, as in the Library.
        return discoverMenuItems(
          { count: 1, credits },
          { onSimilar: () => onOpenSimilar(firstId), onOpenPage: onOpenEntity },
        );
      }
      if (group === "more") {
        const one = rows.length === 1;
        return moreItems(
          { count: rows.length, collection: null, credits: null, revealable: one && first.file_path !== "" },
          {
            onCopy: () => void copyRows(rows),
            onReveal: one
              ? () => {
                  void revealTrack(firstId).then((outcome) => {
                    if (outcome) push(outcome.message, outcome.tone);
                  });
                }
              : null,
          },
        );
      }
      return [];
    },
    [copyRows, onOpenEntity, onOpenSimilar, playback, push],
  );

  const menuItems = useMemo(
    () => (menu ? libraryRowMenu(GROUPS, menu.rows.length, (group) => groupItems(group, menu)) : []),
    [groupItems, menu],
  );

  /** What each group of the bar opens, for the selection as it is now (FLW-8). */
  const itemsFor = useCallback(
    async (group: TrackActionGroupId): Promise<TrackContextMenuItem[]> => {
      const { rows, index } = await selectedRows();
      const firstId = rows[0]?.id;
      const credits = group === "explore" && firstId != null ? await creditsFor(firstId, heldDetail) : null;
      return groupItems(group, { rows, index, credits });
    },
    [groupItems, heldDetail, selectedRows],
  );

  const emptyState = (
    <div className="discover-empty">
      {window_.error ? (
        <>
          <p className="discover-empty__headline">Your tracks could not be read.</p>
          <p className="discover-note">{window_.error}</p>
          <Button variant="secondary" onClick={window_.retry}>
            Try again
          </Button>
        </>
      ) : window_.loading ? (
        <p className="discover-note">Reading your tracks…</p>
      ) : (
        <p className="discover-empty__headline">
          None of your tracks is by this {nounOf(kind)}.
        </p>
      )}
    </div>
  );

  return (
    <div className="discover-table discover-page__library">
      <div className="discover-table__rows">
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
          onSelect={(row, index, event) => {
            onActivate();
            selection.onRowClick(row, index, event);
          }}
          // DEC-012: the row plays, and the whole of this table — the page's
          // rules, not the rows loaded — becomes the queue.
          onRowActivate={(_row, index) => void playback.playRow(index)}
          onRowContextMenu={(row, index, anchor) => void openMenu(row, index, anchor.x, anchor.y)}
          activeIndex={selection.selection.anchor}
          emptyState={emptyState}
          resetKey={queryKey(query)}
          ariaLabel="Your tracks"
        />
      </div>

      <div className="discover-page__library-actions">
        <DiscoverSelectionBar
          groups={GROUPS}
          total={window_.total}
          selected={selection.count}
          describedByQuery={selection.selection.all}
          itemsFor={itemsFor}
          onClear={selection.clear}
          onSelectAll={() => {
            onActivate();
            selection.selectAllMatching();
          }}
          onColumns={() => setPicking(true)}
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

      <ColumnPicker
        open={picking}
        onClose={() => setPicking(false)}
        columns={LIBRARY_COLUMNS}
        layout={columns.layout}
        onToggle={columns.toggle}
        onNudge={columns.nudge}
        onReset={columns.reset}
      />
    </div>
  );
}
