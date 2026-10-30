/**
 * What a spec prints when a call to the engine fails.
 *
 * A Windows CI run failed with `page.evaluate: Error: fetch failed` while the shell said "offline",
 * and nothing said why: the development Playwright run does not show the engine's stderr, and the
 * engine's exit code, restarts and heartbeat live in the main process. This collects them, the way
 * `expectReloaded` in crash.spec.ts describes the windows when one does not reload:
 *
 * - the supervisor's view (pid, port, exits, restarts, heartbeat misses), asked of the app through
 *   `__cuepointTest.engineDiagnostics` (only in a `CUEPOINT_E2E` run);
 * - the last lines the engine wrote to stdout and stderr, as the supervisor holds them, and the
 *   tail of `cuepoint.log` under the spec's `CUEPOINT_HOME`;
 * - whether anything is listening on the engine's port, and why not (refused, timed out); on
 *   Windows, what `netstat` says holds that port;
 * - the engine's own thread stacks and whether its listening socket is open, which it writes when
 *   asked through a file under `CUEPOINT_HOME` (`watch_stack_dump_requests` in server.py).
 *
 * The report is put in the thrown error (the original message first, so a poll that matches on it
 * still does), attached to the test (`test-results/` is uploaded on a CI failure) and printed.
 */
import { test, type ElectronApplication, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";

/** Where the failing call's app is, and the folder it was given as `CUEPOINT_HOME`. */
export interface EngineSource {
  app: ElectronApplication;
  home?: string;
}

/** The supervisor's view, as `EngineSupervisor.diagnosticsForTest` answers it. */
export interface SupervisorView {
  pid: number | null;
  port: number | null;
  healthy: boolean;
  status: { connected: boolean; starting?: boolean; error?: string; reconnecting?: boolean };
  restartAttempts: number;
  reconnecting: boolean;
  spawned: number;
  exits: number;
  lastExit: { code: number | null; signal: string | null; uptimeMs: number } | null;
  heartbeatActive: boolean;
  heartbeatMisses: number;
  sinceSpawnMs?: number | null;
  sinceHealthyMs?: number | null;
  sinceHeartbeatMs?: number | null;
  stopRequested: boolean;
  maintenance: boolean;
  stdout: string[];
  stderr: string[];
}

/** How many lines of each log the report holds. */
export const EVIDENCE_LOG_LINES = 80;

/** A failure that says the engine could not be reached, as opposed to one it answered. */
const UNREACHABLE = /fetch failed|ECONNREFUSED|ECONNRESET|socket hang up|other side closed|Engine not running|offline|Reconnecting|never reported itself connected/i;

export function looksUnreachable(error: unknown): boolean {
  return UNREACHABLE.test(error instanceof Error ? error.message : String(error));
}

/** The last `count` non-empty lines of `text`, each cut at `width` (a log line carries a long source path). */
export function tailLines(text: string, count: number = EVIDENCE_LOG_LINES, width = 400): string[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .slice(-count)
    .map((line) => (line.length > width ? `${line.slice(0, width)}...` : line));
}

/** The report, as text. Pure, so it is unit tested (`engineEvidence.test.ts`). */
export function formatEvidence(input: {
  what: string;
  error: string;
  view: SupervisorView | { unavailable: string };
  listening: boolean | null;
  /** Why the port did or did not accept: "accepted", "ECONNREFUSED", "timed out", ... */
  probe?: string;
  netstat?: string[];
  stacks?: string[];
  logs: Array<{ file: string; lines: string[] }>;
}): string {
  const out: string[] = [`Engine unreachable during ${input.what}: ${input.error.split("\n")[0]}`];
  const { view } = input;
  if ("unavailable" in view) {
    out.push(`supervisor: unavailable (${view.unavailable})`);
  } else {
    out.push(
      `supervisor: pid=${view.pid ?? "none"} port=${view.port ?? "none"} healthy=${view.healthy} ` +
        `status=${JSON.stringify(view.status)}`,
      `supervisor: spawned=${view.spawned} exits=${view.exits} restartAttempts=${view.restartAttempts} ` +
        `reconnecting=${view.reconnecting} stopRequested=${view.stopRequested} maintenance=${view.maintenance}`,
      `supervisor: heartbeat active=${view.heartbeatActive} misses=${view.heartbeatMisses}`,
      `supervisor: ms since spawn=${view.sinceSpawnMs ?? "?"} healthy=${view.sinceHealthyMs ?? "?"} ` +
        `heartbeat answered=${view.sinceHeartbeatMs ?? "never"}`,
      `supervisor: last exit ${view.lastExit ? `code=${view.lastExit.code} signal=${view.lastExit.signal} after ${view.lastExit.uptimeMs} ms` : "none"}`,
    );
    out.push(
      `port ${view.port ?? "?"} listening: ${input.listening === null ? "unknown" : input.listening}` +
        (input.probe ? ` (${input.probe})` : ""),
    );
    if (input.netstat) out.push(`--- netstat for port ${view.port} ---`, ...input.netstat);
    if (input.stacks) out.push("--- engine threads (its own dump) ---", ...input.stacks);
    out.push(`--- engine stderr (last ${EVIDENCE_LOG_LINES}) ---`, ...tailLines(view.stderr.join("\n")));
    out.push(`--- engine stdout (last ${EVIDENCE_LOG_LINES}) ---`, ...tailLines(view.stdout.join("\n")));
  }
  for (const log of input.logs) {
    out.push(`--- ${log.file} (last ${EVIDENCE_LOG_LINES}) ---`, ...log.lines);
  }
  if (input.logs.length === 0) out.push("--- no cuepoint.log found under CUEPOINT_HOME ---");
  // Repeated last: a CI log tool that keeps only the tail of a long report still shows it.
  out.push(summaryLine(input));
  return out.join("\n");
}

/** The report's key facts on one line, for the end of it. */
export function summaryLine(input: Parameters<typeof formatEvidence>[0]): string {
  const { view } = input;
  if ("unavailable" in view) return `SUMMARY ${input.what}: supervisor unavailable (${view.unavailable})`;
  const socket = input.stacks?.find((line) => line.includes("listening socket fileno"));
  return (
    `SUMMARY ${input.what}: pid=${view.pid ?? "none"} port=${view.port ?? "none"} ` +
    `listening=${input.listening ?? "unknown"}${input.probe ? ` (${input.probe})` : ""} ` +
    `exits=${view.exits} misses=${view.heartbeatMisses} ` +
    `ms since spawn=${view.sinceSpawnMs ?? "?"} healthy=${view.sinceHealthyMs ?? "?"} heartbeat=${view.sinceHeartbeatMs ?? "never"} ` +
    `netstat=${input.netstat ? JSON.stringify(input.netstat.join(" | ")) : "n/a"} ` +
    `engine=${socket ? socket.trim() : input.stacks ? "no socket line" : "not asked"}`
  );
}

/** Whether something accepts a connection on the loopback `port`, and the error code when not. */
export function probePort(port: number, timeoutMs = 1000): Promise<{ listening: boolean; reason: string }> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const done = (listening: boolean, reason: string): void => {
      socket.destroy();
      resolve({ listening, reason });
    };
    socket.setTimeout(timeoutMs, () => done(false, "timed out"));
    socket.once("connect", () => done(true, "accepted"));
    socket.once("error", (error: NodeJS.ErrnoException) => done(false, error.code ?? error.message));
  });
}

/** Whether something accepts a connection on the loopback `port`. */
export async function portListening(port: number, timeoutMs = 1000): Promise<boolean> {
  return (await probePort(port, timeoutMs)).listening;
}

/** What Windows says holds `port` (every state, with the owning process id). Elsewhere, nothing. */
function netstatFor(port: number): Promise<string[] | undefined> {
  if (process.platform !== "win32") return Promise.resolve(undefined);
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

/** Ask the engine for its thread stacks (test hooks only) and wait up to `waitMs` for them. */
async function engineStacks(home: string | undefined, waitMs = 4000): Promise<string[] | undefined> {
  if (!home) return undefined;
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
      // faulthandler ends with the thread it ran on; wait for it so a half-written dump is not read.
      if (/Current thread|Thread 0x/.test(text) && !existsSync(request)) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return tailLines(readFileSync(dump, "utf-8"), 300);
      }
    } catch {
      /* still being written */
    }
  }
  return [`no answer in ${waitMs} ms (request ${existsSync(request) ? "not taken: the engine's watcher is not running" : "taken, nothing written"})`];
}

function readLogs(home: string | undefined): Array<{ file: string; lines: string[] }> {
  if (!home) return [];
  const found: Array<{ file: string; lines: string[] }> = [];
  for (const folder of ["logs", "Logs"]) {
    const file = path.join(home, folder, "cuepoint.log");
    try {
      if (existsSync(file) && !found.some((log) => log.file.toLowerCase() === file.toLowerCase())) {
        found.push({ file, lines: tailLines(readFileSync(file, "utf-8")) });
      }
    } catch {
      /* a log that cannot be read is not the failure */
    }
  }
  return found;
}

async function superviseView(app: ElectronApplication): Promise<SupervisorView | { unavailable: string }> {
  try {
    const ask = app.evaluate(() => {
      const hooks = (globalThis as { __cuepointTest?: { engineDiagnostics?: () => unknown } }).__cuepointTest;
      return hooks?.engineDiagnostics ? hooks.engineDiagnostics() : null;
    });
    const view = (await Promise.race([
      ask,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("main did not answer in 5 s")), 5000)),
    ])) as SupervisorView | null;
    return view ?? { unavailable: "no __cuepointTest.engineDiagnostics (CUEPOINT_E2E off?)" };
  } catch (error) {
    return { unavailable: (error as Error).message.split("\n")[0]! };
  }
}

/** Gather the report. Never throws. */
export async function collectEngineEvidence(source: EngineSource, what: string, error: unknown): Promise<string> {
  const view = await superviseView(source.app);
  const port = "unavailable" in view ? null : view.port;
  const probe = port === null ? null : await probePort(port);
  const [netstat, stacks] = await Promise.all([
    port === null ? Promise.resolve(undefined) : netstatFor(port),
    engineStacks(source.home),
  ]);
  return formatEvidence({
    what,
    error: error instanceof Error ? error.message : String(error),
    view,
    listening: probe?.listening ?? null,
    probe: probe?.reason,
    netstat,
    stacks,
    logs: readLogs(source.home),
  });
}

const sources = new WeakMap<Page, EngineSource>();
const homes = new WeakMap<ElectronApplication, string>();

/** A spec's launch says which folder the app's engine was given, so a failing call can read its log. */
export function rememberHome(app: ElectronApplication, home: string): void {
  homes.set(app, home);
}

/** A spec's `ready()` says which app a window belongs to, so a call that has only the window can still be explained. */
export function rememberWindow(window: Page, app: ElectronApplication): void {
  sources.set(window, { app, home: homes.get(app) });
}

const reported = new WeakMap<ElectronApplication, { count: number; at: number }>();
const MAX_REPORTS = 3;
const MIN_GAP_MS = 5000;

/**
 * Run an engine call; if it fails because the engine could not be reached, say why before failing.
 * The error thrown starts with the original message. A poll calls this many times, so the report is
 * made a few times at most, apart.
 */
export async function withEngineEvidence<T>(target: EngineSource | Page, what: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (error) {
    if (!looksUnreachable(error)) throw error;
    const source = "app" in target ? target : sources.get(target);
    // A window nobody registered cannot be explained; the original failure stands.
    if (!source) throw error;
    const seen = reported.get(source.app) ?? { count: 0, at: 0 };
    if (seen.count >= MAX_REPORTS || Date.now() - seen.at < MIN_GAP_MS) throw error;
    reported.set(source.app, { count: seen.count + 1, at: Date.now() });
    const report = await collectEngineEvidence(source, what, error);
    console.error(report);
    try {
      await test.info().attach(`engine-evidence-${seen.count + 1}.txt`, { body: report, contentType: "text/plain" });
      // An attachment's body stays in the report; a file in the test's folder reaches the uploaded artifact.
      writeFileSync(test.info().outputPath(`engine-evidence-${seen.count + 1}.txt`), report);
    } catch {
      /* not inside a test: the printed copy stands */
    }
    const original = error instanceof Error ? error : new Error(String(error));
    original.message = `${original.message}\n\n${report}`;
    throw original;
  }
}
