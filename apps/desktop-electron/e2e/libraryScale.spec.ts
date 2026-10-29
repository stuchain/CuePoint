/**
 * The packaged app at 50,000 tracks (HARDEN-07, DEC-184). Run only by `scale.yml`.
 *
 * One session of the real app against a real engine and a library of `CUEPOINT_SCALE` tracks
 * (50,000 by default; the scale workflow runs it again at 100,000, recorded and not budgeted):
 *
 *   launch to a usable Library -> import a 250-playlist export end to end (to "Imported your
 *   library") -> scroll to the end -> type a search and see its first row -> sort -> open the
 *   Statistics page and its Health tab -> quit and launch again on the full library
 *
 * Each step is timed, and after each the resident memory of the app's four processes (main, the
 * renderer, the engine and mpv) is read from the operating system (`processMemory.ts`). What the
 * run measured is written to `CUEPOINT_SCALE_JSON`; `scripts/budget_check.py check e2e` holds it
 * to `scripts/budgets.json` afterwards. The spec asserts the app worked, never how long it took,
 * so a slow leg is a budget's to report and not a failed test.
 *
 * It is skipped unless `CUEPOINT_SCALE_E2E=1`, so `npm run test:e2e` and the Intel Mac's
 * packaged run (which takes every spec that names the packaged executable) pass it by. Against
 * `CUEPOINT_E2E_EXECUTABLE` it runs the packaged app, as `scale.yml` does; without it, the
 * source tree.
 *
 * (The sizes spec, `scale.spec.ts`, is about the five text sizes and has nothing to do with this.)
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, createWriteStream } from "node:fs";
import { once } from "node:events";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { waitForEngine } from "./engineReady";
import { footprint, readProcessTable, type Footprint } from "./processMemory";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

const TRACKS = Number(process.env.CUEPOINT_SCALE ?? "50000");
const PLAYLISTS = 250;
const ENTRIES_PER_PLAYLIST = 700;
const OUTPUT = process.env.CUEPOINT_SCALE_JSON ?? path.join(DESKTOP_ROOT, "test-results", "scale-e2e.json");

type Bridge = Record<string, any>;

interface Step {
  name: string;
  ms: number;
  rss: { main_mb: number; renderer_mb: number; engine_mb: number; mpv_mb: number | null };
}

/** `Scale 000042`: ordered by id under every default sort the Library has. */
const title = (id: number): string => `Scale ${String(id).padStart(6, "0")}`;

/**
 * A Rekordbox-shaped export of `TRACKS` tracks and `PLAYLISTS` playlists of
 * `ENTRIES_PER_PLAYLIST` entries each, streamed to disk (the same shape `bench_library.py`
 * imports). The artist runs with the id, so the Library's default order (artist, then title)
 * is the id order and the last row is the last id.
 */
async function writeExport(dir: string): Promise<string> {
  const file = path.join(dir, "collection.xml");
  const out = createWriteStream(file, { encoding: "utf-8" });
  const write = async (text: string) => {
    if (!out.write(text)) await once(out, "drain");
  };
  await write('<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0.0">\n');
  await write(`  <COLLECTION Entries="${TRACKS}">\n`);
  let chunk: string[] = [];
  for (let id = 1; id <= TRACKS; id += 1) {
    chunk.push(
      `    <TRACK TrackID="${id}" Name="${title(id)}" Artist="Artist ${String(id).padStart(6, "0")}" ` +
        `Genre="${["House", "Techno", "Trance", "Disco"][id % 4]}" Tonality="${(id % 12) + 1}${id % 2 ? "A" : "B"}" ` +
        `AverageBpm="${80 + (id % 90)}.00" Year="${1995 + (id % 30)}" TotalTime="${180 + (id % 300)}" ` +
        `BitRate="320" Rating="${(id % 6) * 51}" PlayCount="${id % 40}" Album="Album ${id % 2000}" ` +
        `Label="Label ${id % 120}" Location="file://localhost/music/${Math.floor(id / 1000)}/${id}.mp3"/>`,
    );
    if (chunk.length === 2000) {
      // eslint-disable-next-line no-await-in-loop
      await write(chunk.join("\n") + "\n");
      chunk = [];
    }
  }
  if (chunk.length > 0) await write(chunk.join("\n") + "\n");
  await write("  </COLLECTION>\n");
  await write('  <PLAYLISTS><NODE Name="ROOT" Type="0" Count="1">\n');
  await write(`    <NODE Name="Sets" Type="0" Count="${PLAYLISTS}">\n`);
  for (let p = 0; p < PLAYLISTS; p += 1) {
    const members: string[] = [];
    for (let k = 0; k < Math.min(ENTRIES_PER_PLAYLIST, TRACKS); k += 1) {
      members.push(`<TRACK Key="${((p * 37 + k) % TRACKS) + 1}"/>`);
    }
    // eslint-disable-next-line no-await-in-loop
    await write(`      <NODE Name="set ${String(p).padStart(4, "0")}" Type="1" Entries="${members.length}">${members.join("")}</NODE>\n`);
  }
  await write("    </NODE>\n  </NODE></PLAYLISTS>\n</DJ_PLAYLISTS>\n");
  out.end();
  await once(out, "finish");
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

/** The app's four processes, in MB, read from the OS. */
async function memory(app: ElectronApplication): Promise<Footprint> {
  const { mainPid, rendererPids } = await app.evaluate(({ app: electronApp }) => ({
    mainPid: process.pid,
    rendererPids: electronApp
      .getAppMetrics()
      .filter((entry) => entry.type === "Tab")
      .map((entry) => entry.pid),
  }));
  return footprint(readProcessTable(), mainPid, rendererPids);
}

const pageSearch = (window: Page) => window.locator(".cp-filter-bar").getByRole("searchbox", { name: "Search" });

const rowWithTitle = (window: Page, text: string) =>
  window.locator('.track-table__row [data-column="title"]').filter({ hasText: text }).first();

test.describe("The packaged app at scale (HARDEN-07)", () => {
  // A 100,000-track import is minutes of work, and a retry would double it.
  test.describe.configure({ retries: 0, timeout: 3_600_000 });
  test.skip(process.env.CUEPOINT_SCALE_E2E !== "1", "long: scale.yml sets CUEPOINT_SCALE_E2E=1");

  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-scale-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  test(`launches, imports, browses, searches, sorts and counts ${TRACKS.toLocaleString("en-US")} tracks`, async () => {
    const steps: Step[] = [];
    const record = async (app: ElectronApplication, name: string, started: number) => {
      const ms = Math.round(performance.now() - started);
      const mem = await memory(app);
      steps.push({
        name,
        ms,
        rss: { main_mb: mem.mainMb, renderer_mb: mem.rendererMb, engine_mb: mem.engineMb, mpv_mb: mem.mpvMb },
      });
      // eslint-disable-next-line no-console
      console.log(`${name}: ${ms} ms; main ${mem.mainMb} MB, renderer ${mem.rendererMb} MB, engine ${mem.engineMb} MB, mpv ${mem.mpvMb ?? "-"} MB`);
    };

    const xml = await writeExport(workspace);
    let app: ElectronApplication | null = null;
    try {
      // --- launch to a usable Library ---------------------------------------------------------
      let started = performance.now();
      app = await launch(userDataDir, cuepointHome);
      let window = await app.firstWindow({ timeout: 120_000 });
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
      });
      await window.evaluate(() => {
        localStorage.setItem("cuepoint-onboarding-complete", "1");
        localStorage.setItem("cuepoint-phase14-note-seen", "1");
      });
      await window.reload();
      await waitForEngine(window, 180_000);
      await expect(window.getByRole("heading", { name: "Library", level: 1 })).toBeVisible({ timeout: 60_000 });
      await record(app, "launch", started);

      // --- import, end to end ------------------------------------------------------------------
      // The file dialog cannot be clicked from Playwright; the bridge method is what the button calls.
      started = performance.now();
      const job = await window.evaluate((file) => (window as never as Bridge).cuepoint.startLibraryImport({ xml_path: file }), xml);
      await expect
        .poll(async () => (await window.evaluate((id) => (window as never as Bridge).cuepoint.getJob(id), job.job_id)).state, {
          timeout: 1_800_000,
          intervals: [500],
        })
        .toBe("succeeded");
      // The strip says "Imported your library" for a while after the job ends; a page that
      // never showed it would be a bug worth seeing, but one poll missing a short line is not.
      const stripSaw = await window
        .locator(".cp-status")
        .getByText(/Imported your library/)
        .first()
        .waitFor({ timeout: 5_000 })
        .then(() => true, () => false);
      // The Library reads the library when it loads: an import started through the bridge is seen on reload.
      await window.reload();
      await window.locator("main.app-main .screen:visible").waitFor({ timeout: 60_000 });
      await window.getByRole("link", { name: "Library", exact: true }).click();
      const table = window.getByRole("grid", { name: "Library tracks" });
      await expect(table).toBeVisible({ timeout: 120_000 });
      await expect(rowWithTitle(window, title(1))).toBeVisible({ timeout: 120_000 });
      await expect(window.getByTestId("library-track-count")).toContainText(TRACKS.toLocaleString("en-US"));
      await record(app, "import", started);
      // eslint-disable-next-line no-console
      console.log(`the strip showed "Imported your library": ${stripSaw}`);

      // --- scroll to the end ------------------------------------------------------------------
      started = performance.now();
      await window.locator(".track-table__scroll").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(rowWithTitle(window, title(TRACKS))).toBeVisible({ timeout: 120_000 });
      await record(app, "scroll_end", started);
      await window.locator(".track-table__scroll").evaluate((element) => {
        element.scrollTop = 0;
      });

      // --- type a search and see its first row ------------------------------------------------
      const wanted = title(Math.ceil(TRACKS / 2));
      started = performance.now();
      await pageSearch(window).fill(wanted);
      await expect(rowWithTitle(window, wanted)).toBeVisible({ timeout: 120_000 });
      await expect(window.locator(".track-table__row")).toHaveCount(1, { timeout: 120_000 });
      await record(app, "search", started);
      await pageSearch(window).fill("");
      await expect(rowWithTitle(window, title(1))).toBeVisible({ timeout: 120_000 });

      // --- sort ------------------------------------------------------------------------------
      started = performance.now();
      await table.getByRole("button", { name: "BPM", exact: true }).click();
      await expect(window.locator('[role="columnheader"][data-column="bpm"]')).toHaveAttribute("aria-sort", "ascending", {
        timeout: 120_000,
      });
      await expect(window.locator('.track-table__row [data-column="title"]').first()).toBeVisible({ timeout: 120_000 });
      await record(app, "sort", started);

      // --- the Statistics page, then its Health tab -------------------------------------------
      started = performance.now();
      await window.getByRole("link", { name: "Statistics" }).click();
      await expect(window.getByRole("heading", { name: "Statistics", level: 1 })).toBeVisible();
      await expect(window.locator('[data-figure="time"]')).toBeVisible({ timeout: 180_000 });
      await record(app, "statistics", started);

      started = performance.now();
      await window.getByRole("tablist").getByRole("tab", { name: /^Health/ }).click();
      await expect(window.locator('[data-panel="files"]')).toBeVisible({ timeout: 180_000 });
      await record(app, "statistics_health", started);

      // --- quit, and launch again on the full library -----------------------------------------
      await app.close();
      app = null;
      started = performance.now();
      app = await launch(userDataDir, cuepointHome);
      window = await app.firstWindow({ timeout: 120_000 });
      await waitForEngine(window, 180_000);
      await window.getByRole("link", { name: "Library", exact: true }).click();
      await expect(window.getByRole("grid", { name: "Library tracks" })).toBeVisible({ timeout: 120_000 });
      await expect(window.locator(".track-table__row [data-column=\"title\"]").first()).toBeVisible({ timeout: 120_000 });
      await expect(window.getByTestId("library-track-count")).toContainText(TRACKS.toLocaleString("en-US"));
      await record(app, "relaunch", started);
    } finally {
      await app?.close().catch(() => undefined);
    }

    // What the run measured, in the names `scripts/budgets.json` uses.
    const ms = (name: string) => steps.find((step) => step.name === name)!.ms / 1000;
    const peak = (key: keyof Step["rss"]) =>
      Math.max(0, ...steps.map((step) => step.rss[key]).filter((value): value is number => value !== null));
    const measured: Record<string, number> = {
      launch_s: ms("launch"),
      import_s: ms("import"),
      scroll_end_s: ms("scroll_end"),
      search_s: ms("search"),
      sort_s: ms("sort"),
      statistics_s: ms("statistics"),
      statistics_health_s: ms("statistics_health"),
      relaunch_s: ms("relaunch"),
      main_mb: peak("main_mb"),
      renderer_mb: peak("renderer_mb"),
      engine_mb: peak("engine_mb"),
    };
    // mpv starts with the first track played; a run that never played one has no number for it.
    if (steps.some((step) => step.rss.mpv_mb !== null)) measured.mpv_mb = peak("mpv_mb");
    mkdirSync(path.dirname(OUTPUT), { recursive: true });
    writeFileSync(
      OUTPUT,
      JSON.stringify({ tracks: TRACKS, playlists: PLAYLISTS, packaged: Boolean(process.env.CUEPOINT_E2E_EXECUTABLE), steps, measured }, null, 2) + "\n",
      "utf-8",
    );
    expect(Object.keys(measured).length).toBeGreaterThan(8);
  });
});
