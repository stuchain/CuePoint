import type { CuePointBridge, EngineJobSummary, JobStatus } from "./cuepointBridge.types";

/**
 * How often the app asks what background work is running.
 *
 * This one *is* an HTTP round trip, unlike the engine-status read, so it is
 * deliberately not tight — the strip is mounted for the life of the app, and a
 * permanent component polling hard is permanent load. It only has to notice
 * that a job *started*; once one is found, progress arrives over SSE rather
 * than by polling.
 *
 * Two seconds rather than four because four is long enough to look broken:
 * starting a match and glancing at the strip should not need a wait. It is
 * still a discovery poll, so a job shorter than the interval can finish
 * unseen — a demo run completes in about 300ms and is often missed entirely.
 * That is acceptable: the jobs worth reporting are the ones that take long
 * enough to want reporting on.
 */
export const JOB_POLL_MS = 2000;

/**
 * One shared read of the engine's active jobs (C19c).
 *
 * The strip, Clean, Discover, Statistics and the ready note each wanted to know
 * what is running, and each used to ask for itself: with Clean open that was two
 * polls and two SSE streams for one job. Anything that needs the answer now
 * subscribes here instead, so the engine is asked once per tick and a job has
 * one stream however many screens are watching it.
 *
 * Plain module state, not React: `followJob` and the hooks both need it, and a
 * context would only be reachable from the second.
 */
export interface JobsSnapshot {
  /** The active jobs the poll listed (at most five). */
  jobs: EngineJobSummary[];
  /** Active jobs in total, so the strip can say "+2 more" rather than lying. */
  activeCount: number;
  /** True once the first poll has answered, so "no jobs" can be told from "not asked yet". */
  loaded: boolean;
  /**
   * True when the last poll failed. The list is then empty only because nothing could be
   * read, so a reader that cares about a job ending must not take it as "none running".
   */
  failed: boolean;
  /** The engine's change counters, when it sends them; see `onRevisionsChanged`. */
  revisions?: Revisions;
}

// A Discover dig writes the catalog about once a second; the engine counts that as
// `discover`, not `library`, so only Discover's reads are read again for it.
type RevisionDomain = "library" | "waveforms" | "discover";
type Revisions = { library: number; waveforms: number; discover?: number };
const REVISION_DOMAINS: readonly RevisionDomain[] = ["library", "waveforms", "discover"];

const EMPTY: JobsSnapshot = { jobs: [], activeCount: 0, loaded: false, failed: false };

const TERMINAL: ReadonlySet<string> = new Set(["succeeded", "failed", "cancelled"]);

/** How old an answer may be and still be handed to a newcomer instead of asking again. */
const FRESH_MS = 250;
/** How long a poll may go unanswered before the next tick asks anyway. */
const STUCK_MS = 15_000;

interface Stream {
  listeners: Set<(event: JobStatus) => void>;
  close: () => void;
  closed: boolean;
}

const pollers = new Map<(snapshot: JobsSnapshot) => void, number>();
const finishedListeners = new Set<(job: { id: string; type: string }) => void>();
const revisionListeners = new Set<(domains: RevisionDomain[]) => void>();
// Per bridge object, so a test's fake bridge never shares a stream with another's.
let streams = new WeakMap<object, Map<string, Stream>>();
const openStreams = new Set<Stream>();

let snapshot: JobsSnapshot = EMPTY;
// When `snapshot` was answered: a newcomer is only handed a fresh one (below).
let snapshotAt = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let timerMs = 0;
// When the poll now waiting began, or null. One that hangs past `STUCK_MS` no longer
// holds the others back, and an answer older than the last one read is dropped.
let inFlightSince: number | null = null;
let pollSeq = 0;
let readSeq = 0;
// A newcomer arrived while a poll was out: that poll may predate what it needs to see.
let again = false;
// Bumped by every stop, so an answer to a poll that predates it is dropped.
let epoch = 0;
// Job id to type for what the poll has seen active and not yet seen end.
const running = new Map<string, string>();
// A job reports its end once, however many ways there are to learn of it.
const finished = new Set<string>();
let lastRevisions: Revisions | null = null;

function announceFinished(id: string, type: string): void {
  if (finished.has(id)) return;
  finished.add(id);
  running.delete(id);
  for (const listener of [...finishedListeners]) listener({ id, type });
}

function read(result: {
  jobs: EngineJobSummary[];
  active_count: number;
  revisions?: Revisions;
}): void {
  const listed = new Set(result.jobs.map((job) => job.id));
  // The poll lists at most a few jobs, so one that is not listed while more are
  // active than were listed is not known to be finished.
  const hidden = result.active_count > result.jobs.length;
  const ended: Array<[string, string]> = [];
  for (const [id, type] of running) {
    if (listed.has(id) || hidden) continue;
    ended.push([id, type]);
  }
  for (const job of result.jobs) {
    if (!finished.has(job.id)) running.set(job.id, job.type);
  }

  snapshot = {
    jobs: result.jobs,
    activeCount: result.active_count,
    loaded: true,
    failed: false,
    revisions: result.revisions,
  };
  for (const listener of [...pollers.keys()]) listener(snapshot);

  for (const [id, type] of ended) announceFinished(id, type);

  const next = result.revisions;
  if (next) {
    const changed = lastRevisions ? REVISION_DOMAINS.filter((d) => next[d] !== lastRevisions![d]) : [];
    lastRevisions = next;
    if (changed.length > 0) for (const listener of [...revisionListeners]) listener(changed);
  }
}

function poll(): void {
  const list = window.cuepoint?.listJobs;
  if (!list) return;
  if (inFlightSince !== null && Date.now() - inFlightSince < STUCK_MS) return;
  inFlightSince = Date.now();
  const mine = epoch;
  const seq = ++pollSeq;
  void list({ state: "active", limit: 5 })
    .then((result) => {
      if (mine !== epoch || seq <= readSeq) return;
      readSeq = seq;
      snapshotAt = Date.now();
      read(result);
    })
    .catch(() => {
      // The engine being unreachable is reported by the engine-status half
      // of the strip; there is nothing useful to say about jobs meanwhile. A
      // failed poll also says nothing about whether a job ended.
      if (mine !== epoch || seq <= readSeq) return;
      readSeq = seq;
      snapshotAt = Date.now();
      snapshot = { ...EMPTY, loaded: true, failed: true };
      for (const listener of [...pollers.keys()]) listener(snapshot);
    })
    .finally(() => {
      if (mine !== epoch || seq !== pollSeq) return;
      inFlightSince = null;
      if (again) {
        again = false;
        poll();
      }
    });
}

function stop(): void {
  if (timer !== null) clearInterval(timer);
  timer = null;
  timerMs = 0;
  inFlightSince = null;
  again = false;
  epoch += 1;
  snapshot = EMPTY;
  snapshotAt = 0;
  running.clear();
  finished.clear();
  lastRevisions = null;
}

function schedule(): void {
  if (pollers.size === 0) {
    stop();
    return;
  }
  const every = Math.min(...pollers.values());
  if (timer !== null && every === timerMs) return;
  const first = timer === null;
  if (timer !== null) clearInterval(timer);
  timerMs = every;
  timer = setInterval(poll, every);
  if (first) poll();
}

/**
 * Listens to the shared poll of active jobs. The first listener starts it, with
 * a poll at once; the last one to leave stops it. It runs at the quickest
 * `pollMs` any listener asked for. A listener is told the current answer
 * straight away only when it is a moment old; otherwise the engine is asked again at
 * once, since a reader that has just mounted (the ready note after an import) needs
 * what is running now, not two seconds ago.
 */
export function subscribeActiveJobs(
  listener: (snapshot: JobsSnapshot) => void,
  pollMs: number = JOB_POLL_MS,
): () => void {
  // Held under a wrapper so the same function subscribed twice stays two listeners.
  const entry = (next: JobsSnapshot) => listener(next);
  const wasPolling = timer !== null;
  pollers.set(entry, pollMs);
  schedule();
  if (wasPolling) {
    if (snapshot.loaded && Date.now() - snapshotAt <= FRESH_MS) listener(snapshot);
    // A poll that went out a moment ago answers for this newcomer too.
    else if (inFlightSince !== null) again ||= Date.now() - inFlightSince > FRESH_MS;
    else poll();
  }
  return () => {
    if (!pollers.delete(entry)) return;
    schedule();
  };
}

/**
 * Asks what is running now rather than at the next tick. A screen that has just started a
 * job calls it (through `followJob`), so the strip shows the job and its Stop at once: the
 * tick can be up to `JOB_POLL_MS` away, which is the whole life of a quick batch. With
 * nobody listening there is nobody to tell, so it asks nothing.
 */
export function pollActiveJobsNow(): void {
  if (timer === null) return;
  // The poll already out may have been asked before the job started.
  if (inFlightSince !== null && Date.now() - inFlightSince < STUCK_MS) again = true;
  else poll();
}

/**
 * Follows one job's events, sharing a single bridge stream between everyone who
 * asks for the same job. The stream is closed when the last of them leaves.
 */
export function subscribeJobEvents(
  jobId: string,
  onEvent: (event: JobStatus) => void,
  bridge: Pick<CuePointBridge, "subscribeJobEvents"> | undefined = window.cuepoint,
): () => void {
  if (!bridge?.subscribeJobEvents) return () => {};
  let byJob = streams.get(bridge);
  if (!byJob) {
    byJob = new Map();
    streams.set(bridge, byJob);
  }
  let stream = byJob.get(jobId);
  if (!stream) {
    const fresh: Stream = { listeners: new Set(), close: () => {}, closed: false };
    stream = fresh;
    byJob.set(jobId, fresh);
    openStreams.add(fresh);
    const shut = bridge.subscribeJobEvents(jobId, (event) => {
      for (const listener of [...fresh.listeners]) listener(event);
      // The engine ends a stream after its last frame: the job's end, or an error frame
      // (no state) when the stream failed or ran past its limit. Anyone who asks after
      // that gets a stream of their own, not this finished one.
      const ended = event.state == null || TERMINAL.has(event.state);
      if (ended) {
        openStreams.delete(fresh);
        if (byJob!.get(jobId) === fresh) byJob!.delete(jobId);
      }
      // The frame's `type` is the frame's kind ("status"), not the job's.
      if (event.state != null && TERMINAL.has(event.state)) announceFinished(jobId, running.get(jobId) ?? "");
    });
    fresh.close = () => {
      if (fresh.closed) return;
      fresh.closed = true;
      shut();
    };
  }
  const mine = stream;
  const entry = (event: JobStatus) => onEvent(event);
  mine.listeners.add(entry);
  return () => {
    if (!mine.listeners.delete(entry) || mine.listeners.size > 0) return;
    openStreams.delete(mine);
    if (byJob!.get(jobId) === mine) byJob!.delete(jobId);
    mine.close();
  };
}

/** Calls back once for each job the poll saw running and then saw gone, or whose stream said it ended. */
export function onJobFinished(listener: (job: { id: string; type: string }) => void): () => void {
  finishedListeners.add(listener);
  return () => void finishedListeners.delete(listener);
}

/**
 * Calls back with the domains whose change counter moved since the last poll.
 * The first counters seen are only the baseline, so opening the app announces
 * nothing; an engine that does not send them never fires this.
 */
export function onRevisionsChanged(listener: (domains: RevisionDomain[]) => void): () => void {
  revisionListeners.add(listener);
  return () => void revisionListeners.delete(listener);
}

/** Puts the module back as it was at load, closing streams: tests share one module instance. */
export function resetJobsStoreForTests(): void {
  pollers.clear();
  stop();
  finishedListeners.clear();
  revisionListeners.clear();
  for (const stream of openStreams) stream.close();
  openStreams.clear();
  streams = new WeakMap();
}
