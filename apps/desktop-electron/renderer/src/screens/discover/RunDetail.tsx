/**
 * One discovery run: what it looked for, how it ended, what it found
 * (DISCOVER-10, DEC-091, DEC-092).
 *
 * The header is the run as the engine kept it, scope included, so a run can
 * be read long after its settings have changed. The table is the run's tracks
 * in `TrackTable`, owned tracks hidden by default and counted — "12 owned
 * tracks hidden" — because a list of music to buy that quietly includes
 * music already bought is the mistake DEC-092 exists to prevent.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  DiscoverOwnedFilter,
  DiscoverRunHeader,
  DiscoverRunSort,
  DiscoverRunTrackRow,
  DiscoverRunTracksPage,
  DiscoverSortDirection,
} from "../../api/cuepointBridge.types";
import { Badge } from "../../components/Badge";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import type { TrackTableSort } from "../../components/table";
import { formatCount, pluralize } from "../library/libraryFormat";
import { BeatportTable } from "./BeatportTable";
import { PushDialog } from "./PushDialog";
import { runActions, type BeatportActionId } from "./beatportActions";
import { RUN_COLUMNS, RUN_TABLE_LAYOUT_KEY } from "./beatportColumns";
import { beatportUsable, unusableReason } from "./beatportState";
import {
  chartsLine,
  formatWhen,
  hiddenLine,
  refusalText,
  releasesLine,
  runOutcome,
  runStateLabel,
  runStateTone,
  scopeLine,
} from "./discoverFormat";
import { NO_ENGINE, type DiscoverTools } from "./discoverTools";
import { openOnBeatport } from "./openOnBeatport";
import { useBeatportSelection } from "./useBeatportSelection";
import { useBeatportWindow } from "./useBeatportWindow";

interface RunDetailProps {
  runId: number;
  tools: DiscoverTools;
  /** Changes when the run may have changed: it is running, or just ended. */
  version: number;
  /** The run was deleted here. */
  onDeleted: (runId: number) => void;
  /** The run is not there any more: deleted elsewhere. */
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

export function RunDetail({ runId, tools, version, onDeleted, onGone }: RunDetailProps) {
  const [header, setHeader] = useState<DiscoverRunHeader | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [owned, setOwned] = useState<DiscoverOwnedFilter>("hide");
  const [order, setOrder] = useState<{ sort: DiscoverRunSort; dir: DiscoverSortDirection }>({
    sort: "position",
    dir: "asc",
  });
  const [pushOpen, setPushOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  const remove = async () => {
    const bridge = window.cuepoint?.deleteDiscoveryRun;
    if (!bridge) return;
    setDeleting(true);
    try {
      const answer = await bridge({ run_id: runId });
      if (answer.refusal) {
        notify(refusalText(answer.refusal), "warning");
      } else {
        notify("Deleted the run. Tracks on your wantlist stay there.", "success");
        onDeleted(runId);
      }
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : String(cause), "warning");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const run = header?.run ?? null;
  const page = tracks.page;
  const sort: TrackTableSort = { key: order.sort, direction: order.dir };
  const hidden = page?.hidden ?? 0;

  const emptyState = (
    <div className="discover-empty">
      {tracks.status === "error" ? (
        <>
          <p className="discover-empty__headline">The run's tracks could not be read.</p>
          <p className="discover-note">{tracks.error}</p>
          <Button variant="secondary" onClick={reload}>
            Try again
          </Button>
        </>
      ) : tracks.loading ? (
        <p className="discover-note">Reading the run's tracks…</p>
      ) : (page?.tracks ?? 0) === 0 ? (
        <p className="discover-empty__headline">
          {run?.running ? "Nothing found yet." : "This run found nothing."}
        </p>
      ) : (
        <>
          <p className="discover-empty__headline">
            You own every track this run found.
          </p>
          <Button variant="secondary" onClick={() => setOwned("all")}>
            Show them
          </Button>
        </>
      )}
    </div>
  );

  return (
    <section className="discover-run" aria-label="Run">
      <header className="discover-run__header">
        {headerError ? (
          <p className="discover-note discover-note--warning" role="alert">
            {headerError}
          </p>
        ) : !run || !header ? (
          <p className="discover-note">Reading the run…</p>
        ) : (
          <>
            <div className="discover-run__title-row">
              <h2 className="discover-section__title">Run of {formatWhen(run.started_at)}</h2>
              <Badge variant={BADGE[runStateTone(run)]}>{runStateLabel(run)}</Badge>
              <span className="discover-table__spacer" />
              <Button
                variant="secondary"
                disabled={run.running}
                title={run.running ? "A running run cannot be deleted." : undefined}
                onClick={() => setConfirmDelete(true)}
              >
                Delete run…
              </Button>
            </div>
            <p className="discover-run__outcome">{runOutcome(run)}</p>
            <ul className="discover-run__looked" aria-label="What this run looked for">
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

      <div className="discover-toolbar" role="toolbar" aria-label="Run's tracks">
        <label className="discover-toolbar__check">
          <input
            type="checkbox"
            checked={owned === "all"}
            onChange={(event) => setOwned(event.target.checked ? "all" : "hide")}
          />
          Show tracks you own
        </label>
        {owned === "hide" && hidden > 0 && (
          <span className="discover-toolbar__hidden" role="status">
            {hiddenLine(hidden)}
          </span>
        )}
        {page && (
          <span className="discover-note">
            {formatCount(page.tracks)} found, {formatCount(page.owned)} owned
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
        label="Tracks this run found"
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

      <Modal
        open={confirmDelete}
        title="Delete this run?"
        onClose={() => setConfirmDelete(false)}
        secondaryAction={{ label: "Keep it", onClick: () => setConfirmDelete(false) }}
        primaryAction={{ label: "Delete run", onClick: () => void remove(), loading: deleting }}
      >
        <p className="discover-dialog__text">
          The run and the list of what it found go. Tracks you added to your wantlist from it
          stay there.
        </p>
      </Modal>
    </section>
  );
}
