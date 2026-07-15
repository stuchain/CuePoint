import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WebContents } from "electron";
import { EngineClient } from "./engineClient";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Repo root: works from source (`electron/`) and bundle (`electron-dist/`). */
const REPO_ROOT = path.resolve(__dirname, "../../..");

export interface EngineStatus {
  connected: boolean;
  version?: string;
  error?: string;
}

export class EngineSupervisor {
  private child: ChildProcess | null = null;
  private port: number | null = null;
  private token: string | null = null;
  private version: string | undefined;
  private jobStreamAborts = new Map<string, AbortController>();

  getRepoRoot(): string {
    return REPO_ROOT;
  }

  async start(): Promise<EngineStatus> {
    await this.stop();
    this.port = await this.pickPort();
    this.token = crypto.randomBytes(24).toString("hex");

    const python = process.env.CUEPOINT_PYTHON ?? "python";
    const env = {
      ...process.env,
      CUEPOINT_HOST: "127.0.0.1",
      CUEPOINT_PORT: String(this.port),
      CUEPOINT_TOKEN: this.token,
      PYTHONPATH: path.join(REPO_ROOT, "src"),
    };

    this.child = spawn(python, ["-m", "cuepoint.engine"], {
      cwd: REPO_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.child.on("exit", () => {
      this.child = null;
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
      return { connected: false, error: "Engine not running" };
    }
    return {
      connected: true,
      version: this.version,
    };
  }

  private client(): EngineClient {
    if (!this.port || !this.token) {
      throw new Error("Engine not running");
    }
    return new EngineClient(this.port, this.token);
  }

  async startMatchJob(body: {
    demo?: boolean;
    xml_path?: string;
    playlist_name?: string;
  }): Promise<{ id: string; state: string }> {
    return this.client().startMatchJob(body);
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

  subscribeJobEvents(jobId: string, senderId: number, sender: WebContents): () => void {
    const key = `${senderId}:${jobId}`;
    this.unsubscribeJobEvents(jobId, senderId);

    const abort = new AbortController();
    this.jobStreamAborts.set(key, abort);

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
        this.jobStreamAborts.delete(key);
      });

    return () => this.unsubscribeJobEvents(jobId, senderId);
  }

  unsubscribeJobEvents(jobId: string, senderId: number): void {
    const key = `${senderId}:${jobId}`;
    const abort = this.jobStreamAborts.get(key);
    if (!abort) return;
    abort.abort();
    this.jobStreamAborts.delete(key);
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
