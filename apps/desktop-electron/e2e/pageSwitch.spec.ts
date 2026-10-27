/**
 * The page-switch time budget (C19).
 *
 * Pages stay alive hidden after their first visit (`KeptPages.tsx`) and read through a shared
 * stale-while-revalidate cache (`engineReads.ts`, `sharedReads.ts`). This measures what that
 * buys on a 5,000-track library in the real app:
 *
 *   round 1  every destination once: each switch under 1.5 s
 *   round 2  every destination again: each switch under 300 ms, no loading
 *            placeholder at any moment of it, and no engine read of the cached kinds
 *   heap     the renderer's JS heap under 80 MB after round 2
 *
 * Time budgets double on CI, where a timing over budget is a warning annotation instead of a failure
 * (as with `CUEPOINT_PERF_WARN_ONLY`, unless `CUEPOINT_PERF_STRICT` is set); call counts, placeholders
 * and heap always fail.
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

const TRACKS = 5_000;
const CI = !!process.env.CI;
// On CI the machine is shared and slow, so timings only warn there unless CUEPOINT_PERF_STRICT asks
// for them to fail. Calls, placeholders and heap fail everywhere.
const WARN_ONLY = !!process.env.CUEPOINT_PERF_WARN_ONLY || (CI && !process.env.CUEPOINT_PERF_STRICT);
const FIRST_VISIT_BUDGET_MS = (CI ? 2 : 1) * 1_500;
const REVISIT_BUDGET_MS = (CI ? 2 : 1) * 300;
const HEAP_BUDGET_BYTES = 80 * 1024 * 1024;

/** The seven destinations (`navRegistry.ts`), by their sidebar labels. */
const DESTINATIONS = ["Library", "Clean", "Keys", "Discover", "Prepare", "Statistics", "Settings"] as const;
type Destination = (typeof DESTINATIONS)[number];

/** The bridge reads that go through the shared cache, by their IPC channel (`preload.cjs`). */
const CACHED_READ_CHANNELS: readonly string[] = [
  "engine:getLibrarySummary",
  "engine:getLibraryPlaylists",
  "engine:getCollections",
  "engine:getTags",
  "engine:getLibraryFilterFields",
  "engine:getLibraryHealth",
  "engine:getCleanPlaylists",
  "engine:getStatisticsPlays",
  "engine:getStatisticsSpreads",
  "engine:getStatisticsHealth",
  "engine:getKeysPopulation",
  "engine:getDiscoverOptions",
  "engine:listDiscoveryRuns",
  "engine:getBeatportTokenStatus",
  "engine:getRekordboxExportHistory",
];

const KEYS = ["1A", "2A", "3A", "4A", "5A", "6A", "7A", "8A", "9A", "10A", "11A", "12A", "1B", "5B", "8B", "11B"];
const GENRES = ["House", "Techno", "Deep House", "Minimal", "Trance", "Electro", "Breaks", "Drum &amp; Bass"];

function writeExport(dir: string): string {
  const entries: string[] = [];
  for (let id = 1; id <= TRACKS; id += 1) {
    const bpm = 100 + ((id * 7) % 80) + (id % 10) / 10;
    entries.push(
      `<TRACK TrackID="${id}" Name="Track ${id} ${["Mix", "Dub", "Edit", "Remix"][id % 4]}" ` +
        `Artist="Artist ${String((id * 37) % 600).padStart(3, "0")}" Genre="${GENRES[id % GENRES.length]}" ` +
        `Tonality="${KEYS[(id * 5) % KEYS.length]}" AverageBpm="${bpm.toFixed(2)}" Year="${2005 + (id % 20)}" ` +
        `TotalTime="${240 + (id % 240)}" BitRate="320" Rating="${(id % 6) * 51}" PlayCount="${id % 9}" ` +
        `Album="Album ${id % 400}" Label="Label ${id % 90}" Comment="note ${id}" ` +
        `Location="file://localhost/m/${id}.mp3"/>`,
    );
  }
  // Six playlists of a few hundred tracks each, overlapping and out of id order.
  const playlists = Array.from({ length: 6 }, (_, index) => {
    const size = 200 + index * 60;
    const members = Array.from({ length: size }, (_unused, member) => ((member * 13 + index * 701) % TRACKS) + 1);
    return `<NODE Name="Playlist ${index + 1}" Type="1" Entries="${size}">${members
      .map((id) => `<TRACK Key="${id}"/>`)
      .join("")}</NODE>`;
  });
  const file = path.join(dir, "collection.xml");
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${TRACKS}">
${entries.join("\n")}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0">
${playlists.join("\n")}
  </NODE></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return file;
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.env.CUEPOINT_E2E_EXECUTABLE;
  return packaged
    ? electron.launch({ executablePath: packaged, args: [`--user-data-dir=${userDataDir}`], env })
    : electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

async function ready(app: ElectronApplication): Promise<Page> {
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
  return window;
}

async function importCollection(window: Page, xmlPath: string) {
  const started = await window.evaluate(
    (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
    xmlPath,
  );
  await expect
    .poll(
      async () => (await window.evaluate((id) => window.cuepoint!.getJob!(id), started.job_id))!.state,
      { timeout: 240_000, intervals: [500, 1_000, 2_000] },
    )
    .toBe("succeeded");
  await window.reload();
  await window.locator("main.app-main .screen:visible").first().waitFor({ timeout: 30_000 });
}

/**
 * Count the invoke handlers' calls in the main process, per channel. Electron keeps them in
 * `ipcMain._invokeHandlers` (channel -> handler); each is wrapped to bump a counter on `globalThis`.
 */
async function instrumentIpc(app: ElectronApplication, expected: readonly string[]): Promise<number> {
  return app.evaluate(({ ipcMain }, channels) => {
    type Handler = (...args: unknown[]) => unknown;
    const handlers = (ipcMain as unknown as { _invokeHandlers?: Map<string, Handler> })._invokeHandlers;
    if (!(handlers instanceof Map)) {
      throw new Error(
        "ipcMain._invokeHandlers is not a Map in this Electron: the page-switch spec cannot count engine reads. " +
          "Update the instrumentation in e2e/pageSwitch.spec.ts for this Electron version.",
      );
    }
    // A channel that is not registered would never be counted: the zero-reads check would be vacuous.
    const missing = channels.filter((channel) => !handlers.has(channel));
    if (missing.length > 0) {
      throw new Error(`The cached-read channels are not registered in ipcMain, so they cannot be counted: ${missing.join(", ")}`);
    }
    const g = globalThis as unknown as { __ipcCalls?: Record<string, number>; __jobsLog?: unknown[] };
    const calls: Record<string, number> = {};
    g.__ipcCalls = calls;
    // What the jobs poll answered, each time it differs from the answer before: the change
    // counters and the active jobs are what make a cached read stale.
    const jobsLog: unknown[] = [];
    g.__jobsLog = jobsLog;
    let lastSummary = "";
    const noteJobs = (value: unknown) => {
      const answer = value as { jobs?: Array<{ type?: string }>; active_count?: number; revisions?: unknown } | null;
      const summary = JSON.stringify({
        active: answer?.active_count ?? null,
        types: (answer?.jobs ?? []).map((job) => job.type).sort(),
        revisions: answer?.revisions ?? null,
      });
      if (summary === lastSummary) return;
      lastSummary = summary;
      jobsLog.push({ at: Date.now(), ...JSON.parse(summary) });
    };
    const wrap = (channel: string, handler: Handler): Handler => {
      const wrapped: Handler & { __counted?: boolean } = (...args) => {
        calls[channel] = (calls[channel] ?? 0) + 1;
        const answer = handler(...args);
        if (channel === "engine:listJobs") void Promise.resolve(answer).then(noteJobs, () => undefined);
        return answer;
      };
      wrapped.__counted = true;
      return wrapped;
    };
    const counted = (handler: Handler) => (handler as Handler & { __counted?: boolean }).__counted === true;
    const set = handlers.set.bind(handlers);
    for (const [channel, handler] of [...handlers.entries()]) {
      if (!counted(handler)) set(channel, wrap(channel, handler));
    }
    // A handler registered later is counted too.
    handlers.set = (channel, handler) => set(channel, counted(handler) ? handler : wrap(channel, handler));
    return handlers.size;
  }, expected);
}

async function ipcCalls(app: ElectronApplication): Promise<Record<string, number>> {
  return app.evaluate(
    () => ({ ...((globalThis as unknown as { __ipcCalls?: Record<string, number> }).__ipcCalls ?? {}) }),
  );
}

async function jobsLog(app: ElectronApplication): Promise<Array<{ at: number; active: number | null; types: string[]; revisions: unknown }>> {
  return app.evaluate(
    () => [...((globalThis as unknown as { __jobsLog?: never[] }).__jobsLog ?? [])],
  );
}

/** Wait until no job is active and the change counters have stood still, so nothing is stale. */
async function waitForQuiet(app: ElectronApplication, window: Page): Promise<number> {
  const started = Date.now();
  const quietFor = 4_000;
  for (;;) {
    const log = await jobsLog(app);
    const last = log[log.length - 1];
    const lastChange = last ? last.at : started;
    const settled = (last?.active ?? 0) === 0 && Date.now() - lastChange >= quietFor;
    if (settled) return Date.now() - started;
    if (Date.now() - started > 180_000) throw new Error(`Background jobs never settled: ${JSON.stringify(last)}`);
    await window.waitForTimeout(500);
  }
}

function diff(after: Record<string, number>, before: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [channel, count] of Object.entries(after)) {
    const delta = count - (before[channel] ?? 0);
    if (delta > 0) out[channel] = delta;
  }
  return out;
}

interface Shown {
  screens: number;
  heading: string;
  placeholders: string[];
}

/** Defines `window.__shown()`: the shown page's heading and any loading placeholder on it. */
async function installShownProbe(window: Page): Promise<void> {
  await window.evaluate(() => {
    const w = window as unknown as { __shown?: () => Shown; __libraryChanged?: number[] };
    w.__libraryChanged = [];
    window.addEventListener("cuepoint:library-changed", () => w.__libraryChanged!.push(Date.now()));
    w.__shown = () => {
      const screens = [...document.querySelectorAll("main.app-main .screen")].filter(
        (screen) => screen.getClientRects().length > 0,
      );
      const placeholders: string[] = [];
      let heading = "";
      for (const screen of screens) {
        heading ||= screen.querySelector("h1")?.textContent?.trim() ?? "";
        // A marker counts only when it stands in for content. Over values already shown (a busy
        // flag on numbers being read again) it is stale-while-revalidate, not a placeholder.
        const standsAlone = (marker: Element) => {
          const busy = marker.closest('[aria-busy="true"]');
          if (!busy) return true;
          const own = (marker.textContent ?? "").trim();
          return (busy.textContent ?? "").trim().length <= own.length;
        };
        for (const spinner of screen.querySelectorAll(".cp-spinner")) {
          if (standsAlone(spinner)) placeholders.push("spinner");
        }
        for (const busy of screen.querySelectorAll('[aria-busy="true"]')) {
          if (!(busy.textContent ?? "").trim()) placeholders.push("aria-busy-empty");
        }
        for (const status of screen.querySelectorAll('[role="status"]')) {
          if (/loading/i.test(status.textContent ?? "") && standsAlone(status)) {
            placeholders.push(`status:${status.textContent!.trim()}`);
          }
        }
        const skeletons = [...screen.querySelectorAll(".track-table__skeleton")].filter(
          (skeleton) => skeleton.getClientRects().length > 0,
        );
        if (skeletons.length > 0) {
          placeholders.push(`skeleton:${skeletons.length} cells over ${screen.querySelectorAll(".track-table__row").length} rows`);
        }
        for (const note of screen.querySelectorAll("p, span, div, li, td, label")) {
          // The words of the element itself, whether or not it also holds other elements.
          const own = [...note.childNodes]
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent ?? "")
            .join("")
            .trim();
          if (/^(Reading|Counting|Loading|Starting|Looking up)\b.*(…|\.\.\.)$/.test(own) && standsAlone(note)) {
            placeholders.push(`text:${own}`);
          }
        }
      }
      return { screens: screens.length, heading, placeholders };
    };
  });
}

interface Switch {
  page: Destination;
  ms: number;
  /** Every placeholder any frame of the switch showed. */
  placeholdersSeen: string[];
  /** The shown page right after the click, before any wait. */
  afterClick: { heading: string; placeholders: string[] };
}

async function switchTo(window: Page, label: Destination): Promise<Switch> {
  const link = window
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: label, exact: true });
  // The actionability checks (stable, visible, not covered) without a click, so the box below is
  // where the entry will be when the mouse arrives and the timed part holds only the switch.
  await link.click({ trial: true });
  const box = await link.boundingBox();
  if (!box) throw new Error(`The ${label} entry has no box in the sidebar.`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // A frame-by-frame watcher of the shown page, running from before the click.
  await window.evaluate(() => {
    const w = window as unknown as { __shown: () => Shown; __watch: { stop: boolean; seen: string[]; latest?: Shown } };
    const watch: { stop: boolean; seen: string[]; latest?: Shown } = { stop: false, seen: [] };
    w.__watch = watch;
    const tick = () => {
      const state = w.__shown();
      watch.latest = state;
      for (const found of state.placeholders) if (!watch.seen.includes(found)) watch.seen.push(found);
      if (!watch.stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  const started = Date.now();
  await window.mouse.click(x, y);
  // Right after the click, before waiting for anything.
  const afterClick = await window.evaluate(() => (window as unknown as { __shown: () => Shown }).__shown());
  try {
    await window.waitForFunction(
      (expected) => {
        // The watcher's latest frame, so the page is not scanned a second time.
        const state = (window as unknown as { __watch: { latest?: Shown } }).__watch.latest;
        return !!state && state.screens === 1 && state.heading === expected && state.placeholders.length === 0;
      },
      label,
      { polling: "raf", timeout: 30_000 },
    );
  } catch (error) {
    const state = await window.evaluate(() => (window as unknown as { __shown: () => Shown }).__shown());
    throw new Error(`${label} never settled; the shown page was ${JSON.stringify(state)} at ${await window.evaluate(() => location.href)} box ${JSON.stringify(box)}`, { cause: error });
  }
  const ms = Date.now() - started;
  const placeholdersSeen = await window.evaluate(() => {
    const w = window as unknown as { __watch: { stop: boolean; seen: string[] } };
    w.__watch.stop = true;
    return w.__watch.seen;
  });
  return {
    page: label,
    ms,
    placeholdersSeen,
    afterClick: { heading: afterClick.heading, placeholders: afterClick.placeholders },
  };
}

test.describe("page-switch time budget", () => {
  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-xml-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  test("switches between the seven pages within budget, and a revisit asks the engine for nothing", async () => {
    test.setTimeout(600_000);
    const app = await launch(userDataDir, cuepointHome);

    try {
      const window = await ready(app);
      await importCollection(window, writeExport(workspace));
      // The Library is home and already open; wait for its table so round 1 starts from a settled page.
      await expect(window.getByRole("grid", { name: "Library tracks" })).toBeVisible({ timeout: 60_000 });
      await expect(window.getByTestId("library-track-count")).toContainText("5,000 tracks", { timeout: 60_000 });

      await installShownProbe(window);
      const handlerCount = await instrumentIpc(app, CACHED_READ_CHANNELS);
      expect(handlerCount, "ipcMain has invoke handlers to count").toBeGreaterThan(0);

      // The import leaves background work behind (analysis, scans). Its end makes cached reads
      // stale on purpose, so a round starts once no job is active and the counters stand still.
      // `markQuiet` then forgets everything before it; `invalidationsSince` reads what came after.
      const markQuiet = async () => {
        const quietAfterMs = await waitForQuiet(app, window);
        await window.evaluate(() => {
          (window as unknown as { __libraryChanged: number[] }).__libraryChanged = [];
        });
        return { quietAfterMs, jobsFrom: (await jobsLog(app)).length };
      };
      const invalidationsSince = async (jobsFrom: number) => {
        const jobsPoll = (await jobsLog(app)).slice(jobsFrom);
        const libraryChangedEvents = await window.evaluate(
          () => ((window as unknown as { __libraryChanged?: number[] }).__libraryChanged ?? []).length,
        );
        return { jobsPoll, libraryChangedEvents, any: jobsPoll.length > 0 || libraryChangedEvents > 0 };
      };
      type Round = Array<Switch & { calls: Record<string, number> }>;
      // The Library was open already, so it is visited last, as a switch back to it.
      const order: Destination[] = [...DESTINATIONS.slice(1), "Library"];
      const runRound = async (): Promise<{ entries: Round; calls: Record<string, number>; counted: Record<string, number> }> => {
        const entries: Round = [];
        const start = await ipcCalls(app);
        for (const label of order) {
          const before = await ipcCalls(app);
          const result = await switchTo(window, label);
          entries.push({ ...result, calls: diff(await ipcCalls(app), before) });
        }
        const calls = diff(await ipcCalls(app), start);
        const counted = Object.fromEntries(
          Object.entries(calls).filter(([channel]) => CACHED_READ_CHANNELS.includes(channel)),
        );
        return { entries, calls, counted };
      };

      const quiet1 = await markQuiet();
      const quietAfterMs = quiet1.quietAfterMs;

      const first = await runRound();
      const round1 = first.entries;
      // The counter must have counted something, or "no reads on a revisit" proves nothing.
      expect(
        Object.keys(first.counted).length,
        `round 1 counted no cached read at all: ${JSON.stringify(first.calls)}`,
      ).toBeGreaterThan(0);

      const second = await runRound();
      const round2 = second.entries;
      const invalidations = await invalidationsSince(quiet1.jobsFrom);

      // A read that follows a real change (a job ending, a counter moving, an announcement) is
      // the cache doing its job. When something changed, settle and revisit again: that round has
      // nothing left to blame, so it must read nothing.
      let round3: Round = [];
      let round3Calls: Record<string, number> = {};
      let round3Counted: Record<string, number> = {};
      let round3Invalidations: Awaited<ReturnType<typeof invalidationsSince>> | null = null;
      if (invalidations.any) {
        test.info().annotations.push({
          type: "warning",
          description: `rounds 1 and 2 were invalidated, so round 3 repeats the revisit: ${JSON.stringify(invalidations)}`,
        });
        const quiet3 = await markQuiet();
        const third = await runRound();
        round3 = third.entries;
        round3Calls = third.calls;
        round3Counted = third.counted;
        round3Invalidations = await invalidationsSince(quiet3.jobsFrom);
        if (round3Invalidations.any) {
          test.info().annotations.push({
            type: "warning",
            description: `round 3 was invalidated too: ${JSON.stringify(round3Invalidations)}`,
          });
          throw new Error(
            `The app never went quiet: round 3 was invalidated as well (${JSON.stringify(round3Invalidations)}).`,
          );
        }
      }
      const revisits: Round = [...round2, ...round3];

      const rendererHeap = await window.evaluate(
        () => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? -1,
      );
      const mainHeap = await app.evaluate(() => process.memoryUsage().heapUsed);

      const measures = {
        tracks: TRACKS,
        ci: CI,
        budgets: { firstVisitMs: FIRST_VISIT_BUDGET_MS, revisitMs: REVISIT_BUDGET_MS, heapBytes: HEAP_BUDGET_BYTES },
        round1,
        round2,
        round2CallsAllChannels: second.calls,
        round2CountedReadCalls: second.counted,
        round3,
        round3CallsAllChannels: round3Calls,
        round3CountedReadCalls: round3Counted,
        quietAfterMs,
        invalidationsSinceQuiet: invalidations,
        round3Invalidations,
        rendererHeapBytes: rendererHeap,
        mainHeapBytes: mainHeap,
      };
      await test.info().attach("page-switch.json", {
        body: JSON.stringify(measures, null, 2),
        contentType: "application/json",
      });
      for (const entry of round1) {
        // eslint-disable-next-line no-console
        console.log(
          `page-switch first visit ${entry.page}: ${entry.ms} ms (budget ${FIRST_VISIT_BUDGET_MS}); ` +
            `calls: ${JSON.stringify(entry.calls)}`,
        );
      }
      for (const entry of revisits) {
        // eslint-disable-next-line no-console
        console.log(
          `page-switch revisit ${entry.page}: ${entry.ms} ms (budget ${REVISIT_BUDGET_MS}); ` +
            `placeholders: ${JSON.stringify(entry.placeholdersSeen)}; calls: ${JSON.stringify(entry.calls)}`,
        );
      }
      // eslint-disable-next-line no-console
      console.log(
        `page-switch heap: renderer ${(rendererHeap / 1024 / 1024).toFixed(1)} MB, ` +
          `main ${(mainHeap / 1024 / 1024).toFixed(1)} MB; ` +
          `counted reads in round 1: ${JSON.stringify(first.counted)}, round 2: ${JSON.stringify(second.counted)}, ` +
          `round 3: ${round3Invalidations ? JSON.stringify(round3Counted) : "not run"}; quiet after ${quietAfterMs} ms; ` +
          `invalidations since quiet (rounds 1-2): ${JSON.stringify({ ...invalidations, any: undefined })}`,
      );

      // Timings: a miss is a warning when asked, a failure otherwise.
      const misses: string[] = [];
      for (const entry of round1) {
        if (entry.ms >= FIRST_VISIT_BUDGET_MS) {
          misses.push(`first visit to ${entry.page} took ${entry.ms} ms (budget ${FIRST_VISIT_BUDGET_MS} ms)`);
        }
      }
      for (const entry of revisits) {
        if (entry.ms >= REVISIT_BUDGET_MS) {
          misses.push(`revisit of ${entry.page} took ${entry.ms} ms (budget ${REVISIT_BUDGET_MS} ms)`);
        }
      }
      if (WARN_ONLY) {
        for (const miss of misses) test.info().annotations.push({ type: "warning", description: miss });
      }

      // Never warn-only: the shape of a revisit, the engine calls, the heap.
      for (const entry of revisits) {
        expect.soft(entry.afterClick.placeholders, `${entry.page}: placeholders right after the click`).toEqual([]);
        expect.soft(entry.placeholdersSeen, `${entry.page}: placeholders at any frame of the revisit`).toEqual([]);
      }
      if (invalidations.any) {
        expect.soft(round3Counted, "engine reads of the cached kinds in round 3, after settling").toEqual({});
      } else {
        expect.soft(second.counted, "engine reads of the cached kinds during round 2, nothing invalidated").toEqual({});
      }
      expect.soft(rendererHeap, "performance.memory is available in the renderer").toBeGreaterThan(0);
      expect.soft(rendererHeap, "renderer JS heap after round 2").toBeLessThan(HEAP_BUDGET_BYTES);
      if (!WARN_ONLY) expect.soft(misses, "switch times over budget").toEqual([]);
    } finally {
      await app.close();
    }
  });
});
