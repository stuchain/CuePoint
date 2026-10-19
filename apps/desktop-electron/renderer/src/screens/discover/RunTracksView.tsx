/**
 * A dig's tracks as one table (DISCOVER-10, DEC-091, DEC-092).
 *
 * Two uses: "Everything" (the whole dig, each track once, with a "From" column
 * naming where it was found) and one card's tracks (`groups` names it). Both are
 * `TrackTable` over the engine's window; ticks leave tracks out, and "Add to
 * playlist" takes what is ticked, or everything shown.
 *
 * The ones already in the library are hidden by default and counted on one
 * line — "40 found · 12 already in your library (hidden)" — because a list of
 * music to buy that quietly includes music already bought is the mistake
 * DEC-092 exists to prevent.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import type {
  DiscoverGroupRef,
  DiscoverRunSort,
  DiscoverRunTrackRow,
  DiscoverRunTracksPage,
  DiscoverSortDirection,
} from "../../api/cuepointBridge.types";
import { EmptyState } from "../../components/EmptyState";
import { Loading } from "../../components/Loading";
import { RETRY } from "../../format/words";
import type { TrackTableSort } from "../../components/table";
import { countNoun } from "../../format/counts";
import { BeatportTable } from "./BeatportTable";
import { PushDialog, type PushTarget } from "./PushDialog";
import { runActions, type BeatportActionId } from "./beatportActions";
import { RUN_COLUMNS, RUN_PREVIOUS_DEFAULT_ORDER, RUN_TABLE_LAYOUT_KEY } from "./beatportColumns";
import { useOpenPage } from "./useOpenPage";
import { beatportUsable, unusableReason } from "./beatportState";
import { foundLine, refusalText } from "./discoverFormat";
import { NO_ENGINE, type DiscoverTools } from "./discoverTools";
import { openOnBeatport } from "./openOnBeatport";
import { useBeatportSelection } from "./useBeatportSelection";
import { useBeatportWindow } from "./useBeatportWindow";
import { beatportRowKey } from "./beatportKey";
import { HideOwnedSwitch } from "./HideOwnedSwitch";
import { useHideOwned } from "./useHideOwned";
import { beatportSelectedId, useReportSelectedTrack } from "../../components/shell/useReportSelectedTrack";
import { reportUnexpected } from "../../reporting/reporting";
import { userMessage } from "../../api/userMessage";

interface RunTracksViewProps {
  runId: number;
  tools: DiscoverTools;
  /** Changes when the dig may have changed: it is running, or just ended. */
  version: number;
  /** The cards whose tracks these are; absent for everything the dig found. */
  groups?: readonly DiscoverGroupRef[];
  /** What the table is of, for its label: "Everything" or a card's name. */
  label: string;
  /** Shown before the switch: a way back to the cards. */
  lead?: ReactNode;
  /** The dig is not there any more: deleted elsewhere. */
  onGone: () => void;
  /** Whether the dig is still running, for the empty words. */
  running: boolean;
}

const RUN_SORTS: readonly DiscoverRunSort[] = ["position", "release_date", "artist", "title"];

const idOf = (row: DiscoverRunTrackRow) => row.beatport_track_id;

export function RunTracksView({
  runId,
  tools,
  version,
  groups,
  label,
  lead,
  onGone,
  running,
}: RunTracksViewProps) {
  const [owned, setHiding] = useHideOwned();
  const openPage = useOpenPage();
  const [order, setOrder] = useState<{ sort: DiscoverRunSort; dir: DiscoverSortDirection }>({
    sort: "position",
    dir: "asc",
  });
  const [pushOpen, setPushOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const { notify } = tools;
  // A stable text for the cards, so a new array of the same cards is the same question.
  const groupsText = groups ? JSON.stringify(groups) : "";

  const windowKey = `${runId}|${groupsText}|${owned}|${order.sort}|${order.dir}`;
  const fetchTracks = useCallback(
    (offset: number, limit: number) => {
      const window_ = { owned, sort: order.sort, dir: order.dir, offset, limit };
      if (groupsText) {
        const bridge = window.cuepoint?.getDiscoveryGroupTracks;
        if (!bridge) return Promise.reject(new Error(NO_ENGINE));
        return bridge({ run_id: runId, groups: JSON.parse(groupsText) as DiscoverGroupRef[], ...window_ });
      }
      const bridge = window.cuepoint?.getDiscoveryRunTracks;
      if (!bridge) return Promise.reject(new Error(NO_ENGINE));
      return bridge({ run_id: runId, ...window_ });
    },
    [groupsText, owned, order.dir, order.sort, runId],
  );
  const answersWindow = useCallback(
    (page: DiscoverRunTracksPage) =>
      page.run_id === runId &&
      page.window.owned === owned &&
      page.window.sort === order.sort &&
      page.window.dir === order.dir,
    [owned, order.dir, order.sort, runId],
  );
  const tracks = useBeatportWindow<DiscoverRunTrackRow, DiscoverRunTracksPage>({
    key: windowKey,
    fetch: fetchTracks,
    answers: answersWindow,
  });
  const { reload } = tracks;

  // Tracks arrive while a dig runs, and the last of them when it ends.
  useEffect(() => {
    if (version > 0) reload();
  }, [reload, version]);

  useEffect(() => {
    if (tracks.refusal?.code === "DISCOVERY_RUN_NOT_FOUND") onGone();
  }, [onGone, tracks.refusal]);

  const selection = useBeatportSelection<DiscoverRunTrackRow>({
    key: windowKey,
    idOf,
    getRow: tracks.source.getRow,
    loadedRows: tracks.loadedRows,
  });

  // The wheel lights the row last clicked, with Beatport's own key (DEC-157).
  const lastRow = selection.anchorRow;
  useReportSelectedTrack(
    lastRow
      ? {
          id: beatportSelectedId(lastRow.beatport_track_id),
          key: beatportRowKey(lastRow),
          title: lastRow.title,
        }
      : null,
  );

  const pushable = beatportUsable(tools.beatportState);
  const actions = useMemo(
    () =>
      runActions(selection.count, {
        pushable,
        pushReason: unusableReason(tools.beatportState),
        total: tracks.total,
      }),
    [pushable, selection.count, tools.beatportState, tracks.total],
  );

  const addToWantlist = async () => {
    const bridge = window.cuepoint?.addToWantlist;
    if (!bridge) {
      notify(NO_ENGINE, "warning");
      return;
    }
    setWorking(true);
    try {
      const answer = await bridge({ track_ids: selection.rows.map(idOf), run_id: runId });
      if (answer.refusal) notify(refusalText(answer.refusal), "warning");
      else notify(answer.value.message, "success");
      reload();
    } catch (cause) {
      reportUnexpected(cause);
      notify(userMessage(cause), "warning");
    } finally {
      setWorking(false);
    }
  };

  const onAction = (id: BeatportActionId) => {
    if (id === "add_to_wantlist") void addToWantlist();
    if (id === "push") setPushOpen(true);
    if (id === "open") {
      void openOnBeatport(selection.rows.map((row) => row.url)).then((problem) => {
        if (problem) notify(problem, "warning");
      });
    }
  };

  const push = async (target: PushTarget, includeOwned: boolean) => {
    const to = "playlistId" in target ? { playlist_id: target.playlistId } : {};
    const refused = await tools.push(
      selection.count > 0
        ? { name: target.name, include_owned: includeOwned, track_ids: selection.rows.map(idOf), ...to }
        : groups
          ? { name: target.name, include_owned: includeOwned, run_id: runId, groups: [...groups], ...to }
          : {
              name: target.name,
              include_owned: includeOwned,
              run_id: runId,
              owned,
              sort: order.sort,
              dir: order.dir,
              ...to,
            },
    );
    if (!refused) setPushOpen(false);
    return refused;
  };

  const page = tracks.page;
  const sort: TrackTableSort = { key: order.sort, direction: order.dir };

  const emptyState =
    tracks.status === "error" ? (
      <EmptyState
        icon="discover"
        headline="The dig's tracks could not be read"
        description={tracks.error}
        action={{ label: RETRY, onClick: reload }}
      />
    ) : tracks.loading ? (
      <Loading what="the dig's tracks" />
    ) : (page?.tracks ?? 0) === 0 ? (
      <EmptyState
        icon="discover"
        headline={running ? "Nothing found yet" : groups ? "Nothing found here" : "This dig found nothing"}
      />
    ) : (
      <EmptyState
        icon="discover"
        headline={`Every track ${groups ? "here" : "this dig found"} is already in your library`}
        action={{ label: "Show them", onClick: () => setHiding(false) }}
      />
    );

  return (
    <div className="discover-run__tracks">
      <BeatportTable<DiscoverRunTrackRow>
        lead={lead}
        filters={<HideOwnedSwitch hiding={owned === "hide"} onChange={setHiding} />}
        columns={RUN_COLUMNS}
        previousDefaultOrder={RUN_PREVIOUS_DEFAULT_ORDER}
        onOpenPage={openPage}
        layoutKey={RUN_TABLE_LAYOUT_KEY}
        source={tracks.source}
        selection={selection}
        idOf={idOf}
        sort={sort}
        onSortChange={(next) => {
          const key = RUN_SORTS.find((candidate) => candidate === next.key);
          if (key) setOrder({ sort: key, dir: next.direction });
        }}
        actions={actions}
        onAction={onAction}
        label={label}
        summary={page ? foundLine(page.tracks, page.owned, owned === "hide") : countNoun(tracks.total, "track")}
        emptyState={emptyState}
        resetKey={windowKey}
        busy={working}
      />

      <PushDialog
        open={pushOpen}
        allowExisting
        what={(includeOwned) => {
          if (selection.count === 0) return `the ${countNoun(tracks.total, "track")} this table shows`;
          const going = includeOwned
            ? selection.count
            : selection.rows.filter((row) => !row.owned).length;
          return `the ${countNoun(going, "selected track")}`;
        }}
        defaultName={tools.options.defaults.playlist_name}
        maxNameLength={tools.options.limits.max_playlist_name_length}
        onPush={push}
        onClose={() => setPushOpen(false)}
      />
    </div>
  );
}
