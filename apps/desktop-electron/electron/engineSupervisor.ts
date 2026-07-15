import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
