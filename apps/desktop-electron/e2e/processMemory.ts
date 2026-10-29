/**
 * The resident memory of the app's processes, read from the operating system (HARDEN-07).
 *
 * `app.getAppMetrics()` knows Electron's own processes only. The engine and mpv are children
 * the main process spawns, so the number for all four (main, renderer, engine, mpv) comes from
 * the OS's process table: `ps` on macOS and Linux, PowerShell's `Win32_Process` on Windows. The
 * table is read whole and the app's processes are found in it by their parent: main is the pid
 * Electron reports for itself, the renderers are the pids it reports as tabs, and the engine and
 * mpv are main's descendants by name.
 */
import { execFileSync } from "node:child_process";

export interface ProcessRow {
  pid: number;
  ppid: number;
  /** The executable's name, without its folder or `.exe`. */
  name: string;
  rssKb: number;
}

/** What the four processes hold, in MB. `mpvMb` is null when no player is running. */
export interface Footprint {
  mainMb: number;
  rendererMb: number;
  engineMb: number;
  mpvMb: number | null;
}

const baseName = (command: string): string =>
  command
    .trim()
    .split(/[\\/]/)
    .pop()!
    .replace(/\.exe$/i, "");

/** `ps -axo pid=,ppid=,rss=,comm=`: four columns, the last may hold spaces (macOS paths). */
export function parsePs(text: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    rows.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      rssKb: Number(match[3]),
      name: baseName(match[4]!),
    });
  }
  return rows;
}

/** PowerShell's `ConvertTo-Json` of `ProcessId, ParentProcessId, Name, WorkingSetSize` (bytes). */
export function parseWindows(json: string): ProcessRow[] {
  const parsed: unknown = JSON.parse(json);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.map((entry) => {
    const row = entry as Record<string, unknown>;
    return {
      pid: Number(row.ProcessId),
      ppid: Number(row.ParentProcessId),
      name: baseName(String(row.Name ?? "")),
      rssKb: Math.round(Number(row.WorkingSetSize ?? 0) / 1024),
    };
  });
}

/** The whole process table, now. */
export function readProcessTable(): ProcessRow[] {
  if (process.platform === "win32") {
    const out = execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,WorkingSetSize | ConvertTo-Json -Compress",
      ],
      { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 },
    );
    return parseWindows(out);
  }
  return parsePs(
    execFileSync("ps", ["-axo", "pid=,ppid=,rss=,comm="], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }),
  );
}

/** Everything below `pid` in the table, children and theirs. */
export function descendants(table: ProcessRow[], pid: number): ProcessRow[] {
  const children = new Map<number, ProcessRow[]>();
  for (const row of table) {
    const list = children.get(row.ppid) ?? [];
    list.push(row);
    children.set(row.ppid, list);
  }
  const found: ProcessRow[] = [];
  const queue = [pid];
  const seen = new Set<number>([pid]);
  while (queue.length > 0) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (seen.has(child.pid)) continue;
      seen.add(child.pid);
      found.push(child);
      queue.push(child.pid);
    }
  }
  return found;
}

const mb = (kb: number): number => Math.round((kb / 1024) * 10) / 10;

/**
 * The four numbers. The engine is main's descendant called `cuepoint-engine` (the packaged
 * build, whose one-file form is two processes, both counted) or `python` (from source); mpv is
 * the one called `mpv`.
 */
export function footprint(table: ProcessRow[], mainPid: number, rendererPids: number[]): Footprint {
  const sum = (rows: ProcessRow[]): number => rows.reduce((total, row) => total + row.rssKb, 0);
  const own = descendants(table, mainPid);
  const main = table.find((row) => row.pid === mainPid);
  const renderers = table.filter((row) => rendererPids.includes(row.pid));
  const mpv = own.filter((row) => /^mpv/i.test(row.name));
  const engine = own.filter((row) => /^(cuepoint-engine|python)/i.test(row.name));
  return {
    mainMb: mb(main?.rssKb ?? 0),
    rendererMb: mb(sum(renderers)),
    engineMb: mb(sum(engine)),
    mpvMb: mpv.length > 0 ? mb(sum(mpv)) : null,
  };
}
