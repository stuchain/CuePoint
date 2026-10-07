/**
 * Discover's Runs tab (DISCOVER-10, DEC-091).
 *
 * The runs kept, beside either the one open or the New run panel. A run
 * started here is a job: the status strip follows it, and it appears in the
 * list as soon as the engine begins it, opened, with its tracks arriving while
 * it runs. The list is asked again while anything in it is running, which is
 * the only thing here that polls — and it stops the moment nothing is.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  DiscoverRefusal,
  DiscoverRun,
  DiscoverRunRequest,
} from "../../api/cuepointBridge.types";
import { Button } from "../../components/Button";
import { JOB_POLL_MS } from "../../components/shell/useActiveJob";
import { NewRunPanel } from "./NewRunPanel";
import { RunDetail } from "./RunDetail";
import { RunList } from "./RunList";
import { useNarrow } from "./useNarrow";
import { beatportUsable, unusableReason } from "./beatportState";
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
  startRun: (request: DiscoverRunRequest) => Promise<DiscoverRefusal | null>;
  /** How often to ask while a run runs; the status strip's interval by default. */
  pollMs?: number;
}

export function RunsView({
  tools,
  runningJobId,
  runsVersion,
  startRun,
  pollMs = JOB_POLL_MS,
}: RunsViewProps) {
  const [runs, setRuns] = useState<DiscoverRun[] | null>(null);
  const [total, setTotal] = useState(0);
  const [listError, setListError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | "new" | null>(null);
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
      // A run open beside the list that is running, or has just stopped, has
      // new tracks and a new header.
      const current = selectedRef.current;
      const running = new Set(listed.filter((run) => run.running).map((run) => run.id));
      if (typeof current === "number" && (running.has(current) || wasRunning.current.has(current))) {
        setDetailVersion((value) => value + 1);
      }
      wasRunning.current = running;
      setSelected((previous) => {
        if (previous !== null) return previous;
        return listed[0]?.id ?? "new";
      });
    } catch (cause) {
      reportUnexpected(cause);
      setListError(cause instanceof Error ? cause.message : String(cause));
      setRuns((previous) => previous ?? []);
    }
  }, [tools.options.limits.max_runs]);

  useEffect(() => {
    void load();
  }, [load]);

  // A discovery that ended: the list, and the run if it is open, again.
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

  // The run a start began, opened as soon as the engine has made it.
  useEffect(() => {
    if (!awaiting || !runs) return;
    const started = runs.find((run) => run.job_id === awaiting);
    if (!started) return;
    setAwaiting(null);
    setSelected(started.id);
  }, [awaiting, runs]);

  const start = async (request: DiscoverRunRequest) => {
    const refused = await startRun(request);
    if (refused?.code === "DISCOVER_BUSY" && refused.job_id) {
      // One is already running: open it, if the list has it.
      setAwaiting(refused.job_id);
      void load();
      return refused;
    }
    if (refused) return refused;
    void load();
    return null;
  };

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

  // The newest run left opens in its place, once the list has been read again.
  const afterRemoval = useCallback(
    (removed: number | null) => {
      setRuns((previous) => (previous ?? []).filter((run) => run.id !== removed));
      setSelected(null);
      void load();
    },
    [load],
  );
  const onGone = useCallback(() => {
    const current = selectedRef.current;
    afterRemoval(typeof current === "number" ? current : null);
  }, [afterRemoval]);

  if (runs === null) {
    return <p className="discover-note discover-runs-view__waiting">Reading your runs…</p>;
  }

  const usable = beatportUsable(tools.beatportState);

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
          onShowMore={() => void showMore()}
          loadingMore={loadingMore}
        />
      </div>
      <div className="discover-runs-view__detail">
        {selected === null ? (
          <p className="discover-note">Reading your runs…</p>
        ) : selected === "new" ? (
          <NewRunPanel
            options={tools.options}
            usable={usable}
            unusableReason={unusableReason(tools.beatportState)}
            busy={active}
            onStart={start}
          />
        ) : (
          <RunDetail
            key={selected}
            runId={selected}
            tools={tools}
            version={detailVersion}
            onDeleted={(id) => afterRemoval(id)}
            onGone={onGone}
          />
        )}
      </div>
    </div>
  );
}
