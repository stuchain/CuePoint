/**
 * No page floods the engine.
 *
 * Every engine call is one HTTP connection (DEC-223), and the closed connection waits out TIME_WAIT
 * on the app's side. A page that asks on every render (a new array in an effect's dependencies) can
 * ask a hundred times a second; on Windows that runs the machine out of ports in a minute and every
 * call then fails with `EADDRINUSE` ("fetch failed"). Library did exactly that with
 * `/library/pending` from 10-27 to 10-30.
 *
 * This counts every engine call in the main process, per channel, while the app imports a library
 * and while it sits on each of the seven pages during and after the import, and fails when any
 * channel is called more than `MAX_PER_SECOND` times in any one second.
 */
import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";
import { launchElectron } from "./support/launchApp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

const TRACKS = 3_000;
/** The most calls one engine channel may take in any one second. A user's click is far below it. */
const MAX_PER_SECOND = 20;
/** How long the spec sits on each page, so a loop has time to show. */
const DWELL_MS = 3_000;

/** The seven destinations (`navRegistry.ts`), by their sidebar labels. */
const DESTINATIONS = ["Library", "Clean", "Keys", "Discover", "Prepare", "Statistics", "Settings"] as const;

function writeExport(dir: string): string {
  const keys = ["1A", "2A", "5A", "8A", "11A", "3B", "6B", "9B"];
  const entries: string[] = [];
  for (let id = 1; id <= TRACKS; id += 1) {
    entries.push(
      `<TRACK TrackID="${id}" Name="Track ${id}" Artist="Artist ${(id * 37) % 400}" Genre="Genre ${id % 9}" ` +
        `Tonality="${keys[id % keys.length]}" AverageBpm="${(110 + (id % 30)).toFixed(2)}" TotalTime="${240 + (id % 120)}" ` +
        `Location="file://localhost/m/${id}.mp3"/>`,
    );
  }
  const members = Array.from({ length: 300 }, (_, index) => `<TRACK Key="${(index * 7) % TRACKS + 1}"/>`).join("");
  const file = path.join(dir, "collection.xml");
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${TRACKS}">
${entries.join("\n")}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0"><NODE Name="Warm up" Type="1" Entries="300">${members}</NODE></NODE></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return file;
}

/** Records the time of every `engine:*` invoke in the main process (`ipcMain._invokeHandlers`). */
async function recordEngineCalls(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ ipcMain }) => {
    type Handler = (...args: unknown[]) => unknown;
    const handlers = (ipcMain as unknown as { _invokeHandlers?: Map<string, Handler> })._invokeHandlers;
    if (!(handlers instanceof Map)) {
      throw new Error("ipcMain._invokeHandlers is not a Map in this Electron: update e2e/engineCallRate.spec.ts.");
    }
    const g = globalThis as unknown as { __engineCalls?: Record<string, number[]> };
    const calls: Record<string, number[]> = {};
    g.__engineCalls = calls;
    const wrap = (channel: string, handler: Handler): Handler => {
      const wrapped: Handler & { __timed?: boolean } = (...args) => {
        (calls[channel] ??= []).push(Date.now());
        return handler(...args);
      };
      wrapped.__timed = true;
      return wrapped;
    };
    const timed = (handler: Handler) => (handler as Handler & { __timed?: boolean }).__timed === true;
    const set = handlers.set.bind(handlers);
    for (const [channel, handler] of handlers.entries()) {
      if (channel.startsWith("engine:") && !timed(handler)) set(channel, wrap(channel, handler));
    }
    handlers.set = (channel, handler) =>
      set(channel, channel.startsWith("engine:") && !timed(handler) ? wrap(channel, handler) : handler);
  });
}

async function engineCalls(app: ElectronApplication): Promise<Record<string, number[]>> {
  return app.evaluate(() => ({ ...((globalThis as unknown as { __engineCalls?: Record<string, number[]> }).__engineCalls) }));
}

/** The most calls in any one-second window, per channel, with the window's start. */
function busiestSecond(calls: Record<string, number[]>): Array<{ channel: string; count: number; at: number }> {
  const out: Array<{ channel: string; count: number; at: number }> = [];
  for (const [channel, times] of Object.entries(calls)) {
    const sorted = [...times].sort((a, b) => a - b);
    let best = 0;
    let at = sorted[0] ?? 0;
    let start = 0;
    for (let end = 0; end < sorted.length; end += 1) {
      while (sorted[end] - sorted[start] >= 1_000) start += 1;
      if (end - start + 1 > best) {
        best = end - start + 1;
        at = sorted[start];
      }
    }
    out.push({ channel, count: best, at });
  }
  return out.sort((a, b) => b.count - a.count);
}

async function visitEveryPage(window: Page, phase: string, log: string[]): Promise<void> {
  for (const label of DESTINATIONS) {
    const link = window.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: label, exact: true });
    await link.click();
    log.push(`${Date.now()} ${phase} ${label}`);
    await window.waitForTimeout(DWELL_MS);
  }
}

test.describe("engine call rate", () => {
  test.describe.configure({ timeout: 300_000 });

  test("no page asks the engine more than 20 times a second, during or after an import", async () => {
    const userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-call-rate-ud-"));
    const cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-call-rate-home-"));
    const xmlDir = mkdtempSync(path.join(tmpdir(), "cuepoint-call-rate-xml-"));
    const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome } as Record<string, string>;
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await launchElectron({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
      });
      await window.evaluate(() => {
        localStorage.setItem("cuepoint-onboarding-complete", "1");
        localStorage.setItem("cuepoint-phase14-note-seen", "1");
      });
      await window.reload();
      await window.locator("main.app-main .screen:visible").first().waitFor({ timeout: 30_000 });
      await waitForEngine(window);
      await recordEngineCalls(app);

      const visits: string[] = [];
      const started = await window.evaluate(
        (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
        writeExport(xmlDir),
      );
      await visitEveryPage(window, "during import", visits);
      await expect
        .poll(async () => (await window.evaluate((id) => window.cuepoint!.getJob!(id), started.job_id))!.state, {
          timeout: 180_000,
          intervals: [500, 1_000, 2_000],
        })
        .toBe("succeeded");
      await visitEveryPage(window, "after import", visits);

      const calls = await engineCalls(app);
      const ranked = busiestSecond(calls);
      const flooded = ranked.filter((entry) => entry.count > MAX_PER_SECOND);
      const report = [
        "Busiest second per engine channel:",
        ...ranked.slice(0, 15).map((entry) => `  ${entry.count}/s ${entry.channel} at ${entry.at}`),
        "Pages visited:",
        ...visits.map((line) => `  ${line}`),
      ].join("\n");
      writeFileSync(test.info().outputPath("engine-call-rate.txt"), report);
      expect(Object.keys(calls).length, "no engine call was recorded, so the check would be vacuous").toBeGreaterThan(0);
      expect(flooded, report).toEqual([]);
    } finally {
      await app.close();
      for (const dir of [userDataDir, cuepointHome, xmlDir]) rmSync(dir, { recursive: true, force: true });
    }
  });
});
