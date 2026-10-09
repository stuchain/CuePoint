import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WebContents } from "electron";
import {
  EngineClient,
  type ActivityFeed,
  type EngineJobList,
  type LibraryBrowseParams,
  type CompatibleKeys,
  type KeySource,
  type KeysPopulation,
  type LibraryFacet,
  type LibraryQuickFacets,
  type LibraryFilterVocabulary,
  type LibraryImportStarted,
  type LibraryPlaylistTree,
  type LibraryRefreshStarted,
  type LibrarySearchResponse,
  type LibrarySummary,
  type ArtworkSize,
  type LibraryTrackDetail,
  type FilterRuleSet,
  type BatchOperation,
  type BatchOutcome,
  type BatchSelection,
  type CollectionAdded,
  type CollectionEntry,
  type CollectionEntryPage,
  type CollectionNode,
  type CollectionSubtree,
  type CollectionTree,
  type FrozenCollection,
  type Tag,
  type TagVocabulary,
  type TrackHistory,
  type TrackMetadata,
  type ApplyOutcome,
  type ArtworkScanStarted,
  type AttemptCandidates,
  type BatchRevertOutcome,
  type DecisionOutcome,
  type DiscoverAnswer,
  type DiscoverJobStarted,
  type DiscoverOptions,
  type DiscoverRunDeleted,
  type DiscoverRunHeader,
  type DiscoverRunList,
  type DiscoverRunTracksPage,
  type EntityBeatportHalf,
  type EntityPage,
  type SimilarTracks,
  type SetAcknowledged,
  type SetAnalysis,
  type SetAnswer,
  type SetChapterChanged,
  type SetChapterDeleted,
  type SetCreated,
  type SetCreatedFrom,
  type SetEntries,
  type SetEntryMoved,
  type SetEntryPlanChanged,
  type SetListSave,
  type SetListText,
  type SetNotesChanged,
  type SetPlan,
  type SetSuggestions,
  type SetUnacknowledged,
  type WantlistChange,
  type WantlistPage,
  type DuplicateGroup,
  type DuplicateGroupList,
  type DuplicateScanStarted,
  type FieldRevert,
  type FileCheckStarted,
  type LibraryHealth,
  type StatisticsHealth,
  type StatisticsPlays,
  type StatisticsSpreads,
  type LibraryTrackRow,
  type MatchStarted,
  type ResumableMatches,
  type ReviewExportResult,
  type RekordboxExportHistory,
  type RekordboxExportPreviewAnswer,
  type RekordboxExportStartAnswer,
  type TagPreviewOutcome,
  type TagRestoreStarted,
  type TagWriteRecord,
  type TagWriteStarted,
  type TrackFolder,
  type TrackMatches,
  type WaveformAnalysisStatus,
  type WaveformAnswer,
  type WaveformBatch,
  type WaveformDataDeletion,
  type WaveformsRequested,
} from "./engineClient";
import type { BuildInfo } from "./buildInfo";
import { getBundledEnginePath, shouldUseBundledEngine } from "./engineLaunch";
import { withDecoderPath } from "./playerLaunch";
import { stopProcessTree } from "./processTree";
import { IncidentTracker, OUTPUT_TAIL_LINES, capLine, type OutputTail, type ProcessReporter } from "./processWatch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Repo root: works from source (`electron/`) and bundle (`electron-dist/`). */
const REPO_ROOT = path.resolve(__dirname, "../../..");

function resolveDevelopmentPython(): string {
  if (process.env.CUEPOINT_PYTHON) return process.env.CUEPOINT_PYTHON;

  const localPython =
    process.platform === "win32"
      ? path.join(REPO_ROOT, ".venv", "Scripts", "python.exe")
      : path.join(REPO_ROOT, ".venv", "bin", "python");
  if (fs.existsSync(localPython)) return localPython;

  return process.platform === "win32" ? "python" : "python3";
}

export interface EngineStatus {
  connected: boolean;
  version?: string;
  sessionId?: string;
  error?: string;
  /**
   * True while a bounded auto-restart is in progress (DEC-028), so the status
   * strip can say "reconnecting" rather than "offline" — they mean different
   * things to someone deciding whether to act.
   */
  reconnecting?: boolean;
  /** Restart attempts made since the engine last ran healthily. */
  restartAttempts?: number;
  /**
   * True while the engine has been spawned but has not yet answered `/health`.
   *
   * Its own state, because "not connected yet" and "not connected any more"
   * ask different things of the person reading the strip: the first is worth
   * waiting out, the second is worth acting on. A packaged macOS engine takes
   * about ten seconds to answer on a cold start (see `HEALTH_TIMEOUT_MS`), and
   * for all of it `getStatus()` used to report `connected: true` — every call
   * made in that window failed while the strip said the engine was there.
   */
  starting?: boolean;
}

/**
 * How long the engine gets to answer `/health` before it is called dead.
 *
 * This was 5 seconds (20 attempts, 250ms apart) and a packaged macOS engine
 * does not cold-start in five seconds. It is a PyInstaller one-file build: the
 * first run of a given build unpacks ~76MB into a temporary directory and
 * imports the whole engine before it can bind a socket, which measured **9.7s**
 * on an M5 Pro — so every engine call in the first ten seconds after launch
 * failed, on the run that matters most, the first one after installing.
 *
 * `scripts/build_engine_sidecar.py` learned this already and allows 90s, with
 * the same reasoning written next to it; the supervisor never did. The number
 * is deliberately generous and matches it: this bound exists to catch an engine
 * that never starts, not to police how long starting takes. The window does
 * not wait on it — `starting` tells the UI what is happening meanwhile — but
 * engine requests do (see `readyClient()`), so the first screen's data arrives
 * when the engine can give it rather than failing before it could.
 */
export const HEALTH_TIMEOUT_MS = 90_000;

/** How often `/health` is asked while waiting. */
export const HEALTH_POLL_MS = 250;

/**
 * How hard CuePoint tries to bring a dead engine back (DEC-028).
 *
 * Bounded on purpose. Unlimited restarts would hide a crash-looping engine
 * behind a flickering status; three attempts recover the transient case and
 * then stop and say so, leaving the user a Restart engine control.
 */
const MAX_RESTART_ATTEMPTS = 3;
const RESTART_BACKOFF_MS = [1000, 2000, 4000];

interface EngineSupervisorOptions {
  /**
   * The mpv the engine analyses audio with, resolved at each launch, or null
   * when there is none (WAVE-01, DEC-123). Resolved per launch rather than
   * once, as the player resolves its own binary, so a fetch mid-session is
   * noticed at the next restart.
   */
  decoderPath?: () => string | null;
  /**
   * Whether the engine may send error reports, resolved at each launch like
   * `decoderPath` so a restart carries the current choice (REPORT-01, DEC-128).
   * Absent reads as off.
   */
  errorReporting?: () => boolean;
  /**
   * Which build this is (`buildInfo.ts`), told to the engine so its reports carry the release,
   * `dist` and environment main's do (REPORT-07, DEC-126). Absent, the engine is told none.
   */
  build?: BuildInfo;
  /**
   * Where the engine's incidents go (REPORT-05): an exit that was not asked for, each restart,
   * a give-up, a launch that failed. `main.ts` passes `processReporter`; the supervisor never
   * imports the Sentry SDK. Absent, nothing is reported.
   */
  reporter?: ProcessReporter;
  /** Replaces `RESTART_BACKOFF_MS`; for tests. */
  restartBackoffMs?: readonly number[];
  /** Replaces `HEALTH_TIMEOUT_MS`; for tests. */
  healthTimeoutMs?: number;
  /**
   * Replaces what is spawned, for tests with a stand-in engine. It is given nothing of the
   * environment: `engineEnvironment()` is still what the child runs with.
   */
  command?: () => { command: string; args: string[]; cwd?: string };
}

interface EngineEnvironmentInput {
  port: number;
  token: string;
  sessionId: string;
  parentPid: number;
  decoderPath: string | null;
  errorReporting: boolean;
  build?: Pick<BuildInfo, "release" | "dist" | "environment">;
  env?: NodeJS.ProcessEnv;
}

/**
 * Everything the engine is spawned with in its environment.
 *
 * Pure, so what the engine is told can be checked without spawning it.
 */
export function engineEnvironment(input: EngineEnvironmentInput): NodeJS.ProcessEnv {
  const inherited = input.env ?? process.env;
  const dsn = (inherited.CUEPOINT_SENTRY_DSN ?? "").trim();
  const env: NodeJS.ProcessEnv = {
    ...inherited,
    CUEPOINT_HOST: "127.0.0.1",
    CUEPOINT_PORT: String(input.port),
    CUEPOINT_TOKEN: input.token,
    CUEPOINT_SESSION_ID: input.sessionId,
    // Always set, so an inherited value never decides it (REPORT-01, DEC-128).
    CUEPOINT_ERROR_REPORTING: input.errorReporting ? "1" : "0",
    // Always set, empty when unknown, so an inherited value never decides what build the engine
    // says it is (REPORT-07). The engine reads empty as "not given".
    CUEPOINT_RELEASE: input.build?.release ?? "",
    CUEPOINT_DIST: input.build?.dist ?? "",
    CUEPOINT_ENVIRONMENT: input.build?.environment ?? "",
    CUEPOINT_HEADLESS: "1",
    // This process, not the engine's parent: a packaged engine's parent is
    // its own bootloader. The engine ends itself when this process has gone,
    // however it went (EXPORT-07, `parent_watch.py`).
    CUEPOINT_PARENT_PID: String(input.parentPid),
  };
  // Told off, the engine is told off, in the one spelling it reads (REPORT-08). Told nothing, it
  // resolves its own DSN (the sidecar's built-in one when packaged, DEC-148): main's DSN, the
  // Electron project's, is never made up for it. A DSN set by hand is passed on as it is.
  if (dsn.toLowerCase() === "off") env.CUEPOINT_SENTRY_DSN = "off";
  else if (dsn === "") delete env.CUEPOINT_SENTRY_DSN;
  return withDecoderPath(env, input.decoderPath);
}

/** What a launch answers when `stop()` came before it could spawn. */
const STOPPED: EngineStatus = { connected: false, error: "Engine not running" };

export class EngineSupervisor {
  constructor(private readonly options: EngineSupervisorOptions = {}) {
    this.incidents = new IncidentTracker("engine", options.reporter);
  }

  /** What the engine's exits and restarts add up to (`processWatch.ts`). */
  private readonly incidents: IncidentTracker;
  /**
   * The last lines the engine wrote, by stream (REPORT-05, fact 4).
   *
   * The pipes are read, not just kept: a pipe nobody reads fills (about 64 KB) and the engine's
   * next write blocks, in the middle of whatever request it was serving.
   */
  private stdoutTail: string[] = [];
  private stderrTail: string[] = [];
  /** When the current child was spawned, for the uptime an incident reports. */
  private spawnedAt = 0;

  private child: ChildProcess | null = null;
  private port: number | null = null;
  private token: string | null = null;
  private sessionId: string = crypto.randomUUID();
  private version: string | undefined;
  /**
   * One SSE stream per renderer per job, shared by everyone watching it.
   *
   * Refcounted, and that is the whole point. Before LIBRARY-11 each subscribe
   * cancelled any earlier one for the same job, because there was only ever one
   * watcher. Now the status strip follows whatever job is running *and* the
   * Library page follows the job it started — the same job, from the same
   * renderer — and the second subscriber was silently killing the first. The
   * symptom was a page waiting forever for a job the engine had already
   * finished.
   */
  private jobStreams = new Map<string, { abort: AbortController; refs: number }>();
  private restartAttempts = 0;
  private reconnecting = false;
  /**
   * Whether `/health` has answered for the child now running.
   *
   * A spawned child is not a reachable engine, and `getStatus()` used to treat
   * the two as one. Set only by a successful health poll, and cleared whenever
   * a child is started or lost.
   */
  private healthy = false;
  /**
   * The start in flight, if any; requests made meanwhile wait for it.
   *
   * The window no longer waits for the engine, so the first screen asks for
   * its data while the engine is still starting. Refused then, the Library
   * read its summary as absent and said "No collection imported yet" to a
   * library that was there — and, having asked once, never asked again.
   */
  private startup: Promise<EngineStatus> | null = null;
  /** Set while `stop()` is deliberate, so quitting is not treated as a crash. */
  private stopping = false;
  private restartTimer: NodeJS.Timeout | null = null;
  /** Wakes the automatic restart that is waiting out its backoff, so `stop()` or a Restart can end it. */
  private wakeRestart: (() => void) | null = null;
  /**
   * Set by `stop()`, cleared by the next `start()`/`restart()`: the app (or a test) has asked for
   * no engine, so nothing may spawn one, whatever was in flight when it asked.
   */
  private stopRequested = false;
  /**
   * Counts the times someone other than an automatic restart took over (`stop()`, `restart()`). An
   * automatic restart remembers the count it began under and does nothing once it has changed, so a
   * stale one cannot bounce an engine that a Restart has just brought up, and a Restart is not
   * undone by the loop it replaced.
   */
  private generation = 0;

  /** The last lines of the engine's stdout and stderr, oldest first. Survives restarts. */
  recentOutput(): { stdout: readonly string[]; stderr: readonly string[] } {
    return { stdout: [...this.stdoutTail], stderr: [...this.stderrTail] };
  }

  /** One line into a bounded tail: capped in length, and the oldest dropped past `OUTPUT_TAIL_LINES`. */
  private noteLine(which: "stdout" | "stderr", line: string): void {
    if (line.trim() === "") return;
    const tail = which === "stdout" ? this.stdoutTail : this.stderrTail;
    tail.push(capLine(line));
    if (tail.length > OUTPUT_TAIL_LINES) tail.splice(0, tail.length - OUTPUT_TAIL_LINES);
  }

  /**
   * Read one of the child's pipes line by line, keeping a bounded tail, never blocking it.
   * The same shape as `PlayerSupervisor.drainOutput`; a chunk can end mid-line, so the
   * remainder waits for the next one.
   */
  private drain(child: ChildProcess, which: "stdout" | "stderr"): void {
    const stream = child[which];
    if (!stream) return;
    let partial = "";
    const keep = (line: string): void => this.noteLine(which, line);
    stream.setEncoding("utf-8");
    stream.on("data", (chunk: string) => {
      const lines = (partial + chunk).split(/\r?\n/);
      partial = lines.pop() ?? "";
      // A line with no end is as long as a runaway write; cap what is held for it.
      if (partial.length > 8192) {
        keep(partial);
        partial = "";
      }
      for (const line of lines) keep(line);
    });
    // The rest of a line the engine died in the middle of is the interesting one.
    stream.on("end", () => keep(partial));
    // A broken pipe at shutdown is not worth surfacing, and an unhandled one would take main down.
    stream.on("error", () => undefined);
  }

  getRepoRoot(): string {
    return REPO_ROOT;
  }

  /**
   * Start the engine, and hold every request made until it has answered.
   *
   * Deliberately not `async`: the start is recorded before this returns, so
   * a window created straight after it cannot ask for anything in between.
   */
  start(): Promise<EngineStatus> {
    this.stopRequested = false;
    const run = this.launch();
    this.startup = run;
    void run
      .catch(() => undefined)
      .finally(() => {
        // A restart may have replaced it meanwhile; that one is still running.
        if (this.startup === run) this.startup = null;
      });
    return run;
  }

  private async launch(): Promise<EngineStatus> {
    // `stop()` kills the current child; that exit is ours, not a crash.
    this.stopping = true;
    await this.killChild();
    this.stopping = false;
    if (this.stopRequested) return STOPPED;
    this.healthy = false;
    this.port = await this.pickPort();
    // `stop()` may have come while the port was being found; spawning now would leave an engine
    // behind a quit that has already happened.
    if (this.stopRequested) return STOPPED;
    this.token = crypto.randomBytes(24).toString("hex");
    // The scrubber removes it from anything reported (REPORT-04 left this unwired).
    this.options.reporter?.addToken?.(this.token);

    const baseEnv = engineEnvironment({
      port: this.port,
      token: this.token,
      sessionId: this.sessionId,
      parentPid: process.pid,
      decoderPath: this.options.decoderPath?.() ?? null,
      errorReporting: this.options.errorReporting?.() ?? false,
      build: this.options.build,
    });

    const standIn = this.options.command?.();
    if (standIn) {
      this.child = spawn(standIn.command, standIn.args, {
        cwd: standIn.cwd ?? REPO_ROOT,
        env: baseEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } else if (shouldUseBundledEngine()) {
      const enginePath = getBundledEnginePath();
      if (!fs.existsSync(enginePath)) {
        // Reported here and not by `main.ts`: this start resolves, it does not reject.
        this.incidents.startFailed(
          "missing",
          "bundled engine not found",
          "the bundled engine is missing from the install",
          this.outputTail(),
        );
        return {
          connected: false,
          error: `Bundled engine not found: ${enginePath}`,
        };
      }
      this.child = spawn(enginePath, [], {
        cwd: path.dirname(enginePath),
        env: baseEnv,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } else {
      const python = resolveDevelopmentPython();
      this.child = spawn(python, ["-m", "cuepoint.engine"], {
        cwd: REPO_ROOT,
        env: {
          ...baseEnv,
          PYTHONPATH: path.join(REPO_ROOT, "src"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
    }

    this.spawnedAt = Date.now();
    this.drain(this.child, "stdout");
    this.drain(this.child, "stderr");

    const child = this.child;
    let exited = false;
    // Resolves when everything the child wrote has been read (its `close`).
    const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      exited = true;
      // `stop()` and a newer launch let go of a child before it exits: that exit is ours, not a
      // crash, and not an incident (REPORT-05). It must not touch the state of the child that
      // replaced it, nor start a restart.
      if (this.child !== child) return;
      this.child = null;
      this.healthy = false;
      if (this.stopping) return;
      // An exit during a restart is still one that was not asked for: it is one more exit in
      // the open incident, though the restart already running will do the restarting.
      this.incidents.exited({ code, signal, uptimeMs: Date.now() - this.spawnedAt });
      if (this.reconnecting) return;
      void this.scheduleRestart();
    });

    // A spawn that fails (no such binary) is an `error` event and no `exit`; unhandled, it would
    // be an uncaught exception in main. Its words go to the tail, where the scrubber reads them.
    child.on("error", (error: Error) => {
      this.noteLine("stderr", `[spawn] ${error.message}`);
      if (this.child !== child) return;
      this.child = null;
      this.healthy = false;
      this.incidents.startFailed(
        "spawn",
        "engine could not be started",
        "the engine process could not be spawned",
        this.outputTail(),
      );
    });

    const ok = await this.pollHealth(this.options.healthTimeoutMs, HEALTH_POLL_MS, child);
    if (this.stopRequested) return STOPPED;
    if (!ok) {
      // An engine that died: let its last words arrive before they are read into a report.
      if (exited) await Promise.race([closed, new Promise<void>((resolve) => setTimeout(resolve, 1000).unref?.())]);
      // A child that is still there did not answer in time. One that exited is already the
      // incident's story (its exit was recorded above), and `startFailed` leaves it be.
      if (!exited && this.child === child) {
        this.incidents.startFailed(
          "health",
          "engine did not answer its health check",
          "the engine started but did not answer /health in time",
          this.outputTail(),
        );
      }
      return {
        connected: false,
        error: "Engine health check failed or timed out",
      };
    }
    // It answers: if it came back from an exit, that is the incident's one event.
    this.incidents.recovered(this.outputTail());
    return this.getStatus();
  }

  /**
   * Bring a crashed engine back, up to `MAX_RESTART_ATTEMPTS` times (DEC-028).
   *
   * Each attempt waits longer than the last: an engine that dies instantly on
   * start would otherwise be respawned as fast as the machine allows.
   */
  private async scheduleRestart(): Promise<void> {
    const generation = this.generation;
    if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
      this.reconnecting = false;
      // Not silent any more: the incident's one event (REPORT-05).
      this.incidents.gaveUp(
        `the engine did not stay up after ${MAX_RESTART_ATTEMPTS} restarts`,
        this.outputTail(),
      );
      return;
    }
    const backoff = this.options.restartBackoffMs ?? RESTART_BACKOFF_MS;
    const delay = backoff[this.restartAttempts] ?? backoff.at(-1) ?? 4000;
    this.restartAttempts += 1;
    this.reconnecting = true;
    this.incidents.restarting(this.restartAttempts, delay);

    await new Promise<void>((resolve) => {
      this.wakeRestart = resolve;
      this.restartTimer = setTimeout(resolve, delay);
      // A pending restart must not keep the process alive; `stop()` and `restart()` also end it.
      this.restartTimer.unref?.();
    });
    this.restartTimer = null;
    this.wakeRestart = null;
    // `stop()` or the user's Restart ended the wait, and owns what happens next.
    if (this.stopRequested || generation !== this.generation) return;

    const status = await this.start();
    if (this.stopRequested || generation !== this.generation) return;
    this.reconnecting = false;
    if (status.connected) {
      // Healthy again: the next crash gets a full set of attempts of its own,
      // rather than inheriting the count from an unrelated failure.
      this.restartAttempts = 0;
    } else {
      // Tries again, or, with the attempts spent, gives up and says so.
      void this.scheduleRestart();
    }
  }

  /**
   * Start the engine again at the user's request, from the status strip.
   *
   * Resets the attempt counter: this is a deliberate act, not a continuation
   * of the automatic attempts that already gave up.
   */
  async restart(): Promise<EngineStatus> {
    // Ends a restart that is waiting, and makes one that is starting stand down when it finishes.
    this.generation += 1;
    this.endBackoff();
    this.restartAttempts = 0;
    this.reconnecting = false;
    return this.start();
  }

  /** Ends the wait of an automatic restart that is in its backoff, if there is one. */
  private endBackoff(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
    const wake = this.wakeRestart;
    this.wakeRestart = null;
    wake?.();
  }

  /**
   * Stop the engine, for good until the next `start()`: any restart waiting or starting stands down.
   *
   * An incident still open is dropped, unsent: see the comment in `processWatch.ts`.
   */
  async stop(): Promise<void> {
    this.stopRequested = true;
    this.generation += 1;
    this.endBackoff();
    this.reconnecting = false;
    this.incidents.abandon();
    await this.killChild();
  }

  /** Kill the child and wait for it (or two seconds). What `launch()` and `stop()` both need. */
  private async killChild(): Promise<void> {
    if (!this.child) return;
    const proc = this.child;
    this.child = null;
    // The tree, not the process: a packaged engine on Windows is a bootloader
    // whose child outlived it, holding the port and the database (CLEAN-14).
    stopProcessTree(proc);
    await new Promise<void>((resolve) => {
      proc.once("exit", () => resolve());
      setTimeout(() => {
        stopProcessTree(proc, { force: true });
        resolve();
      }, 2000);
    });
  }

  /** What an incident's attachment is made from. */
  private outputTail(): OutputTail {
    return this.recentOutput();
  }

  getStatus(): EngineStatus {
    if (!this.port || !this.child) {
      return {
        connected: false,
        error: this.reconnecting ? "Reconnecting" : "Engine not running",
        reconnecting: this.reconnecting,
        restartAttempts: this.restartAttempts,
      };
    }
    // A child that has not answered `/health` yet is not something to send a
    // request to, and saying so is the difference between a strip a person can
    // trust and one that was connected for ten seconds before anything worked.
    if (!this.healthy) {
      return {
        connected: false,
        starting: true,
        error: "Starting",
        reconnecting: this.reconnecting,
        restartAttempts: this.restartAttempts,
      };
    }
    return {
      connected: true,
      version: this.version,
      sessionId: this.sessionId,
      reconnecting: false,
      restartAttempts: this.restartAttempts,
    };
  }

  private client(): EngineClient {
    if (!this.port || !this.token) {
      throw new Error("Engine not running");
    }
    return new EngineClient(this.port, this.token, this.sessionId);
  }

  /**
   * A client, once any start in flight has finished.
   *
   * Waiting is bounded by the start itself — `HEALTH_TIMEOUT_MS`, or sooner
   * when the child exits — and a start that fails leaves `client()` to report
   * it, as it would have done without waiting.
   */
  private async readyClient(): Promise<EngineClient> {
    while (this.startup) {
      await this.startup.catch(() => undefined);
    }
    return this.client();
  }

  async searchLibrary(params: {
    q: string;
    limit?: number;
    offset?: number;
  }): Promise<LibrarySearchResponse> {
    return (await this.readyClient()).searchLibrary(params);
  }

  async browseLibrary(params: LibraryBrowseParams): Promise<LibrarySearchResponse> {
    return (await this.readyClient()).browseLibrary(params);
  }

  async getLibraryPlaylists(): Promise<LibraryPlaylistTree> {
    return (await this.readyClient()).getLibraryPlaylists();
  }

  async getLibraryFacet(params: {
    field: string;
    q?: string;
    playlistId?: number | null;
    filters?: FilterRuleSet | null;
    limit?: number;
    scope?: "collection" | "smart";
    collectionId?: number | null;
  }): Promise<LibraryFacet> {
    return (await this.readyClient()).getLibraryFacet(params);
  }

  async getLibraryQuickFacets(params: {
    q?: string;
    playlistId?: number | null;
    filters?: FilterRuleSet | null;
    scope?: "collection" | "smart";
    collectionId?: number | null;
  }): Promise<LibraryQuickFacets> {
    return (await this.readyClient()).getLibraryQuickFacets(params);
  }

  async getCompatibleKeys(params: { key: string }): Promise<CompatibleKeys> {
    return (await this.readyClient()).getCompatibleKeys(params);
  }

  async getKeysPopulation(params: { sources: KeySource[] }): Promise<KeysPopulation> {
    return (await this.readyClient()).getKeysPopulation(params);
  }

  async getLibraryFilterFields(): Promise<LibraryFilterVocabulary> {
    return (await this.readyClient()).getLibraryFilterFields();
  }

  async getLibraryTrack(params: { trackId: number }): Promise<LibraryTrackDetail> {
    return (await this.readyClient()).getLibraryTrack(params);
  }

  async getTrackArtwork(params: {
    trackId: number;
    size: ArtworkSize;
  }): Promise<Uint8Array | null> {
    return (await this.readyClient()).getTrackArtwork(params);
  }

  // CuePoint's own organization (ORG-08). One forward per client method:
  // `main.ts` calls this facade, and a method missing here is an
  // `undefined is not a function` in the packaged app that nothing
  // type-checks — which is why the contract test enumerates them.

  async getCollections(): Promise<CollectionTree> {
    return (await this.readyClient()).getCollections();
  }

  async getCollectionEntries(params: { collectionId: number; limit?: number; offset?: number }): Promise<CollectionEntryPage> {
    return (await this.readyClient()).getCollectionEntries(params);
  }

  async createCollection(params: { kind: "folder" | "collection"; name: string; parent_id?: number | null }): Promise<{ collection: CollectionNode }> {
    return (await this.readyClient()).createCollection(params);
  }

  async createCollectionFrom(params: { name: string; parent_id?: number | null; track_ids: number[] }): Promise<{ collection: CollectionNode }> {
    return (await this.readyClient()).createCollectionFrom(params);
  }

  async renameCollection(params: { id: number; name: string }): Promise<{ collection: CollectionNode }> {
    return (await this.readyClient()).renameCollection(params);
  }

  async moveCollection(params: { id: number; parent_id?: number | null; position?: number | null }): Promise<{ collection: CollectionNode }> {
    return (await this.readyClient()).moveCollection(params);
  }

  async deleteCollection(params: { id: number }): Promise<{ removed: CollectionSubtree }> {
    return (await this.readyClient()).deleteCollection(params);
  }

  async previewCollectionDelete(params: { id: number }): Promise<{ removes: CollectionSubtree }> {
    return (await this.readyClient()).previewCollectionDelete(params);
  }

  async addTracksToCollection(params: { collection_id: number; track_ids: number[] }): Promise<CollectionAdded> {
    return (await this.readyClient()).addTracksToCollection(params);
  }

  async insertTrackInCollection(
    params: Parameters<EngineClient["insertTrackInCollection"]>[0],
  ): Promise<{ entry: CollectionEntry }> {
    return (await this.readyClient()).insertTrackInCollection(params);
  }

  async removeCollectionEntries(params: { entry_ids: number[] }): Promise<{ removed: number }> {
    return (await this.readyClient()).removeCollectionEntries(params);
  }

  async reorderCollectionEntry(params: { entry_id: number; position: number }): Promise<{ entry: CollectionEntry }> {
    return (await this.readyClient()).reorderCollectionEntry(params);
  }

  async saveSmartCollection(params: { name: string; rules: FilterRuleSet; parent_id?: number | null; sort?: string | null; dir?: "asc" | "desc" | null }): Promise<{ collection: CollectionNode }> {
    return (await this.readyClient()).saveSmartCollection(params);
  }

  async updateSmartCollection(params: { id: number; rules: FilterRuleSet; sort?: string | null; dir?: "asc" | "desc" | null }): Promise<{ collection: CollectionNode }> {
    return (await this.readyClient()).updateSmartCollection(params);
  }

  async duplicateSmartCollection(params: { id: number; name?: string | null }): Promise<{ collection: CollectionNode }> {
    return (await this.readyClient()).duplicateSmartCollection(params);
  }

  async freezeSmartCollection(params: { id: number; name?: string | null }): Promise<FrozenCollection> {
    return (await this.readyClient()).freezeSmartCollection(params);
  }

  async getTags(): Promise<TagVocabulary> {
    return (await this.readyClient()).getTags();
  }

  async createTag(params: { name: string; category?: string | null; colour?: string | null }): Promise<{ tag: Tag }> {
    return (await this.readyClient()).createTag(params);
  }

  async updateTag(params: { id: number; name?: string; category?: string | null; colour?: string | null }): Promise<{ tag: Tag }> {
    return (await this.readyClient()).updateTag(params);
  }

  async deleteTag(params: { id: number }): Promise<{ untagged: number }> {
    return (await this.readyClient()).deleteTag(params);
  }

  async mergeTags(params: { source_id: number; target_id: number }): Promise<{ moved: number }> {
    return (await this.readyClient()).mergeTags(params);
  }

  async assignTag(params: { tag_id: number; track_ids: number[] }): Promise<{ changed: number; track_ids: number[] }> {
    return (await this.readyClient()).assignTag(params);
  }

  async unassignTag(params: { tag_id: number; track_ids: number[] }): Promise<{ changed: number; track_ids: number[] }> {
    return (await this.readyClient()).unassignTag(params);
  }

  async setTrackMetadata(params: { trackId: number; rating?: number | null; favorite?: boolean; notes?: string | null }): Promise<{ metadata: TrackMetadata }> {
    return (await this.readyClient()).setTrackMetadata(params);
  }

  async getTrackHistory(params: { trackId: number; limit?: number }): Promise<TrackHistory> {
    return (await this.readyClient()).getTrackHistory(params);
  }

  async applyBatch(params: { selection: BatchSelection; operation: BatchOperation }): Promise<BatchOutcome> {
    return (await this.readyClient()).applyBatch(params);
  }

  // Clean (CLEAN-11). One forward per client method, for ORG-08's reason: a
  // method missing here is a runtime failure nothing type-checks.

  async startCleanMatch(params: Parameters<EngineClient["startCleanMatch"]>[0]): Promise<MatchStarted> {
    return (await this.readyClient()).startCleanMatch(params);
  }

  async resumeCleanMatch(params: { job_id: string }): Promise<MatchStarted> {
    return (await this.readyClient()).resumeCleanMatch(params);
  }

  async getResumableMatches(): Promise<ResumableMatches> {
    return (await this.readyClient()).getResumableMatches();
  }

  async getTrackMatches(params: { trackId: number }): Promise<TrackMatches> {
    return (await this.readyClient()).getTrackMatches(params);
  }

  async getMatchCandidates(params: { attemptId: number }): Promise<AttemptCandidates> {
    return (await this.readyClient()).getMatchCandidates(params);
  }

  async getTrackFolder(params: { trackId: number }): Promise<TrackFolder> {
    return (await this.readyClient()).getTrackFolder(params);
  }

  async decideMatch(params: Parameters<EngineClient["decideMatch"]>[0]): Promise<DecisionOutcome> {
    return (await this.readyClient()).decideMatch(params);
  }

  async applyMatch(params: Parameters<EngineClient["applyMatch"]>[0]): Promise<ApplyOutcome> {
    return (await this.readyClient()).applyMatch(params);
  }

  async setTrackOverrides(
    params: Parameters<EngineClient["setTrackOverrides"]>[0],
  ): Promise<{ track: LibraryTrackRow }> {
    return (await this.readyClient()).setTrackOverrides(params);
  }

  async revertChange(params: { change_id: number }): Promise<{ revert: FieldRevert }> {
    return (await this.readyClient()).revertChange(params);
  }

  async revertBatch(params: { batch_id: string }): Promise<BatchRevertOutcome> {
    return (await this.readyClient()).revertBatch(params);
  }

  async startFileCheck(params: { selection: BatchSelection }): Promise<FileCheckStarted> {
    return (await this.readyClient()).startFileCheck(params);
  }

  async startDuplicateScan(
    params?: Parameters<EngineClient["startDuplicateScan"]>[0],
  ): Promise<DuplicateScanStarted> {
    return (await this.readyClient()).startDuplicateScan(params);
  }

  async getDuplicateGroups(
    params?: Parameters<EngineClient["getDuplicateGroups"]>[0],
  ): Promise<DuplicateGroupList> {
    return (await this.readyClient()).getDuplicateGroups(params);
  }

  async dismissDuplicateGroup(params: { group_id: number }): Promise<{ group: DuplicateGroup }> {
    return (await this.readyClient()).dismissDuplicateGroup(params);
  }

  async restoreDuplicateGroup(params: { group_id: number }): Promise<{ group: DuplicateGroup }> {
    return (await this.readyClient()).restoreDuplicateGroup(params);
  }

  async startArtworkScan(
    params: Parameters<EngineClient["startArtworkScan"]>[0],
  ): Promise<ArtworkScanStarted> {
    return (await this.readyClient()).startArtworkScan(params);
  }

  async previewTagWrite(
    params: Parameters<EngineClient["previewTagWrite"]>[0],
  ): Promise<TagPreviewOutcome> {
    return (await this.readyClient()).previewTagWrite(params);
  }

  async startTagWrite(params: { preview_id: string }): Promise<TagWriteStarted> {
    return (await this.readyClient()).startTagWrite(params);
  }

  async startTagRestore(
    params: Parameters<EngineClient["startTagRestore"]>[0],
  ): Promise<TagRestoreStarted> {
    return (await this.readyClient()).startTagRestore(params);
  }

  async getTagWrites(params: Parameters<EngineClient["getTagWrites"]>[0]): Promise<TagWriteRecord> {
    return (await this.readyClient()).getTagWrites(params);
  }

  async getLibraryHealth(): Promise<LibraryHealth> {
    return (await this.readyClient()).getLibraryHealth();
  }

  async getStatisticsPlays(
    params?: Parameters<EngineClient["getStatisticsPlays"]>[0],
  ): Promise<StatisticsPlays> {
    return (await this.readyClient()).getStatisticsPlays(params);
  }

  async getStatisticsSpreads(
    params?: Parameters<EngineClient["getStatisticsSpreads"]>[0],
  ): Promise<StatisticsSpreads> {
    return (await this.readyClient()).getStatisticsSpreads(params);
  }

  async getStatisticsHealth(
    params?: Parameters<EngineClient["getStatisticsHealth"]>[0],
  ): Promise<StatisticsHealth> {
    return (await this.readyClient()).getStatisticsHealth(params);
  }

  async exportReviewList(
    params: Parameters<EngineClient["exportReviewList"]>[0],
  ): Promise<ReviewExportResult> {
    return (await this.readyClient()).exportReviewList(params);
  }

  async previewRekordboxExport(
    params: Parameters<EngineClient["previewRekordboxExport"]>[0],
  ): Promise<RekordboxExportPreviewAnswer> {
    return (await this.readyClient()).previewRekordboxExport(params);
  }

  async startRekordboxExport(
    params: Parameters<EngineClient["startRekordboxExport"]>[0],
  ): Promise<RekordboxExportStartAnswer> {
    return (await this.readyClient()).startRekordboxExport(params);
  }

  async getRekordboxExportHistory(
    params?: Parameters<EngineClient["getRekordboxExportHistory"]>[0],
  ): Promise<RekordboxExportHistory> {
    return (await this.readyClient()).getRekordboxExportHistory(params);
  }

  // Discover (DISCOVER-09): forwarded one by one, as every method is.
  async getDiscoverOptions(): Promise<DiscoverAnswer<DiscoverOptions>> {
    return (await this.readyClient()).getDiscoverOptions();
  }

  async listDiscoveryRuns(
    params?: Parameters<EngineClient["listDiscoveryRuns"]>[0],
  ): Promise<DiscoverAnswer<DiscoverRunList>> {
    return (await this.readyClient()).listDiscoveryRuns(params);
  }

  async getDiscoveryRun(
    params: Parameters<EngineClient["getDiscoveryRun"]>[0],
  ): Promise<DiscoverAnswer<DiscoverRunHeader>> {
    return (await this.readyClient()).getDiscoveryRun(params);
  }

  async getDiscoveryRunTracks(
    params: Parameters<EngineClient["getDiscoveryRunTracks"]>[0],
  ): Promise<DiscoverAnswer<DiscoverRunTracksPage>> {
    return (await this.readyClient()).getDiscoveryRunTracks(params);
  }

  async startDiscoveryRun(
    params?: Parameters<EngineClient["startDiscoveryRun"]>[0],
  ): Promise<DiscoverAnswer<DiscoverJobStarted>> {
    return (await this.readyClient()).startDiscoveryRun(params);
  }

  async deleteDiscoveryRun(
    params: Parameters<EngineClient["deleteDiscoveryRun"]>[0],
  ): Promise<DiscoverAnswer<DiscoverRunDeleted>> {
    return (await this.readyClient()).deleteDiscoveryRun(params);
  }

  async getWantlist(
    params?: Parameters<EngineClient["getWantlist"]>[0],
  ): Promise<DiscoverAnswer<WantlistPage>> {
    return (await this.readyClient()).getWantlist(params);
  }

  async addToWantlist(
    params: Parameters<EngineClient["addToWantlist"]>[0],
  ): Promise<DiscoverAnswer<WantlistChange>> {
    return (await this.readyClient()).addToWantlist(params);
  }

  async removeFromWantlist(
    params: Parameters<EngineClient["removeFromWantlist"]>[0],
  ): Promise<DiscoverAnswer<WantlistChange>> {
    return (await this.readyClient()).removeFromWantlist(params);
  }

  async setWantlistNote(
    params: Parameters<EngineClient["setWantlistNote"]>[0],
  ): Promise<DiscoverAnswer<WantlistChange>> {
    return (await this.readyClient()).setWantlistNote(params);
  }

  async setWantlistBought(
    params: Parameters<EngineClient["setWantlistBought"]>[0],
  ): Promise<DiscoverAnswer<WantlistChange>> {
    return (await this.readyClient()).setWantlistBought(params);
  }

  async startBeatportPlaylistPush(
    params: Parameters<EngineClient["startBeatportPlaylistPush"]>[0],
  ): Promise<DiscoverAnswer<DiscoverJobStarted>> {
    return (await this.readyClient()).startBeatportPlaylistPush(params);
  }

  async startBeatportResolve(): Promise<DiscoverAnswer<DiscoverJobStarted>> {
    return (await this.readyClient()).startBeatportResolve();
  }

  async getEntityPage(
    params: Parameters<EngineClient["getEntityPage"]>[0],
  ): Promise<DiscoverAnswer<EntityPage>> {
    return (await this.readyClient()).getEntityPage(params);
  }

  async getEntityBeatport(
    params: Parameters<EngineClient["getEntityBeatport"]>[0],
  ): Promise<DiscoverAnswer<EntityBeatportHalf>> {
    return (await this.readyClient()).getEntityBeatport(params);
  }

  async getSimilarTracks(
    params: Parameters<EngineClient["getSimilarTracks"]>[0],
  ): Promise<DiscoverAnswer<SimilarTracks>> {
    return (await this.readyClient()).getSimilarTracks(params);
  }

  // A Set (PREP-08): forwarded one by one, as every method is.
  async getSetPlan(
    params: Parameters<EngineClient["getSetPlan"]>[0],
  ): Promise<SetAnswer<SetPlan>> {
    return (await this.readyClient()).getSetPlan(params);
  }

  async getSetEntries(
    params: Parameters<EngineClient["getSetEntries"]>[0],
  ): Promise<SetAnswer<SetEntries>> {
    return (await this.readyClient()).getSetEntries(params);
  }

  async getSetAnalysis(
    params: Parameters<EngineClient["getSetAnalysis"]>[0],
  ): Promise<SetAnswer<SetAnalysis>> {
    return (await this.readyClient()).getSetAnalysis(params);
  }

  async getSetSuggestions(
    params: Parameters<EngineClient["getSetSuggestions"]>[0],
  ): Promise<SetAnswer<SetSuggestions>> {
    return (await this.readyClient()).getSetSuggestions(params);
  }

  async getSetListText(
    params: Parameters<EngineClient["getSetListText"]>[0],
  ): Promise<SetAnswer<SetListText>> {
    return (await this.readyClient()).getSetListText(params);
  }

  async createSet(
    params: Parameters<EngineClient["createSet"]>[0],
  ): Promise<SetAnswer<SetCreated>> {
    return (await this.readyClient()).createSet(params);
  }

  async createSetFrom(
    params: Parameters<EngineClient["createSetFrom"]>[0],
  ): Promise<SetAnswer<SetCreatedFrom>> {
    return (await this.readyClient()).createSetFrom(params);
  }

  async duplicateSet(
    params: Parameters<EngineClient["duplicateSet"]>[0],
  ): Promise<SetAnswer<SetCreated>> {
    return (await this.readyClient()).duplicateSet(params);
  }

  async setSetNotes(
    params: Parameters<EngineClient["setSetNotes"]>[0],
  ): Promise<SetAnswer<SetNotesChanged>> {
    return (await this.readyClient()).setSetNotes(params);
  }

  async createSetChapter(
    params: Parameters<EngineClient["createSetChapter"]>[0],
  ): Promise<SetAnswer<SetChapterChanged>> {
    return (await this.readyClient()).createSetChapter(params);
  }

  async updateSetChapter(
    params: Parameters<EngineClient["updateSetChapter"]>[0],
  ): Promise<SetAnswer<SetChapterChanged>> {
    return (await this.readyClient()).updateSetChapter(params);
  }

  async moveSetChapter(
    params: Parameters<EngineClient["moveSetChapter"]>[0],
  ): Promise<SetAnswer<SetChapterChanged>> {
    return (await this.readyClient()).moveSetChapter(params);
  }

  async deleteSetChapter(
    params: Parameters<EngineClient["deleteSetChapter"]>[0],
  ): Promise<SetAnswer<SetChapterDeleted>> {
    return (await this.readyClient()).deleteSetChapter(params);
  }

  async splitSetChapter(
    params: Parameters<EngineClient["splitSetChapter"]>[0],
  ): Promise<SetAnswer<SetChapterChanged>> {
    return (await this.readyClient()).splitSetChapter(params);
  }

  async moveSetEntry(
    params: Parameters<EngineClient["moveSetEntry"]>[0],
  ): Promise<SetAnswer<SetEntryMoved>> {
    return (await this.readyClient()).moveSetEntry(params);
  }

  async setSetEntryTimes(
    params: Parameters<EngineClient["setSetEntryTimes"]>[0],
  ): Promise<SetAnswer<SetEntryPlanChanged>> {
    return (await this.readyClient()).setSetEntryTimes(params);
  }

  async setSetEntryNote(
    params: Parameters<EngineClient["setSetEntryNote"]>[0],
  ): Promise<SetAnswer<SetEntryPlanChanged>> {
    return (await this.readyClient()).setSetEntryNote(params);
  }

  async acknowledgeSetWarning(
    params: Parameters<EngineClient["acknowledgeSetWarning"]>[0],
  ): Promise<SetAnswer<SetAcknowledged>> {
    return (await this.readyClient()).acknowledgeSetWarning(params);
  }

  async unacknowledgeSetWarning(
    params: Parameters<EngineClient["unacknowledgeSetWarning"]>[0],
  ): Promise<SetAnswer<SetUnacknowledged>> {
    return (await this.readyClient()).unacknowledgeSetWarning(params);
  }

  async saveSetList(
    params: Parameters<EngineClient["saveSetList"]>[0],
  ): Promise<SetAnswer<SetListSave>> {
    return (await this.readyClient()).saveSetList(params);
  }

  // The waveform analysis (WAVE-03).
  async getWaveformAnalysis(): Promise<WaveformAnswer<WaveformAnalysisStatus>> {
    return (await this.readyClient()).getWaveformAnalysis();
  }

  async pauseWaveformAnalysis(): Promise<WaveformAnswer<WaveformAnalysisStatus>> {
    return (await this.readyClient()).pauseWaveformAnalysis();
  }

  async resumeWaveformAnalysis(): Promise<WaveformAnswer<WaveformAnalysisStatus>> {
    return (await this.readyClient()).resumeWaveformAnalysis();
  }

  // The waveforms themselves, requests and "Delete waveform data" (WAVE-05).
  async getWaveforms(
    params: Parameters<EngineClient["getWaveforms"]>[0],
  ): Promise<WaveformAnswer<WaveformBatch>> {
    return (await this.readyClient()).getWaveforms(params);
  }

  async requestWaveforms(
    params: Parameters<EngineClient["requestWaveforms"]>[0],
  ): Promise<WaveformAnswer<WaveformsRequested>> {
    return (await this.readyClient()).requestWaveforms(params);
  }

  async deleteWaveformData(): Promise<WaveformAnswer<WaveformDataDeletion>> {
    return (await this.readyClient()).deleteWaveformData();
  }

  async startLibraryImport(params: {
    xml_path: string;
  }): Promise<LibraryImportStarted> {
    return (await this.readyClient()).startLibraryImport(params);
  }

  async startLibraryRefreshPreview(params?: {
    xml_path?: string;
    force?: boolean;
  }): Promise<LibraryRefreshStarted> {
    return (await this.readyClient()).startLibraryRefreshPreview(params);
  }

  async startLibraryRefreshApply(params: {
    diff_id: string;
    confirm_references?: boolean;
  }): Promise<LibraryRefreshStarted> {
    return (await this.readyClient()).startLibraryRefreshApply(params);
  }

  async getLibrarySummary(): Promise<LibrarySummary> {
    return (await this.readyClient()).getLibrarySummary();
  }

  async getRecentActivity(params?: {
    limit?: number;
    type?: string;
  }): Promise<ActivityFeed> {
    return (await this.readyClient()).getRecentActivity(params);
  }

  async listJobs(params?: {
    state?: "active" | "all";
    limit?: number;
  }): Promise<EngineJobList> {
    return (await this.readyClient()).listJobs(params);
  }

  async getJob(jobId: string): Promise<Record<string, unknown>> {
    return (await this.readyClient()).getJob(jobId);
  }

  async getJobResults(jobId: string): Promise<{
    id: string;
    state: string;
    /** What the job produced, for a job that produces something. */
    result?: Record<string, unknown>;
  }> {
    return (await this.readyClient()).getJobResults(jobId);
  }

  async cancelJob(jobId: string): Promise<{ id: string; state: string }> {
    return (await this.readyClient()).cancelJob(jobId);
  }

  async getBeatportTokenStatus(): Promise<{ configured: boolean; masked: string | null }> {
    return (await this.readyClient()).getBeatportTokenStatus();
  }

  async setBeatportToken(token: string): Promise<{ configured: boolean; masked: string | null }> {
    return (await this.readyClient()).setBeatportToken(token);
  }

  async testBeatportToken(body?: {
    token?: string;
  }): Promise<{ ok: boolean; message: string; reason?: "missing" | "rejected" | "unreachable" }> {
    return (await this.readyClient()).testBeatportToken(body);
  }

  async exportSupportBundle(body: {
    output_dir: string;
    include_logs?: boolean;
    include_config?: boolean;
    sanitize?: boolean;
  }) {
    return (await this.readyClient()).exportSupportBundle(body);
  }

  async getLogsDir(): Promise<{ logs_dir: string }> {
    return (await this.readyClient()).getLogsDir();
  }

  async getCuepointLog(body?: {
    level?: string;
    search?: string;
    tailLines?: number;
    maxBytes?: number;
    sanitize?: boolean;
  }) {
    return (await this.readyClient()).getCuepointLog(body);
  }

  async clearCuepointLogs(): Promise<{ ok: boolean }> {
    return (await this.readyClient()).clearCuepointLogs();
  }

  async setErrorReporting(enabled: boolean): Promise<{ enabled: boolean }> {
    return (await this.readyClient()).setErrorReporting(enabled);
  }

  async clearCuepointCache(): Promise<{ ok: boolean }> {
    return (await this.readyClient()).clearCuepointCache();
  }

  subscribeJobEvents(jobId: string, senderId: number, sender: WebContents): () => void {
    const key = `${senderId}:${jobId}`;

    // Join the stream if one is already open for this job. Events are
    // broadcast to the renderer, which fans them out to every listener, so a
    // second stream would only duplicate frames — and opening one used to
    // cancel the first.
    const open = this.jobStreams.get(key);
    if (open) {
      open.refs += 1;
      return () => this.unsubscribeJobEvents(jobId, senderId);
    }

    const abort = new AbortController();
    this.jobStreams.set(key, { abort, refs: 1 });

    void this.readyClient()
      .then((client) => client.streamJobEvents(jobId, abort.signal, (event) => {
        if (!sender.isDestroyed()) {
          sender.send("engine:jobEvent", { jobId, event });
        }
      }))
      .then(() => {
        if (!sender.isDestroyed()) {
          sender.send("engine:jobEventEnd", { jobId });
        }
      })
      .catch(() => {
        if (!sender.isDestroyed()) {
          sender.send("engine:jobEventEnd", { jobId });
        }
      })
      .finally(() => {
        // The job reached a terminal state, so the stream is over for everyone
        // watching it however many of them there were.
        this.jobStreams.delete(key);
      });

    return () => this.unsubscribeJobEvents(jobId, senderId);
  }

  unsubscribeJobEvents(jobId: string, senderId: number): void {
    const key = `${senderId}:${jobId}`;
    const entry = this.jobStreams.get(key);
    if (!entry) return;
    entry.refs -= 1;
    // Only the last watcher leaving closes the stream. One watcher going away
    // must not blind the others.
    if (entry.refs > 0) return;
    entry.abort.abort();
    this.jobStreams.delete(key);
  }

  private pickPort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          server.close();
          reject(new Error("Failed to allocate port"));
          return;
        }
        const port = address.port;
        server.close((err) => {
          if (err) reject(err);
          else resolve(port);
        });
      });
    });
  }

  /**
   * Ask `/health` until it answers or the budget runs out.
   *
   * Bounded by elapsed time rather than by a count of attempts, so the budget
   * says what it means and stays right if the poll interval changes. It also
   * stops early when the child has gone: an engine that exited is not going to
   * answer, and waiting out the whole budget for it would delay the restart
   * that should follow.
   */
  private async pollHealth(
    timeoutMs = HEALTH_TIMEOUT_MS,
    delayMs = HEALTH_POLL_MS,
    child: ChildProcess | null = this.child,
  ): Promise<boolean> {
    if (!this.port) return false;
    const url = `http://127.0.0.1:${this.port}/health`;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      // Also when a restart has replaced the child this launch spawned: this poll would be asking
      // the old port for the whole budget, and its caller would never be told it had failed.
      if (!this.child || this.child !== child) return false;
      try {
        const res = await fetch(url);
        if (res.ok) {
          const body = (await res.json()) as { version?: string };
          this.version = body.version;
          this.healthy = true;
          return true;
        }
      } catch {
        /* retry */
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return false;
  }
}

/**
 * The runtime preload, beside the bundle that asks for it.
 *
 * `electron/preload.cjs` ships next to `electron-dist/` in both layouts —
 * the source tree and `app.asar` (package.json's `build.files`) — so it is
 * found from the bundle's own folder. It used to be found from the repository
 * root, three folders up, which inside a packaged app is the install folder:
 * the path named nothing, the window got no `window.cuepoint`, and a packaged
 * build never reached its engine (found in CLEAN-14).
 */
export function resolvePreloadPath(bundleDir: string = __dirname): string {
  return path.join(bundleDir, "..", "electron", "preload.cjs");
}
