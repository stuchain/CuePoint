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
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { DiscoverRun } from "../../api/cuepointBridge.types";
import { discoveryRuns, useReportReadError, useSharedRead } from "../../api/sharedReads";
import { Button } from "../../components/Button";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { EmptyState } from "../../components/EmptyState";
import { Loading } from "../../components/Loading";
import { Notice } from "../../components/Notice";
import { RETRY, deleteLabel, deleteTitle } from "../../format/words";
import { JOB_POLL_MS } from "../../components/shell/useActiveJob";
import { RunDetail } from "./RunDetail";
import { RunList } from "./RunList";
import { useNarrow } from "./useNarrow";
import { refusalText, searchTitle } from "./discoverFormat";
import { NO_ENGINE, type DiscoverTools } from "./discoverTools";
import type { DiscoverRunOpening } from "./discoverSections";
import { reportUnexpected } from "../../reporting/reporting";
import { userMessage } from "../../api/userMessage";

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
  /** Picks a stopped dig up where it stopped; a refusal comes back as an answer. */
  onContinue: (runId: number) => Promise<unknown>;
  /** Why Continue is off right now (another dig, Beatport), or null. */
  continueBlocked: string | null;
  /** How often to ask while a search runs; the status strip's interval by default. */
  pollMs?: number;
  /**
   * The lookup notice (DSC-4): it belongs to Results alone (C237), above the list and the open
   * dig, and is not drawn while there are no digs to look at.
   */
  lookup?: ReactNode;
  /** Told whether a dig, and so rows of tracks, is showing (M490: the page's Details slot). */
  onHasRows?: (has: boolean) => void;
  /** A dig another page asked to open (M269: an Activity dig row), once per navigation. */
  opening?: DiscoverRunOpening | null;
}

export function RunsView({
  tools,
  runningJobId,
  runsVersion,
  onNewSearch,
  onContinue,
  continueBlocked,
  pollMs = JOB_POLL_MS,
  lookup = null,
  onHasRows,
  opening = null,
}: RunsViewProps) {
  // The list is read through the shared cache (C19d): a page shown again has it
  // at once, and it is read again when a search ends (the cache hears the job),
  // when this page says so, and while one runs (the poll below).
  const [limit, setLimit] = useState(RUNS_PAGE);
  const read = useSharedRead(
    discoveryRuns({ limit: Math.min(limit, tools.options.limits.max_runs), offset: 0 }),
  );
  const { refresh } = read;
  useReportReadError(read.error);
  const answer = read.value;
  // The last list read, kept while another size is asked for ("Show older runs")
  // or a read fails, so the list does not vanish under the pointer.
  const lastList = useRef<{ runs: DiscoverRun[]; total: number } | null>(null);
  // Made once per answer: a new object per render would make `runs` a new array each time.
  const fromAnswer = useMemo(
    () => (answer && !answer.refusal ? { runs: answer.value.runs, total: answer.value.total } : null),
    [answer],
  );
  if (fromAnswer) lastList.current = fromAnswer;
  const [removed, setRemoved] = useState<ReadonlySet<number>>(() => new Set());
  const listed = lastList.current;
  const runs = useMemo<DiscoverRun[] | null>(() => {
    if (listed) return listed.runs.filter((run) => !removed.has(run.id));
    return read.loading ? null : [];
  }, [listed, read.loading, removed]);
  const total = listed && runs ? listed.total - (listed.runs.length - runs.length) : 0;
  const listError = read.unavailable
    ? NO_ENGINE
    : answer?.refusal
      ? refusalText(answer.refusal)
      : read.error !== undefined
        ? userMessage(read.error)
        : null;
  const [selected, setSelected] = useState<number | null>(() => opening?.runId ?? runs?.[0]?.id ?? null);
  const showsRows = runs !== null && runs.length > 0;
  useEffect(() => {
    onHasRows?.(showsRows);
  }, [onHasRows, showsRows]);
  useEffect(() => () => onHasRows?.(false), [onHasRows]);
  const [deleting, setDeleting] = useState<DiscoverRun | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [detailVersion, setDetailVersion] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  // The job a start here began, until its run is in the list to open.
  const [awaiting, setAwaiting] = useState<string | null>(null);
  const wasRunning = useRef<Set<number>>(new Set());
  const selectedRef = useRef(selected);
  const clearAwaitingAfterRead = useRef(false);
  const [view, stacked] = useNarrow(SIDE_BY_SIDE_MIN_WIDTH);
  selectedRef.current = selected;

  // Each new answer: a search open beside the list that is running, or has just
  // stopped, has new tracks and a new header.
  useEffect(() => {
    if (!answer || answer.refusal) return;
    const running = new Set(answer.value.runs.filter((run) => run.running).map((run) => run.id));
    const current = selectedRef.current;
    if (current !== null && (running.has(current) || wasRunning.current.has(current))) {
      setDetailVersion((value) => value + 1);
    }
    wasRunning.current = running;
  }, [answer]);

  // A dig another page asked for (M269) is opened, whether or not it is on the list's first page.
  const openingToken = opening?.token ?? null;
  const openingRun = opening?.runId ?? null;
  useEffect(() => {
    if (openingRun !== null) setSelected(openingRun);
  }, [openingToken, openingRun]);

  // The newest search is chosen when none is.
  useEffect(() => {
    if (runs && runs.length > 0) setSelected((previous) => previous ?? runs[0]?.id ?? null);
  }, [runs]);

  // Whatever a read answered (or failed with), "Show older runs" is no longer waiting. The
  // render where the key moved to a size nobody has read yet (no answer, no failure) is
  // not an answer: it keeps the wait, and a start's wait for its read.
  useEffect(() => {
    if (answer === undefined && read.error === undefined) return;
    setLoadingMore(false);
    if (clearAwaitingAfterRead.current) {
      clearAwaitingAfterRead.current = false;
      setAwaiting(null);
    }
  }, [answer, read.error]);

  // A search that ended: the list, and the search if it is open, again.
  useEffect(() => {
    if (runsVersion === 0) return;
    // A job that ended without making a run — refused as it began — leaves
    // nothing to wait for, once the list has been read.
    clearAwaitingAfterRead.current = true;
    refresh();
    setDetailVersion((value) => value + 1);
  }, [refresh, runsVersion]);

  const anyRunning = (runs ?? []).some((run) => run.running);
  const active = anyRunning || runningJobId !== null || awaiting !== null;
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(refresh, pollMs);
    return () => window.clearInterval(timer);
  }, [active, refresh, pollMs]);

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

  const showMore = () => {
    // Already asking for the most the engine keeps: the same question would never answer anew.
    if (Math.min(limit, tools.options.limits.max_runs) >= tools.options.limits.max_runs) return;
    setLoadingMore(true);
    // "Show all" shows all of them (up to the most the engine keeps), not another page.
    setLimit(tools.options.limits.max_runs);
  };

  // The newest search left opens in its place, once the list has been read again.
  const afterRemoval = useCallback(
    (gone: number | null) => {
      if (gone !== null) setRemoved((previous) => new Set(previous).add(gone));
      setSelected(null);
      refresh();
    },
    [refresh],
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
        tools.notify("Deleted the dig. Tracks on your wantlist stay there.", "success");
        afterRemoval(target.id);
      }
    } catch (cause) {
      reportUnexpected(cause);
      tools.notify(userMessage(cause), "warning");
    } finally {
      setDeletePending(false);
      setDeleting(null);
    }
  };

  if (runs === null) {
    return <Loading what="your digs" className="discover-runs-view__waiting" centered />;
  }

  // A search just started is on its way to the list: not "none yet".
  const starting = awaiting !== null || runningJobId !== null;
  if (runs.length === 0 && !starting) {
    return (
      <>
        {lookup && <div className="discover-runs-view__lookup">{lookup}</div>}
        {listError && (
          <Notice
            action={
              <Button variant="secondary" onClick={refresh}>
                {RETRY}
              </Button>
            }
          >
            {listError}
          </Notice>
        )}
        <EmptyState
          icon="search"
          headline="No digs yet"
          description="What a dig finds appears here."
          action={{ label: "New dig", onClick: onNewSearch }}
        />
      </>
    );
  }

  return (
    <>
      {lookup && <div className="discover-runs-view__lookup">{lookup}</div>}
      <div
        ref={view}
        className={`discover-runs-view${stacked ? " discover-runs-view--stacked" : ""}`}
      >
        {/* M459: F6 visits the dig list and the results as two panes. */}
        <div className="discover-runs-view__list" data-pane="digs">
          {listError && (
            <Notice
              action={
                <Button variant="secondary" onClick={refresh}>
                  {RETRY}
                </Button>
              }
            >
              {listError}
            </Notice>
          )}
          <RunList
            runs={runs}
            total={total}
            genres={tools.options.genres}
            selected={selected}
            onSelect={setSelected}
            onDelete={setDeleting}
            onContinue={(run) => {
              setSelected(run.id);
              void onContinue(run.id);
            }}
            continueBlocked={continueBlocked}
            max={tools.options.limits.max_runs}
            onShowMore={showMore}
            loadingMore={loadingMore}
          />
        </div>
        <div className="discover-runs-view__detail" data-pane="results">
          {selected === null ? (
            <Loading what="your digs" />
          ) : (
            <RunDetail
              key={selected}
              runId={selected}
              // The row's facts draw the header at once; the engine's header follows.
              listed={runs.find((run) => run.id === selected) ?? null}
              tools={tools}
              version={detailVersion}
              onGone={onGone}
            />
          )}
        </div>

        <ConfirmDialog
          open={deleting !== null}
          title={deleteTitle("dig", deleting ? searchTitle(deleting.started_at) : undefined)}
          confirmLabel={deleteLabel("dig")}
          danger
          onConfirm={() => {
            if (!deletePending) void remove();
          }}
          onCancel={() => setDeleting(null)}
        >
          The dig and the list of what it found go. Tracks you added to your wantlist from it stay
          there.
        </ConfirmDialog>
      </div>
    </>
  );
}
