/**
 * What the Phase 18 end-to-end specs share (HARDEN-01, -03, -05, -06): launching the app over a
 * folder of its own, a generated library, finding and killing the app's processes by the OS's own
 * kill, and asking the library file whether it is whole.
 *
 * Nothing here touches a CuePoint the person has open: every launch gets its own `--user-data-dir`
 * and `CUEPOINT_HOME`, and processes are found as descendants of the app that was launched.
 *
 * `CUEPOINT_E2E_EXECUTABLE` runs a spec against a packaged build; `support/launchApp.ts` chooses.
 */
import { expect, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync, spawnSync } from "node:child_process";
import { createWriteStream, existsSync, readFileSync, readdirSync } from "node:fs";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { waitForEngine } from "./engineReady";
import { rememberHome, rememberWindow, withEngineEvidence } from "./support/engineEvidence";
import { launchElectron } from "./support/launchApp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DESKTOP_ROOT = path.resolve(__dirname, "..");
export const REPO_ROOT = path.resolve(DESKTOP_ROOT, "..", "..");
export const FIXTURE_AUDIO = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio");

// ---------------------------------------------------------------------------------------------
// Launching

export interface LaunchOptions {
  userDataDir: string;
  home: string;
  /** More environment for the app, and so for the engine and player it starts. */
  env?: Record<string, string>;
}

export function launchApp(options: LaunchOptions): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: options.home,
    ...options.env,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  return launchElectron({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${options.userDataDir}`], env }).then((app) => {
    rememberHome(app, options.home);
    return app;
  });
}

/** The first window, past onboarding, with the engine answering. */
export async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  rememberWindow(window, app);
  await setSeen(window);
  await window.reload();
  await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
  return window;
}

/** Onboarding and the first-run note are done, so the shell opens straight on its page. */
export async function setSeen(window: Page): Promise<void> {
  await window.evaluate(() => {
    localStorage.setItem("cuepoint-onboarding-complete", "1");
    localStorage.setItem("cuepoint-phase14-note-seen", "1");
  });
}

/** The app's main process id, asked of the app itself (the handle can be a wrapper around it). */
export function mainPid(app: ElectronApplication): Promise<number> {
  return app.evaluate(() => process.pid);
}

// ---------------------------------------------------------------------------------------------
// Jobs

export async function jobState(window: Page, jobId: string): Promise<string> {
  return withEngineEvidence(window, "getJob", () =>
    window.evaluate((id) => window.cuepoint!.getJob!(id).then((job: any) => job?.state ?? "missing"), jobId),
  );
}

/** Wait for a job to end, whichever way, and return its final record. */
export async function finished(window: Page, jobId: string, timeout = 120_000): Promise<any> {
  await expect
    .poll(() => jobState(window, jobId), { timeout })
    .toMatch(/succeeded|failed|cancelled|interrupted/);
  return window.evaluate((id) => window.cuepoint!.getJob!(id), jobId);
}

/** Nothing running: a job that follows another must not be raced. */
export async function idle(window: Page, timeout = 120_000): Promise<void> {
  await expect
    .poll(
      async () => {
        // A refused connection (the engine between two lives) is "not yet", not the end of the test: a
        // dead engine still fails it, at the timeout.
        // The evidence is gathered on the way (a few times at most) even though the poll goes on.
        const jobs = await withEngineEvidence(window, "listJobs", () =>
          window.evaluate(() => window.cuepoint!.listJobs!({ state: "active" })),
        ).catch(() => null);
        return jobs ? jobs.active_count : -1;
      },
      { timeout },
    )
    .toBe(0);
}

export async function importLibrary(window: Page, xmlPath: string): Promise<string> {
  const started = await withEngineEvidence(window, "startLibraryImport", () =>
    window.evaluate((file) => window.cuepoint!.startLibraryImport!({ xml_path: file }), xmlPath),
  );
  const job = await finished(window, started.job_id, 180_000);
  expect(job.state).toBe("succeeded");
  await idle(window);
  return started.job_id;
}

// ---------------------------------------------------------------------------------------------
// A generated library

/** A Rekordbox `Location`: a file URL, "file://localhost/" then the path without its leading slash. */
export function locationOf(file: string): string {
  const slashed = file.replace(/\\/g, "/").replace(/^\/+/, "");
  return "file://localhost/" + slashed.split("/").map(encodeURIComponentKeepingColon).join("/");
}

function encodeURIComponentKeepingColon(part: string): string {
  return encodeURIComponent(part).replace(/%3A/g, ":");
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface GeneratedTrack {
  id: number;
  title: string;
  artist: string;
  /** The audio file, when the track has one on disk. */
  file?: string;
  key?: string;
  year?: number;
  label?: string;
}

/** Stream a Rekordbox export of `tracks` to disk (50,000 tracks stay out of memory). */
export async function writeExportFile(
  file: string,
  tracks: Iterable<GeneratedTrack>,
  count: number,
  playlistOf: number[] = [],
): Promise<string> {
  const out = createWriteStream(file, { encoding: "utf-8" });
  const write = async (text: string) => {
    if (!out.write(text)) await once(out, "drain");
  };
  await write('<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0.0">\n');
  await write(`  <COLLECTION Entries="${count}">\n`);
  let chunk: string[] = [];
  for (const track of tracks) {
    const location = track.file ? locationOf(track.file) : `file://localhost/music/${track.id}.mp3`;
    chunk.push(
      `    <TRACK TrackID="${track.id}" Name="${escapeXml(track.title)}" Artist="${escapeXml(track.artist)}" ` +
        `Genre="House" Tonality="${track.key ?? `${(track.id % 12) + 1}A`}" AverageBpm="${80 + (track.id % 90)}.00" ` +
        `Year="${track.year ?? 1995 + (track.id % 30)}" TotalTime="30" BitRate="320" Rating="0" ` +
        `Label="${escapeXml(track.label ?? `Label ${track.id % 100}`)}" Location="${location}"/>`,
    );
    if (chunk.length === 2000) {
      await write(chunk.join("\n") + "\n");
      chunk = [];
    }
  }
  if (chunk.length > 0) await write(chunk.join("\n") + "\n");
  await write("  </COLLECTION>\n");
  const members = playlistOf.map((id) => `<TRACK Key="${id}"/>`).join("");
  await write(
    `  <PLAYLISTS><NODE Name="ROOT" Type="0" Count="1">` +
      `<NODE Name="Set" Type="1" Entries="${playlistOf.length}">${members}</NODE>` +
      `</NODE></PLAYLISTS>\n</DJ_PLAYLISTS>\n`,
  );
  out.end();
  await once(out, "finish");
  return file;
}

/** `count` tracks with no audio files, named `Track 000001`. */
export function plainTracks(count: number): Iterable<GeneratedTrack> {
  return (function* () {
    for (let id = 1; id <= count; id += 1) {
      yield { id, title: `Track ${String(id).padStart(6, "0")}`, artist: `Artist ${String(id).padStart(6, "0")}` };
    }
  })();
}

// ---------------------------------------------------------------------------------------------
// Processes

export interface Proc {
  pid: number;
  ppid: number;
  command: string;
}

export function processes(): Proc[] {
  if (process.platform === "win32") {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
      ],
      { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
    );
    return (JSON.parse(out) as Array<{ ProcessId: number; ParentProcessId: number; CommandLine: string | null }>).map(
      (row) => ({ pid: row.ProcessId, ppid: row.ParentProcessId, command: row.CommandLine ?? "" }),
    );
  }
  const out = execFileSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  return out
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3]! }));
}

/** Every process below `rootPid` whose command line matches. */
export function descendants(rootPid: number, pattern: RegExp): number[] {
  const all = processes();
  const found: number[] = [];
  const walk = (pid: number) => {
    for (const child of all.filter((row) => row.ppid === pid)) {
      if (pattern.test(child.command)) found.push(child.pid);
      walk(child.pid);
    }
  };
  walk(rootPid);
  return found;
}

export const ENGINE_PATTERN = /cuepoint-engine|cuepoint\.engine/;

export function enginesUnder(rootPid: number): number[] {
  return descendants(rootPid, ENGINE_PATTERN);
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The OS's own kill, on each process; one already gone is no error. */
export function killAll(pids: number[], signal: NodeJS.Signals = "SIGKILL"): void {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      /* already gone */
    }
  }
}

/** The engine processes under the app, once there are some (a restart takes a moment). */
export async function waitForEngines(main: number, not: number[] = []): Promise<number[]> {
  let found: number[] = [];
  await expect
    .poll(
      () => {
        found = enginesUnder(main).filter((pid) => !not.includes(pid));
        return found.length;
      },
      { timeout: 90_000, message: "no engine process came up" },
    )
    .toBeGreaterThan(0);
  return found;
}

/** Kill the engine, and wait until the supervisor has a different one answering. */
export async function killEngineAndWaitForNew(app: ElectronApplication, window: Page): Promise<void> {
  const main = await mainPid(app);
  const before = enginesUnder(main);
  expect(before.length).toBeGreaterThan(0);
  killAll(before);
  await waitForRestart(window, main, before);
}

/** After the engine was killed or stalled: a new engine process, answering. */
export async function waitForRestart(window: Page, main: number, old: number[], timeout = 120_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const fresh = enginesUnder(main).filter((pid) => !old.includes(pid));
        if (fresh.length === 0) return false;
        try {
          const status = await window.evaluate(() => window.cuepoint?.getEngineStatus?.());
          return status?.connected === true;
        } catch {
          return false;
        }
      },
      { timeout, message: "the engine was not restarted" },
    )
    .toBe(true);
}

/** The environment of a Linux process (the engine's port and token are in it); null elsewhere. */
export function environOf(pid: number): Record<string, string> | null {
  try {
    const raw = readFileSync(`/proc/${pid}/environ`, "utf-8");
    const env: Record<string, string> = {};
    for (const entry of raw.split("\0")) {
      const at = entry.indexOf("=");
      if (at > 0) env[entry.slice(0, at)] = entry.slice(at + 1);
    }
    return env;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// The library file

/** `PRAGMA integrity_check` on the library, read-only, by the Python that runs the engine. */
export function integrityCheck(dbPath: string): string {
  expect(existsSync(dbPath), `no library file at ${dbPath}`).toBe(true);
  const python = process.env.CUEPOINT_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const code = [
    "import sqlite3, sys, pathlib",
    "uri = pathlib.Path(sys.argv[1]).resolve().as_uri() + '?mode=ro'",
    "con = sqlite3.connect(uri, uri=True, timeout=30)",
    "print(';'.join(row[0] for row in con.execute('PRAGMA integrity_check')))",
  ].join("\n");
  const run = spawnSync(python, ["-I", "-c", code, dbPath], { encoding: "utf-8", timeout: 120_000, env: { ...process.env, PYTHONUTF8: "1" } });
  if (run.status !== 0) throw new Error(`integrity_check could not run: ${run.stderr || run.error}`);
  return run.stdout.trim();
}

/** A scalar from the library file, read-only. */
export function libraryScalar(dbPath: string, sql: string): unknown {
  const python = process.env.CUEPOINT_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const code = [
    "import sqlite3, sys, pathlib, json",
    "uri = pathlib.Path(sys.argv[1]).resolve().as_uri() + '?mode=ro'",
    "con = sqlite3.connect(uri, uri=True, timeout=30)",
    "print(json.dumps(con.execute(sys.argv[2]).fetchone()[0]))",
  ].join("\n");
  const run = spawnSync(python, ["-I", "-c", code, dbPath, sql], { encoding: "utf-8", timeout: 120_000, env: { ...process.env, PYTHONUTF8: "1" } });
  if (run.status !== 0) throw new Error(`query could not run: ${run.stderr || run.error}`);
  return JSON.parse(run.stdout.trim());
}

export function libraryFile(home: string): string {
  return path.join(home, "cuepoint.db");
}

/** Every file under `dir`, relative, recursively. */
export function listTree(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(path.relative(dir, full));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}
