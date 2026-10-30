/**
 * What main writes when a call it forwards to the engine cannot reach it, in an end-to-end run only
 * (test hooks on, `CUEPOINT_E2E`).
 *
 * Windows CI runs fail now and then with `fetch failed` while the engine is alive and idle in its
 * accept loop. Only a few specs wrap their calls in `e2e/support/engineEvidence.ts`, and a
 * Playwright attachment does not reach the uploaded `test-results/`. Main sees every such failure,
 * and the one thing no spec can: the error's own cause (refused, reset, timed out). So the first
 * few in a process are written as files into `CUEPOINT_E2E_EVIDENCE_DIR` (the run's
 * `test-results/engine-evidence/`, set by `playwright.config.ts`) and printed.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

import type { EngineDiagnostics } from "./engineSupervisor";

/** How many reports one app process writes, at most. */
export const MAX_REPORTS = 3;

/** A failure that says the engine could not be reached, as opposed to one it answered. */
export function isUnreachable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /fetch failed|ECONNREFUSED|ECONNRESET|socket hang up|other side closed/i.test(error.message);
}

/** The error and its causes, one per line: undici puts the socket's code on `cause`. */
export function describeError(error: unknown): string[] {
  const out: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    if (current instanceof Error) {
      const code = (current as NodeJS.ErrnoException).code;
      out.push(`${depth === 0 ? "error" : "cause"}: ${current.name}: ${current.message}${code ? ` [${code}]` : ""}`);
      current = (current as { cause?: unknown }).cause;
    } else {
      out.push(`cause: ${String(current)}`);
      break;
    }
  }
  return out;
}

function probePort(port: number, timeoutMs = 1000): Promise<string> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = (answer: string): void => {
      socket.destroy();
      resolve(answer);
    };
    socket.setTimeout(timeoutMs, () => done("timed out"));
    socket.once("connect", () => done("accepted"));
    socket.once("error", (error: NodeJS.ErrnoException) => done(error.code ?? error.message));
  });
}

function netstat(port: number): Promise<string[]> {
  if (process.platform !== "win32") return Promise.resolve([]);
  return new Promise((resolve) => {
    execFile("netstat", ["-ano", "-p", "TCP"], { timeout: 10_000, windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve([`netstat failed: ${error.message.split("\n")[0]}`]);
        return;
      }
      const lines = stdout.split(/\r?\n/).filter((line) => line.includes(`:${port} `));
      resolve(lines.length > 0 ? lines.map((line) => line.trim()) : ["(nothing)"]);
    });
  });
}

/** The engine's own thread dump, asked through a file under its home (`watch_stack_dump_requests`). */
async function engineStacks(home: string | undefined, waitMs = 4000): Promise<string[]> {
  if (!home) return ["no CUEPOINT_HOME"];
  const request = path.join(home, "engine-stacks.request");
  const dump = path.join(home, "engine-stacks.txt");
  try {
    rmSync(dump, { force: true });
    writeFileSync(request, "");
  } catch (error) {
    return [`could not ask: ${(error as Error).message}`];
  }
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      const text = existsSync(dump) ? readFileSync(dump, "utf-8") : "";
      if (/Current thread|Thread 0x/.test(text) && !existsSync(request)) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return readFileSync(dump, "utf-8").split(/\r?\n/).filter((line) => line.trim() !== "");
      }
    } catch {
      /* still being written */
    }
  }
  return [`no answer in ${waitMs} ms (request ${existsSync(request) ? "not taken" : "taken, nothing written"})`];
}

export interface EvidenceDeps {
  diagnostics: () => EngineDiagnostics;
  env?: NodeJS.ProcessEnv;
  log?: (text: string) => void;
}

/** Writes at most `MAX_REPORTS` reports per process; the rest are counted, not written. */
export class EngineEvidenceWriter {
  private written = 0;
  private busy = false;

  constructor(private readonly deps: EvidenceDeps) {}

  /** Called with every forwarded call's failure; does something only for an unreachable engine. */
  note(channel: string, error: unknown): void {
    if (!isUnreachable(error) || this.busy || this.written >= MAX_REPORTS) return;
    this.busy = true;
    void this.write(channel, error).finally(() => {
      this.busy = false;
    });
  }

  private async write(channel: string, error: unknown): Promise<void> {
    const env = this.deps.env ?? process.env;
    const at = new Date().toISOString();
    let view: EngineDiagnostics | null = null;
    try {
      view = this.deps.diagnostics();
    } catch {
      view = null;
    }
    const port = view?.port ?? null;
    const [probe, holders, stacks] = await Promise.all([
      port === null ? Promise.resolve("no port") : probePort(port),
      port === null ? Promise.resolve([] as string[]) : netstat(port),
      engineStacks(env.CUEPOINT_HOME),
    ]);
    const socketLine = stacks.find((line) => line.includes("listening socket fileno")) ?? "no socket line";
    const lines = [
      `Engine unreachable from main on ${channel} at ${at}`,
      ...describeError(error),
      view
        ? `supervisor: pid=${view.pid} port=${view.port} healthy=${view.healthy} spawned=${view.spawned} exits=${view.exits} ` +
          `restarts=${view.restartAttempts} heartbeat active=${view.heartbeatActive} misses=${view.heartbeatMisses} ` +
          `ms since spawn=${view.sinceSpawnMs} healthy=${view.sinceHealthyMs} heartbeat=${view.sinceHeartbeatMs ?? "never"}`
        : "supervisor: unavailable",
      `port ${port ?? "?"} from main: ${probe}`,
      "--- netstat ---",
      ...holders,
      "--- engine threads (its own dump) ---",
      ...stacks,
      `SUMMARY ${channel}: ${describeError(error).join(" <- ")} | port=${port} from main=${probe} | ` +
        `netstat=${holders.join(" | ") || "n/a"} | engine=${socketLine.trim()}`,
    ];
    const text = lines.join("\n");
    this.written += 1;
    (this.deps.log ?? console.error)(text);
    const dir = env.CUEPOINT_E2E_EVIDENCE_DIR;
    if (!dir) return;
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, `main-${process.pid}-${this.written}.txt`), text);
    } catch {
      /* the report was printed; a folder that cannot be written is not the failure */
    }
  }
}
