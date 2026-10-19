/**
 * Similar tracks (DISCOVER-11, DEC-096).
 *
 * The Discover page's seed view: one library track, and the library tracks
 * DISCOVER-08's rule scores closest to it, best first, each with the reasons
 * it scored. Reached from a track's operations list, in the Library, on a
 * page, or from a suggestion here, which becomes the next seed.
 * Open in Library brings the seed and its suggestions (the selected ones, if any).
 *
 * **Suggestions are library rows**, read through the track-detail path in the
 * engine's order (fact 5), so they play and queue as the Library's do: a
 * double-click plays the row with the list behind it as the queue (DEC-012),
 * and Play next and Add to queue append (DEC-013). Offline and without a
 * token: similarity is local.
 */
import { ScreenHeader } from "../../components/shell/ScreenHeader";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import type {
  EntityKind,
  LibraryTrackDetail,
  SimilarTracks,
  TrackCreditLinks,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Hint } from "../../components/Hint";
import { EmptyState } from "../../components/EmptyState";
import { Loading } from "../../components/Loading";
import { LinkButton } from "../../components/LinkButton";
import { countNoun, formatCount } from "../../format/counts";
import { goTo, RETRY } from "../../format/words";
import { Notice } from "../../components/Notice";
import { TrackContextMenu, type TrackContextMenuItem } from "../../components/TrackContextMenu";
import { useToast } from "../../components/Toast";
import { useInspectorSlot } from "../../components/shell/inspectorSlot";
import {
  ColumnPicker,
  TrackTable,
  inMemorySource,
  useColumnLayout,
} from "../../components/table";
import { CreditLinks } from "../library/CreditLinks";
import { creditsFor, discoverMenuItems } from "../library/libraryDiscover";
import { playItems, type TrackActionGroupId } from "../library/trackActions";
import { TrackDetailPanel } from "../library/TrackDetailPanel";
import { toQueueItem } from "../library/useLibraryPlayback";
import { useTrackDetail } from "../library/useTrackDetail";
import {
  entityPath,
  originState,
  pageOrigin,
  similarLibraryState,
  similarPath,
  trackIdFromRoute,
} from "./discoverLinks";
import { sortedRows } from "./clientSort";
import { PageCrumb } from "./PageCrumb";
import { refusalText } from "./discoverFormat";
import { NO_ENGINE } from "./discoverTools";
import { consideredLine, seedFactParts, SIMILAR_INDEX_BUILDING } from "./entityFormat";
import { SelectAllButton } from "../../components/SelectionBar";
import { DiscoverSelectionBar } from "./DiscoverSelectionBar";
import { libraryRowMenu } from "./libraryRowMenu";
import {
  SIMILAR_COLUMNS,
  SIMILAR_PREVIOUS_DEFAULT_ORDER,
  SIMILAR_TABLE_LAYOUT_KEY,
  type SimilarRow,
} from "./similarColumns";
import { describeUnused } from "./similarReasons";
import { useBeatportSelection } from "./useBeatportSelection";
import { useReportSelectedTrack } from "../../components/shell/useReportSelectedTrack";
import { reportUnexpected } from "../../reporting/reporting";
import "../screens.css";
import "./discover.css";
import { userMessage } from "../../api/userMessage";
import { useTrackPlayMarks } from "../../components/player/playedTracks";

/** The groups the bar and the menu hold (FLW-8): More holds only the page entries; the suggestions are not files to copy or show. */
const GROUPS: readonly TrackActionGroupId[] = ["play", "more"];

/** How many suggestions the view asks for: the engine's own default. */
export const SIMILAR_LIMIT = 50;

interface Loaded {
  seed: LibraryTrackDetail;
  answer: SimilarTracks;
  rows: SimilarRow[];
}

const idOf = (row: SimilarRow) => row.id;

/**
 * The seed, its suggestions, and each suggestion's row, in the answer's order.
 *
 * A suggestion whose track is gone by the time its row is read — deleted by a
 * refresh in between — is left out rather than drawn as a hole.
 */
async function load(seedId: number): Promise<Loaded | string> {
  const bridge = window.cuepoint;
  if (!bridge?.getSimilarTracks || !bridge.getLibraryTrack) return NO_ENGINE;
  const read = bridge.getLibraryTrack;
  const [answer, seed] = await Promise.all([
    bridge.getSimilarTracks({ track_id: seedId, limit: SIMILAR_LIMIT }),
    read({ trackId: seedId }).catch(() => null),
  ]);
  if (answer.refusal) return refusalText(answer.refusal);
  if (!seed) return "This track is not in your library any more.";
  const details = await Promise.all(
    answer.value.suggestions.map((suggestion) =>
      read({ trackId: suggestion.track_id }).catch(() => null),
    ),
  );
  const rows: SimilarRow[] = [];
  answer.value.suggestions.forEach((suggestion, at) => {
    const track = details[at]?.track;
    if (track && track.id != null) rows.push({ ...track, id: track.id, suggestion });
  });
  return { seed, answer: answer.value, rows };
}

interface SimilarScreenProps {
  /** Where the Inspector's "Open on the Clean page" goes. */
  onOpenInClean?: (trackId: number) => void;
}

export function SimilarScreen({ onOpenInClean }: SimilarScreenProps = {}) {
  const playMarks = useTrackPlayMarks(idOf);
  const { trackId: param } = useParams();
  const seedId = trackIdFromRoute(param);
  const navigate = useNavigate();
  const location = useLocation();
  // Where this page was opened from: the pages it opens keep it (C221).
  const origin = pageOrigin(location.state);
  const { push } = useToast();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [picking, setPicking] = useState(false);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    rows: SimilarRow[];
    index: number;
    credits: TrackCreditLinks | null;
  } | null>(null);

  useEffect(() => {
    if (seedId === null) {
      setProblem("This address names no track.");
      return;
    }
    let current = true;
    setProblem(null);
    void load(seedId)
      .then((result) => {
        if (!current) return;
        if (typeof result === "string") {
          setLoaded(null);
          setProblem(result);
        } else {
          setLoaded(result);
        }
      })
      .catch((cause: unknown) => {
        reportUnexpected(cause);
        if (current) setProblem(userMessage(cause));
      });
    return () => {
      current = false;
    };
  }, [seedId, version]);

  // Only the seed this address names is drawn, never the previous one's list.
  const shown = loaded && loaded.seed.track.id === seedId ? loaded : null;
  const given = useMemo(() => shown?.rows ?? [], [shown]);
  const columns = useColumnLayout<SimilarRow>(SIMILAR_TABLE_LAYOUT_KEY, SIMILAR_COLUMNS, {
    previousDefaultOrder: SIMILAR_PREVIOUS_DEFAULT_ORDER,
  });
  // The suggestions in the order the table shows them: the engine's (best first) until a heading
  // sorts them (C193). Playing from a row, a Shift range and the menu all read this order, because
  // the table reports the displayed position.
  const rows = useMemo(() => sortedRows(given, SIMILAR_COLUMNS, columns.sort), [columns.sort, given]);
  const source = useMemo(() => inMemorySource(rows), [rows]);
  // The list is sorted above, once; the table only shows which heading sorts it. Giving each such
  // heading its own key as the "engine" key keeps the table from sorting the rows a second time.
  const tableColumns = useMemo(
    () =>
      columns.visible.map((column) =>
        column.sortKey || !column.accessor ? column : { ...column, sortKey: column.id },
      ),
    [columns.visible],
  );
  const loadedRows = useCallback(() => rows.map((row, index) => ({ row, index })), [rows]);
  const selection = useBeatportSelection<SimilarRow>({
    key: String(seedId),
    idOf,
    getRow: source.getRow,
    loadedRows,
  });
  // Open in Library carries the seed and the suggestions: the selected ones if
  // any are selected, else every one shown. It cannot without the seed's id.
  const openInLibrary = useMemo(
    () =>
      shown && shown.seed.track.id != null
        ? similarLibraryState(
            { id: shown.seed.track.id, title: shown.seed.track.title },
            rows.map((row) => row.id),
            selection.rows.map((row) => row.id),
          )
        : null,
    [rows, selection.rows, shown],
  );
  const openEntity = useCallback(
    (kind: EntityKind, ref: string) => navigate(entityPath(kind, ref), { state: originState(origin) }),
    [navigate, origin],
  );
  const openSimilar = useCallback(
    (trackId: number) => navigate(similarPath(trackId), { state: originState(origin) }),
    [navigate, origin],
  );

  // The Inspector: the suggestion last clicked, or the seed.
  const lastSelected = selection.anchorRow;
  // The wheel lights the suggestion last clicked (DEC-157); none, none.
  useReportSelectedTrack(
    lastSelected ? { id: lastSelected.id, key: lastSelected.effective_key ?? null } : null,
  );
  const detail = useTrackDetail(lastSelected ? lastSelected.id : seedId);
  useInspectorSlot(
    <TrackDetailPanel
      detail={detail.detail}
      loading={detail.loading}
      error={detail.error}
      selectionCount={selection.count}
      onError={(message) => push(message, "warning")}
      onMessage={(message) => push(message, "success")}
      onTrackChanged={() => {
        setVersion((value) => value + 1);
        detail.reload();
      }}
      onOpenInClean={onOpenInClean}
      onOpenEntity={openEntity}
    />,
  );

  // --- playing: the list is the view (DEC-012), a selection is the queue

  const player = window.cuepoint?.player;
  const report = useCallback(
    (result: { ok: boolean; error?: string } | void) => {
      if (result && !result.ok && result.error) push(result.error, "warning");
    },
    [push],
  );
  const playFrom = useCallback(
    async (index: number) => {
      if (!player?.playQueue) return;
      report(await player.playQueue(rows.map(toQueueItem), index));
    },
    [player, report, rows],
  );
  const playRows = useCallback(
    async (chosen: SimilarRow[]) => {
      if (!player?.playQueue || chosen.length === 0) return;
      report(await player.playQueue(chosen.map(toQueueItem), 0));
    },
    [player, report],
  );
  const append = useCallback(
    async (chosen: SimilarRow[], where: "next" | "end") => {
      const send = where === "next" ? player?.playNext : player?.addToQueue;
      if (!send || chosen.length === 0) return;
      await send(chosen.map(toQueueItem));
      const tracks = countNoun(chosen.length, "track");
      push(where === "next" ? `${tracks} queued to play next` : `${tracks} added to the queue`, "info");
    },
    [player, push],
  );

  const openMenu = useCallback(
    async (row: SimilarRow, index: number, x: number, y: number) => {
      selection.onRowMenu(row, index);
      const chosen = selection.keys.has(row.id) && selection.count > 1 ? selection.rows : [row];
      const credits = await creditsFor(chosen[0].id, detail.detail);
      setMenu({ x, y, rows: chosen, index: chosen.length === 1 ? index : -1, credits });
    },
    [detail.detail, selection],
  );

  /**
   * One group's entries for these rows: what the bar's button opens and what the
   * right-click menu's submenu holds are this one list (FLW-8).
   */
  const groupItems = useCallback(
    (
      group: TrackActionGroupId,
      chosen: SimilarRow[],
      index: number,
      credits: TrackCreditLinks | null,
    ): TrackContextMenuItem[] => {
      const first = chosen[0];
      if (!first) return [];
      if (group === "play") {
        return playItems(chosen.length, {
          onPlay: () => void (chosen.length === 1 && index >= 0 ? playFrom(index) : playRows(chosen)),
          onPlayNext: () => void append(chosen, "next"),
          onAddToQueue: () => void append(chosen, "end"),
        });
      }
      if (group === "more") {
        // Several suggestions: the first, as in the Library.
        return discoverMenuItems(
          { count: 1, credits },
          { onSimilar: () => openSimilar(first.id), onOpenPage: openEntity },
        );
      }
      return [];
    },
    [append, openEntity, openSimilar, playFrom, playRows],
  );

  const menuItems = useMemo(
    () =>
      menu
        ? libraryRowMenu(GROUPS, menu.rows.length, (group) =>
            groupItems(group, menu.rows, menu.index, menu.credits),
          )
        : [],
    [groupItems, menu],
  );

  /** What each group of the bar opens, for the rows selected now (FLW-8). */
  const itemsFor = useCallback(
    async (group: TrackActionGroupId): Promise<TrackContextMenuItem[]> => {
      const chosen = selection.rows;
      const first = chosen[0];
      if (!first) return [];
      const credits = group === "more" ? await creditsFor(first.id, detail.detail) : null;
      return groupItems(group, chosen, chosen.length === 1 ? rows.indexOf(first) : -1, credits);
    },
    [detail.detail, groupItems, rows, selection.rows],
  );

  if (!shown) {
    return (
      <div className="screen screen--stack screen--scroll discover-screen--waiting">
        <header>
          <p className="discover-page__kind">Similar tracks</p>
        </header>
        {problem ? (
          <Notice
            title="Similar tracks could not open"
            action={
              problem !== NO_ENGINE && seedId !== null ? (
                <Button variant="secondary" onClick={() => setVersion((value) => value + 1)}>
                  {RETRY}
                </Button>
              ) : undefined
            }
          >
            {problem}
          </Notice>
        ) : (
          <Loading what="similar tracks" />
        )}
      </div>
    );
  }

  const { seed, answer } = shown;
  const unused = describeUnused(answer.unused);

  return (
    <div className="screen discover-page discover-page--similar">
      <ScreenHeader
        title={seed.track.title}
        crumb={<PageCrumb current="Similar tracks" />}
        facts={{ count: rows.length, noun: "similar track", facts: seedFactParts(seed.track) }}
        pageActions={
          <Hint text={openInLibrary?.title}>
            <LinkButton
              go
              disabled={seed.track.id == null}
              onClick={() => openInLibrary && navigate("/library", { state: openInLibrary.state })}
            >
              {goTo("Library")}
            </LinkButton>
          </Hint>
        }
      />
      <div className="discover-page__header">
        <p className="discover-page__credit">
          {seed.credits && seed.credits.artists.length > 0 ? (
            <CreditLinks
              credit={seed.track.artist}
              links={seed.credits.artists}
              onOpen={openEntity}
            />
          ) : (
            seed.track.artist
          )}
        </p>
        <p className="discover-note">{consideredLine(answer)}</p>
        {unused && <p className="discover-note">{unused}</p>}
        {!answer.index_current && (
          <p className="discover-note discover-note--warning" role="status">
            {SIMILAR_INDEX_BUILDING}
          </p>
        )}
      </div>

      <div className="discover-section__head">
        <h2 className="discover-section__title">Similar tracks</h2>
        <span className="discover-section__tools">
          <SelectAllButton disabled={rows.length === 0} onSelectAll={selection.selectAll} />
          <span className="cp-count" role="status">
            {countNoun(rows.length, "track")}
          </span>
        </span>
      </div>
      <div className="discover-table discover-page__similar">
        <div className="discover-page__library-actions">
          <DiscoverSelectionBar
            groups={GROUPS}
            selected={selection.count}
            itemsFor={itemsFor}
            onClear={selection.clear}
          />
        </div>
        <div
          className="discover-table__rows"
          onKeyDown={(event) => {
            // Esc lets go of the selection, as in the Library.
            if (event.key === "Escape" && !event.defaultPrevented && selection.count > 0) {
              event.preventDefault();
              selection.clear();
            }
          }}
        >
          <TrackTable<SimilarRow>
            columns={tableColumns}
            source={source}
            widths={columns.widths}
            onWidthsChange={columns.setWidths}
            onColumnMove={columns.move}
            sort={columns.sort}
            onSortChange={columns.setSort}
            selectedKeys={selection.keys}
            getRowKey={idOf}
            {...playMarks}
            onColumns={() => setPicking(true)}
            onSelect={selection.onRowClick}
            onSelectAll={selection.selectAll}
            onRowActivate={(_row, index) => void playFrom(index)}
            onRowContextMenu={(row, index, anchor) => void openMenu(row, index, anchor.x, anchor.y)}
            activeIndex={selection.anchor}
            emptyState={
              <EmptyState icon="library" headline="Nothing in your library is close enough to suggest" />
            }
            resetKey={String(seedId)}
            ariaLabel="Similar tracks"
          />
        </div>
      </div>

      {menu && (
        <TrackContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          label={
            menu.rows.length > 1
              ? `Actions for ${formatCount(menu.rows.length)} tracks`
              : "Track actions"
          }
        />
      )}

      <ColumnPicker
        open={picking}
        onClose={() => setPicking(false)}
        columns={SIMILAR_COLUMNS}
        layout={columns.layout}
        onToggle={columns.toggle}
        onNudge={columns.nudge}
        onReset={columns.reset}
        onRestore={columns.restore}
      />
    </div>
  );
}
