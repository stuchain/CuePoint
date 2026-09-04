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
  type LibraryImportStarted,
  type LibraryRefreshStarted,
  type LibrarySearchResponse,
  type LibrarySummary,
} from "./engineClient";
import { getBundledEnginePath, shouldUseBundledEngine } from "./engineLaunch";

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
}

/**
 * How hard CuePoint tries to bring a dead engine back (DEC-028).
 *
 * Bounded on purpose. Unlimited restarts would hide a crash-looping engine
 * behind a flickering status; three attempts recover the transient case and
 * then stop and say so, leaving the user a Restart engine control.
 */
export const MAX_RESTART_ATTEMPTS = 3;
export const RESTART_BACKOFF_MS = [1000, 2000, 4000];

export class EngineSupervisor {
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
  /** Set while `stop()` is deliberate, so quitting is not treated as a crash. */
  private stopping = false;
  private restartTimer: NodeJS.Timeout | null = null;

  getRepoRoot(): string {
    return REPO_ROOT;
  }

  async start(): Promise<EngineStatus> {
    // `stop()` kills the current child; that exit is ours, not a crash.
    this.stopping = true;
    await this.stop();
    this.stopping = false;
    this.port = await this.pickPort();
    this.token = crypto.randomBytes(24).toString("hex");

    const baseEnv = {
      ...process.env,
      CUEPOINT_HOST: "127.0.0.1",
      CUEPOINT_PORT: String(this.port),
      CUEPOINT_TOKEN: this.token,
      CUEPOINT_SESSION_ID: this.sessionId,
      CUEPOINT_HEADLESS: "1",
    };

    if (shouldUseBundledEngine()) {
      const enginePath = getBundledEnginePath();
      if (!fs.existsSync(enginePath)) {
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

    this.child.on("exit", () => {
      this.child = null;
      // A deliberate stop is not a crash, and neither is an exit during a
      // restart we are already running.
      if (this.stopping || this.reconnecting) return;
      void this.scheduleRestart();
    });

    const ok = await this.pollHealth();
    if (!ok) {
      return {
        connected: false,
        error: "Engine health check failed or timed out",
      };
    }
    return this.getStatus();
  }

  /**
   * Bring a crashed engine back, up to `MAX_RESTART_ATTEMPTS` times (DEC-028).
   *
   * Each attempt waits longer than the last: an engine that dies instantly on
   * start would otherwise be respawned as fast as the machine allows.
   */
  private async scheduleRestart(): Promise<void> {
    if (this.restartAttempts >= MAX_RESTART_ATTEMPTS) {
      this.reconnecting = false;
      return;
    }
    const delay = RESTART_BACKOFF_MS[this.restartAttempts] ?? 4000;
    this.restartAttempts += 1;
    this.reconnecting = true;

    await new Promise<void>((resolve) => {
      this.restartTimer = setTimeout(resolve, delay);
    });
    this.restartTimer = null;
    if (this.stopping) {
      this.reconnecting = false;
      return;
    }

    const status = await this.start();
    this.reconnecting = false;
    if (status.connected) {
      // Healthy again: the next crash gets a full set of attempts of its own,
      // rather than inheriting the count from an unrelated failure.
      this.restartAttempts = 0;
    } else if (this.restartAttempts < MAX_RESTART_ATTEMPTS) {
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
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.restartAttempts = 0;
    this.reconnecting = false;
    return this.start();
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    const proc = this.child;
    this.child = null;
    proc.kill();
    await new Promise<void>((resolve) => {
      proc.once("exit", () => resolve());
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          /* ignore */
        }
        resolve();
      }, 2000);
    });
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

  async startMatchJob(body: {
    demo?: boolean;
    xml_path?: string;
    playlist_name?: string;
  }): Promise<{ id: string; state: string }> {
    return this.client().startMatchJob(body);
  }

  async searchLibrary(params: {
    q: string;
    limit?: number;
    offset?: number;
  }): Promise<LibrarySearchResponse> {
    return this.client().searchLibrary(params);
  }

  async startLibraryImport(params: {
    xml_path: string;
  }): Promise<LibraryImportStarted> {
    return this.client().startLibraryImport(params);
  }

  async startLibraryRefreshPreview(params?: {
    xml_path?: string;
    force?: boolean;
  }): Promise<LibraryRefreshStarted> {
    return this.client().startLibraryRefreshPreview(params);
  }

  async startLibraryRefreshApply(params: {
    diff_id: string;
    confirm_references?: boolean;
  }): Promise<LibraryRefreshStarted> {
    return this.client().startLibraryRefreshApply(params);
  }

  async getLibrarySummary(): Promise<LibrarySummary> {
    return this.client().getLibrarySummary();
  }

  async getRecentActivity(params?: {
    limit?: number;
    type?: string;
  }): Promise<ActivityFeed> {
    return this.client().getRecentActivity(params);
  }

  async listJobs(params?: {
    state?: "active" | "all";
    limit?: number;
  }): Promise<EngineJobList> {
    return this.client().listJobs(params);
  }

  async getJob(jobId: string): Promise<Record<string, unknown>> {
    return this.client().getJob(jobId);
  }

  async getJobResults(jobId: string): Promise<{
    id: string;
    state: string;
    results: Record<string, unknown>[];
  }> {
    return this.client().getJobResults(jobId);
  }

  async exportResults(body: {
    format: "csv" | "json" | "excel" | "xlsx";
    file_path: string;
    job_id?: string;
    results?: Record<string, unknown>[];
    playlist_name?: string;
    overwrite?: boolean;
  }): Promise<{ file_path: string; format: string; count: number }> {
    return this.client().exportResults(body);
  }

  async getIncrateInventory(params?: {
    limit?: number;
    search?: string;
    demo?: boolean;
  }): Promise<Record<string, unknown>> {
    return this.client().getIncrateInventory(params);
  }

  async importIncrateXml(body: {
    xml_path: string;
    enrich?: boolean;
  }): Promise<Record<string, unknown>> {
    return this.client().importIncrateXml(body);
  }

  async resetIncrateInventory() {
    return this.client().resetIncrateInventory();
  }

  async getIncrateDiscoverOptions(): Promise<Record<string, unknown>> {
    return this.client().getIncrateDiscoverOptions();
  }

  async runIncrateDiscover(body: {
    demo?: boolean;
    genre_ids?: number[];
    charts_from?: string;
    charts_to?: string;
    new_releases_days?: number;
    artist_names?: string[];
    label_names?: string[];
  }): Promise<{ tracks: Record<string, unknown>[]; count: number; demo?: boolean }> {
    return this.client().runIncrateDiscover(body);
  }

  async createIncratePlaylist(body: {
    name: string;
    tracks: Record<string, unknown>[];
  }): Promise<Record<string, unknown>> {
    return this.client().createIncratePlaylist(body);
  }

  async cancelMatchJob(jobId: string): Promise<{ id: string; state: string }> {
    return this.client().cancelMatchJob(jobId);
  }

  async getBeatportTokenStatus(): Promise<{ configured: boolean; masked: string | null }> {
    return this.client().getBeatportTokenStatus();
  }

  async setBeatportToken(token: string): Promise<{ configured: boolean; masked: string | null }> {
    return this.client().setBeatportToken(token);
  }

  async testBeatportToken(body?: {
    token?: string;
  }): Promise<{ ok: boolean; message: string }> {
    return this.client().testBeatportToken(body);
  }

  async getHistoryRecent(params?: { limit?: number }) {
    return this.client().getHistoryRecent(params);
  }

  async loadHistoryCsv(csvPath: string) {
    return this.client().loadHistoryCsv(csvPath);
  }

  async getXmlPlaylists(xmlPath: string) {
    return this.client().getXmlPlaylists(xmlPath);
  }

  async syncTags(body: Record<string, unknown>) {
    return this.client().syncTags(body);
  }

  async exportSupportBundle(body: {
    output_dir: string;
    include_logs?: boolean;
    include_config?: boolean;
    sanitize?: boolean;
  }) {
    return this.client().exportSupportBundle(body);
  }

  async getLogsDir(): Promise<{ logs_dir: string }> {
    return this.client().getLogsDir();
  }

  async getCuepointLog(body?: {
    level?: string;
    search?: string;
    tailLines?: number;
    maxBytes?: number;
    sanitize?: boolean;
  }) {
    return this.client().getCuepointLog(body);
  }

  async clearCuepointLogs(): Promise<{ ok: boolean }> {
    return this.client().clearCuepointLogs();
  }

  async clearCuepointCache(): Promise<{ ok: boolean }> {
    return this.client().clearCuepointCache();
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

    void this.client()
      .streamJobEvents(jobId, abort.signal, (event) => {
        if (!sender.isDestroyed()) {
          sender.send("engine:jobEvent", { jobId, event });
        }
      })
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

  private async pollHealth(maxAttempts = 20, delayMs = 250): Promise<boolean> {
    if (!this.port) return false;
    const url = `http://127.0.0.1:${this.port}/health`;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const body = (await res.json()) as { version?: string };
          this.version = body.version;
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

export function resolvePreloadPath(): string {
  return path.join(REPO_ROOT, "apps", "desktop-electron", "electron", "preload.cjs");
}
