/**
 * Discover's Results tab (DISCOVER-10, DEC-091, FLW-15).
 *
 * The past searches on the left, the chosen one's tracks on the right; the
 * newest is chosen when none is. With none yet it says so and leads to New
 * search. A search started on the New search tab is a job: the status strip
 * follows it, and it appears in the list as soon as the engine begins it,
 * opened, with its tracks arriving while it runs. The list is asked again while
 * anything in it is running, which is the only thing here that polls — and it
 * stops the moment nothing is.
 *
 * **Deleting a search lives on its row**, so the confirmation is here, beside
 * the list, and the search's own page has no delete of its own.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { DiscoverRun } from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { JOB_POLL_MS } from "../../components/shell/useActiveJob";
import { RunDetail } from "./RunDetail";
import { RunList } from "./RunList";
import { useNarrow } from "./useNarrow";
import { refusalText } from "./discoverFormat";
import { NO_ENGINE, type DiscoverTools } from "./discoverTools";
import { reportUnexpected } from "../../reporting/reporting";

/** Runs asked for at a time; "Show older runs" asks for this many more. */
const RUNS_PAGE = 50;

/**
 * The width, at scale 1, below which the list goes above the run rather than
 * beside it: room for a run's header on a line or two and several columns.
 */
const SIDE_BY_SIDE_MIN_WIDTH = 560;

interface RunsViewProps {
  tools: DiscoverTools;
  /** The discovery job the page is following, while one runs. */
  runningJobId: string | null;
  /** Changes when a discovery job ends, so the list and the run are read again. */
  runsVersion: number;
  /** Opens the New search tab, from "No searches yet". */
  onNewSearch: () => void;
  /** How often to ask while a search runs; the status strip's interval by default. */
  pollMs?: number;
}

export function RunsView({
  tools,
  runningJobId,
  runsVersion,
  onNewSearch,
  pollMs = JOB_POLL_MS,
}: RunsViewProps) {
  const [runs, setRuns] = useState<DiscoverRun[] | null>(null);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<DiscoverRun | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [detailVersion, setDetailVersion] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  // The job a start here began, until its run is in the list to open.
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const shown = useRef(RUNS_PAGE);
  const wasRunning = useRef<Set<number>>(new Set());
  const selectedRef = useRef(selected);
  const [view, stacked] = useNarrow(SIDE_BY_SIDE_MIN_WIDTH);
  selectedRef.current = selected;

  const load = useCallback(async () => {
    const bridge = window.cuepoint?.listDiscoveryRuns;
    if (!bridge) {
      setListError(NO_ENGINE);
      setRuns([]);
      return;
    }
    try {
      const answer = await bridge({ limit: Math.min(shown.current, tools.options.limits.max_runs), offset: 0 });
      if (answer.refusal) {
        setListError(refusalText(answer.refusal));
        return;
      }
      const listed = answer.value.runs;
      setRuns(listed);
      setTotal(answer.value.total);
      setListError(null);
      // A search open beside the list that is running, or has just stopped, has
      // new tracks and a new header.
      const current = selectedRef.current;
      const running = new Set(listed.filter((run) => run.running).map((run) => run.id));
      if (current !== null && (running.has(current) || wasRunning.current.has(current))) {
        setDetailVersion((value) => value + 1);
      }
      wasRunning.current = running;
      // The newest search is chosen when none is.
      setSelected((previous) => previous ?? listed[0]?.id ?? null);
    } catch (cause) {
      reportUnexpected(cause);
      setListError(cause instanceof Error ? cause.message : String(cause));
      setRuns((previous) => previous ?? []);
    }
  }, [tools.options.limits.max_runs]);

  useEffect(() => {
    void load();
  }, [load]);

  // A search that ended: the list, and the search if it is open, again.
  useEffect(() => {
    if (runsVersion === 0) return;
    // A job that ended without making a run — refused as it began — leaves
    // nothing to wait for.
    void load().then(() => setAwaiting(null));
    setDetailVersion((value) => value + 1);
  }, [load, runsVersion]);

  const anyRunning = (runs ?? []).some((run) => run.running);
  const active = anyRunning || runningJobId !== null || awaiting !== null;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => void load(), pollMs);
    return () => window.clearInterval(timer);
  }, [active, load, pollMs]);

  // The search a start began, opened as soon as the engine has made it.
  useEffect(() => {
    if (!awaiting || !runs) return;
    const started = runs.find((run) => run.job_id === awaiting);
    if (!started) return;
    setAwaiting(null);
    setSelected(started.id);
  }, [awaiting, runs]);

  // The page learns the job's id from the start; the run it makes follows.
  useEffect(() => {
    if (runningJobId) setAwaiting(runningJobId);
  }, [runningJobId]);

  const showMore = async () => {
    setLoadingMore(true);
    shown.current += RUNS_PAGE;
    await load();
    setLoadingMore(false);
  };

  // The newest search left opens in its place, once the list has been read again.
  const afterRemoval = useCallback(
    (removed: number | null) => {
      setRuns((previous) => (previous ?? []).filter((run) => run.id !== removed));
      setSelected(null);
      void load();
    },
    [load],
  );
  const onGone = useCallback(() => {
    afterRemoval(selectedRef.current);
  }, [afterRemoval]);

  const remove = async () => {
    const target = deleting;
    const bridge = window.cuepoint?.deleteDiscoveryRun;
    if (!target || !bridge) return;
    setDeletePending(true);
    try {
      const answer = await bridge({ run_id: target.id });
      if (answer.refusal) {
        tools.notify(refusalText(answer.refusal), "warning");
      } else {
        tools.notify("Deleted the search. Tracks on your wantlist stay there.", "success");
        afterRemoval(target.id);
      }
    } catch (cause) {
      reportUnexpected(cause);
      tools.notify(cause instanceof Error ? cause.message : String(cause), "warning");
    } finally {
      setDeletePending(false);
      setDeleting(null);
    }
  };

  if (runs === null) {
    return <p className="discover-note discover-runs-view__waiting">Reading your searches…</p>;
  }

  // A search just started is on its way to the list: not "none yet".
  const starting = awaiting !== null || runningJobId !== null;
  if (runs.length === 0 && !starting) {
    return (
      <div className="discover-empty">
        {listError && (
          <div className="discover-note discover-note--warning" role="alert">
            <p>{listError}</p>
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}
        <p className="discover-empty__headline">No searches yet</p>
        <p className="discover-note">
          Choose genres, artists or labels, and CuePoint looks for what is new from your artists
          and labels. What it finds appears here.
        </p>
        <Button onClick={onNewSearch}>New search</Button>
      </div>
    );
  }

  return (
    <div
      ref={view}
      className={`discover-runs-view${stacked ? " discover-runs-view--stacked" : ""}`}
    >
      <div className="discover-runs-view__list">
        {listError && (
          <div className="discover-note discover-note--warning" role="alert">
            <p>{listError}</p>
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}
        <RunList
          runs={runs}
          total={total}
          genres={tools.options.genres}
          selected={selected}
          onSelect={setSelected}
          onDelete={setDeleting}
          onShowMore={() => void showMore()}
          loadingMore={loadingMore}
        />
      </div>
      <div className="discover-runs-view__detail">
        {selected === null ? (
          <p className="discover-note">Reading your searches…</p>
        ) : (
          <RunDetail
            key={selected}
            runId={selected}
            tools={tools}
            version={detailVersion}
            onGone={onGone}
          />
        )}
      </div>

      <Modal
        open={deleting !== null}
        title="Delete this search?"
        onClose={() => setDeleting(null)}
        secondaryAction={{ label: "Keep it", onClick: () => setDeleting(null) }}
        primaryAction={{
          label: "Delete search",
          onClick: () => void remove(),
          loading: deletePending,
        }}
      >
        <p className="discover-dialog__text">
          The search and the list of what it found go. Tracks you added to your wantlist from it
          stay there.
        </p>
      </Modal>
    </div>
  );
}
