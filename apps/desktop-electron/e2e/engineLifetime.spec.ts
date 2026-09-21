/**
 * The engine never outlives the app (EXPORT-07).
 *
 * Found in EXPORT-07's packaged runs: an engine still running after its app
 * had gone, on its port and holding the library database, with nothing left
 * that could reach it. Two ways an app ends are driven here, against the real
 * processes: an ordinary quit, whose cleanup is now waited for (`quitAfter.ts`),
 * and an app killed outright — a crash, End Task — where no cleanup runs at all
 * and the engine has to notice for itself (`parent_watch.py`).
 *
 * The engine is found as a descendant of the app's own process, by command
 * line, so the test never touches a CuePoint the user has open.
 *
 * `CUEPOINT_E2E_EXECUTABLE` runs it against a packaged build.
 */
import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

interface Proc {
  pid: number;
  ppid: number;
  command: string;
}

function processes(): Proc[] {
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
  const out = execFileSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf-8" });
  return out
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3]! }));
}

/** Every engine process descended from the app: bootloader and child alike. */
function enginesUnder(rootPid: number): number[] {
  const all = processes();
  const found: number[] = [];
  const walk = (pid: number) => {
    for (const child of all.filter((row) => row.ppid === pid)) {
      if (/cuepoint-engine|cuepoint\.engine/.test(child.command)) found.push(child.pid);
      walk(child.pid);
    }
  };
  walk(rootPid);
  return found;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.env.CUEPOINT_E2E_EXECUTABLE;
  return packaged
    ? electron.launch({ executablePath: packaged, args: [`--user-data-dir=${userDataDir}`], env })
    : electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

/**
 * The app's main process id, and the engines under it.
 *
 * Asked of the app itself: the process Playwright holds can be a wrapper
 * around Electron's main process, and killing the wrapper kills no app.
 */
async function runningEngines(app: ElectronApplication): Promise<{ main: number; engines: number[] }> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await expect(window.locator(".cp-status")).toContainText(/Engine connected/i, { timeout: 60_000 });
  const main = await app.evaluate(() => process.pid);
  const engines = enginesUnder(main);
  expect(engines.length).toBeGreaterThan(0);
  return { main, engines };
}

test.describe("the engine's lifetime (EXPORT-07)", () => {
  test.describe.configure({ timeout: 180_000 });

  let userDataDir: string;
  let cuepointHome: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome]) rmSync(dir, { recursive: true, force: true });
  });

  test("an ordinary quit stops the engine before the app is gone", async () => {
    const app = await launch(userDataDir, cuepointHome);
    const { engines } = await runningEngines(app);
    await app.close();
    await expect.poll(() => engines.filter(alive), { timeout: 15_000 }).toEqual([]);
  });

  test("an app killed outright still leaves no engine behind", async () => {
    const app = await launch(userDataDir, cuepointHome);
    const { main, engines } = await runningEngines(app);
    // No quit, no cleanup: what a crash or End Task does. On Windows the
    // processes the app started die with it, but not what they started in
    // turn — and a packaged engine is a bootloader and its child.
    process.kill(main, "SIGKILL");
    try {
      await expect.poll(() => engines.filter(alive), { timeout: 20_000 }).toEqual([]);
    } finally {
      // Never leave one behind from a failed run either.
      for (const pid of engines.filter(alive)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // Already gone.
        }
      }
    }
  });
});
