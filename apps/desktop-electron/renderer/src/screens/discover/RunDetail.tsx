/**
 * One search: what it looked for, how it ended, what it found (DISCOVER-10,
 * DEC-091, DEC-092). The engine calls it a run; the user never reads that.
 *
 * The header is the search as the engine kept it, scope included, so one can
 * be read long after its settings have changed. The table is its tracks in
 * `TrackTable`, the ones already in the library hidden by default and counted
 * on one line — "40 found · 12 already in your library (hidden)" — because a
 * list of music to buy that quietly includes music already bought is the
 * mistake DEC-092 exists to prevent.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DiscoverRunHeader,
  DiscoverRunSort,
  DiscoverRunTrackRow,
  DiscoverRunTracksPage,
  DiscoverSortDirection,
} from "../../api/cuepointBridge.types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import type { TrackTableSort } from "../../components/table";
import { pluralize } from "../library/libraryFormat";
import { BeatportTable } from "./BeatportTable";
import { PushDialog } from "./PushDialog";
import { runActions, type BeatportActionId } from "./beatportActions";
import { RUN_COLUMNS, RUN_TABLE_LAYOUT_KEY } from "./beatportColumns";
import { beatportUsable, unusableReason } from "./beatportState";
import {
  chartsLine,
  foundLine,
  refusalText,
  releasesLine,
  runOutcome,
  runStateLabel,
  runStateTone,
  scopeLine,
  searchTitle,
} from "./discoverFormat";
import { NO_ENGINE, type DiscoverTools } from "./discoverTools";
import { openOnBeatport } from "./openOnBeatport";
import { useBeatportSelection } from "./useBeatportSelection";
import { useBeatportWindow } from "./useBeatportWindow";
import { beatportRowKey } from "./beatportKey";
import { HideOwnedSwitch } from "./HideOwnedSwitch";
import { useHideOwned } from "./useHideOwned";
import { beatportSelectedId, useReportSelectedTrack } from "./useReportSelectedTrack";
import { jobExplainer } from "../../components/shell/useActiveJob";
import { reportUnexpected } from "../../reporting/reporting";

interface RunDetailProps {
  runId: number;
  tools: DiscoverTools;
  /** Changes when the run may have changed: it is running, or just ended. */
  version: number;
  /** The search is not there any more: deleted elsewhere. */
  onGone: () => void;
}

const RUN_SORTS: readonly DiscoverRunSort[] = ["position", "release_date", "artist", "title"];

const idOf = (row: DiscoverRunTrackRow) => row.beatport_track_id;

const BADGE: Record<ReturnType<typeof runStateTone>, "info" | "success" | "warning" | "danger"> = {
  info: "info",
  success: "success",
  warning: "warning",
  error: "danger",
};

/** The names a run's scope resolved to, folded away when there are many. */
function ScopeNames({ names, noun }: { names: DiscoverRunHeader["artists"]; noun: string }) {
  if (names.length === 0) return null;
  return (
    <details className="discover-run__names">
      <summary>
        The {pluralize(names.length, noun)} it looked for
      </summary>
      <p className="discover-note">{names.map((entry) => entry.name).join(", ")}</p>
    </details>
  );
}

export function RunDetail({ runId, tools, version, onGone }: RunDetailProps) {
  const [header, setHeader] = useState<DiscoverRunHeader | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [owned, setHiding] = useHideOwned();
  const [order, setOrder] = useState<{ sort: DiscoverRunSort; dir: DiscoverSortDirection }>({
    sort: "position",
    dir: "asc",
  });
  const [pushOpen, setPushOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const { notify } = tools;

  // The header, again whenever the run may have moved on.
  useEffect(() => {
    const bridge = window.cuepoint?.getDiscoveryRun;
    if (!bridge) {
      setHeaderError(NO_ENGINE);
      return;
    }
    let current = true;
    void bridge({ run_id: runId })
      .then((answer) => {
        if (!current) return;
        if (answer.refusal) {
          if (answer.refusal.code === "DISCOVERY_RUN_NOT_FOUND") onGone();
          else setHeaderError(refusalText(answer.refusal));
          return;
        }
        setHeader(answer.value);
        setHeaderError(null);
      })
      .catch((cause: unknown) => {
        reportUnexpected(cause);
        if (current) setHeaderError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      current = false;
    };
  }, [runId, version, onGone]);

  // A different run is a different header: never show one run's over another.
  useEffect(() => {
    setHeader(null);
    setHeaderError(null);
  }, [runId]);

  const windowKey = `${runId}|${owned}|${order.sort}|${order.dir}`;
  const fetchTracks = useCallback(
    (offset: number, limit: number) => {
      const bridge = window.cuepoint?.getDiscoveryRunTracks;
      if (!bridge) return Promise.reject(new Error(NO_ENGINE));
      return bridge({ run_id: runId, owned, sort: order.sort, dir: order.dir, offset, limit });
    },
    [owned, order.dir, order.sort, runId],
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

  // Tracks arrive while a run runs, and the last of them when it ends.
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
      ? { id: beatportSelectedId(lastRow.beatport_track_id), key: beatportRowKey(lastRow) }
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
      notify(cause instanceof Error ? cause.message : String(cause), "warning");
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

  const push = async (name: string, includeOwned: boolean) => {
    const refused = await tools.push(
      selection.count > 0
        ? { name, include_owned: includeOwned, track_ids: selection.rows.map(idOf) }
        : {
            name,
            include_owned: includeOwned,
            run_id: runId,
            owned,
            sort: order.sort,
            dir: order.dir,
          },
    );
    if (!refused) setPushOpen(false);
    return refused;
  };

  const run = header?.run ?? null;
  const page = tracks.page;
  const sort: TrackTableSort = { key: order.sort, direction: order.dir };

  const emptyState = (
    <div className="discover-empty">
      {tracks.status === "error" ? (
        <>
          <p className="discover-empty__headline">The search's tracks could not be read.</p>
          <p className="discover-note">{tracks.error}</p>
          <Button variant="secondary" onClick={reload}>
            Try again
          </Button>
        </>
      ) : tracks.loading ? (
        <p className="discover-note">Reading the search's tracks…</p>
      ) : (page?.tracks ?? 0) === 0 ? (
        <p className="discover-empty__headline">
          {run?.running ? "Nothing found yet." : "This search found nothing."}
        </p>
      ) : (
        <>
          <p className="discover-empty__headline">
            Every track this search found is already in your library.
          </p>
          <Button variant="secondary" onClick={() => setHiding(false)}>
            Show them
          </Button>
        </>
      )}
    </div>
  );

  return (
    <section className="discover-run" aria-label="Search">
      <header className="discover-run__header">
        {headerError ? (
          <p className="discover-note discover-note--warning" role="alert">
            {headerError}
          </p>
        ) : !run || !header ? (
          <p className="discover-note">Reading the search…</p>
        ) : (
          <>
            <div className="discover-run__title-row">
              <h2 className="discover-section__title">{searchTitle(run.started_at)}</h2>
              <Badge variant={BADGE[runStateTone(run)]}>{runStateLabel(run)}</Badge>
            </div>
            <p className="discover-run__outcome">{runOutcome(run)}</p>
            {run.running && (
              <p className="discover-run__explainer">
                {jobExplainer("discovery")} This can take a few minutes, and the bar at the bottom
                shows how far it has got.
              </p>
            )}
            <p className="discover-run__looked-title">What it looked for</p>
            <ul className="discover-run__looked" aria-label="What it looked for">
              <li>{chartsLine(run, tools.options.genres)}</li>
              <li>{releasesLine(run)}</li>
              <li>Artists: {scopeLine(run.params.artists, "artist", "artists")}</li>
              <li>Labels: {scopeLine(run.params.labels, "label", "labels")}</li>
            </ul>
            <ScopeNames names={header.artists} noun="artist" />
            <ScopeNames names={header.labels} noun="label" />
          </>
        )}
      </header>

      <div className="discover-toolbar" role="toolbar" aria-label="This search's tracks">
        <HideOwnedSwitch
          hiding={owned === "hide"}
          onChange={setHiding}
        />
        {page && (
          <span className="discover-note" role="status">
            {foundLine(page.tracks, page.owned, owned === "hide")}
          </span>
        )}
      </div>

      <BeatportTable<DiscoverRunTrackRow>
        columns={RUN_COLUMNS}
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
        label="Tracks this search found"
        summary={pluralize(tracks.total, "track")}
        emptyState={emptyState}
        resetKey={windowKey}
        busy={working}
      />

      <PushDialog
        open={pushOpen}
        what={
          selection.count > 0
            ? `the ${pluralize(selection.count, "selected track")}`
            : `the ${pluralize(tracks.total, "track")} this table shows`
        }
        defaultName={tools.options.defaults.playlist_name}
        maxNameLength={tools.options.limits.max_playlist_name_length}
        onPush={push}
        onClose={() => setPushOpen(false)}
      />

    </section>
  );
}
