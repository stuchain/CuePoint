/**
 * Phase 4 end to end, in the packaged app (LIBUI-10, DEC-039).
 *
 * The renderer tests drive the Library page against a faked bridge: they prove
 * the wiring and the wording, and they cannot prove that the engine sends the
 * shape the page expects, that the SQL orders rows the way the header claims,
 * or that a filter written in the UI's vocabulary compiles to something SQLite
 * accepts. This walks the whole phase in one session of the real app, against a
 * real engine and a real SQLite library:
 *
 *   import -> browse -> scope to a playlist -> sort -> filter -> select ->
 *   inspect -> refresh, and browse again afterwards.
 *
 * The last step is the one worth having. A refresh deletes tracks the table may
 * still be holding, and nothing about a page that looks right before a refresh
 * says anything about how it looks after one.
 *
 * The file dialog cannot be clicked from Playwright, so imports are started
 * through the same bridge method the button calls. Everything else is real
 * clicking. Each launch gets its own `--user-data-dir` and `CUEPOINT_HOME`, so
 * a run never reads or writes the real CuePoint library.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

/** A track, described the way the browser will have to sort and filter it. */
interface TrackSpec {
  id: number;
  bpm: number;
  genre: string;
  artist: string;
}

function spec(id: number): TrackSpec {
  // Two genres and a spread of tempos, so a filter has something to remove and
  // a sort has something to reorder. The artist runs backwards against the id
  // so "sorted by artist" and "in the order it was imported" cannot be
  // mistaken for each other.
  return {
    id,
    bpm: 120 + (id % 20),
    genre: id % 3 === 0 ? "Techno" : "House",
    artist: `Artist ${String(1000 - id).padStart(4, "0")}`,
  };
}

function writeExport(dir: string, tracks: TrackSpec[], name = "collection.xml"): string {
  const entries = tracks
    .map(
      (track) =>
        `<TRACK TrackID="${track.id}" Name="Track ${track.id}" Artist="${track.artist}" ` +
        `Genre="${track.genre}" Tonality="8A" AverageBpm="${track.bpm}.00" Year="2024" ` +
        `TotalTime="360" BitRate="320" Rating="204" PlayCount="3" ` +
        `Album="Album ${track.id}" Label="Label" Comment="note ${track.id}" ` +
        `Location="file://localhost/m/${track.id}.mp3"/>`,
    )
    .join("\n");

  // The playlist is deliberately not in id order: a set list is an order, and
  // "opens as arranged" has to be distinguishable from "opens sorted".
  const members = [tracks[4], tracks[1], tracks[7], tracks[0]]
    .filter(Boolean)
    .map((track) => `<TRACK Key="${track!.id}"/>`)
    .join("");

  const file = path.join(dir, name);
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${tracks.length}">
${entries}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0">
    <NODE Name="Warmup" Type="1" Entries="4">${members}</NODE>
  </NODE></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return file;
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: cuepointHome,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;

  return electron.launch({
    cwd: DESKTOP_ROOT,
    args: [".", `--user-data-dir=${userDataDir}`],
    env,
  });
}

async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  // A desk-sized window. The default in a headless run is small enough that
  // the playlist pane, filter bar and selection strip take the whole height,
  // which is a layout question of its own and not what this test is asking.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
  });
  await window.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  await expect(window.locator(".cp-status")).toContainText(/Engine connected/i, {
    timeout: 60_000,
  });
  return window;
}

async function openLibrary(window: Page) {
  await window.getByRole("link", { name: "Library" }).click();
  await expect(window.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
}

async function importCollection(window: Page, xmlPath: string) {
  const started = await window.evaluate(
    (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
    xmlPath,
  );
  await expect
    .poll(
      async () =>
        (await window.evaluate((id) => window.cuepoint!.getJob!(id), started.job_id))!.state,
      { timeout: 90_000 },
    )
    .toBe("succeeded");
}

/** The page's own search box — the shell has one too, on Ctrl+K. */
function pageSearch(window: Page) {
  return window.locator(".cp-filter-bar").getByRole("textbox", { name: "Search" });
}

/** The titles the table is showing, top to bottom. */
async function visibleTitles(window: Page): Promise<string[]> {
  return window
    .locator('.track-table__row [data-column="title"]')
    .allInnerTexts()
    .then((values) => values.map((value) => value.trim()).filter(Boolean));
}

test.describe("Phase 4 end to end (LIBUI-10)", () => {
  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-xml-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("browses, scopes, sorts, filters, selects, inspects — and survives a refresh", async () => {
    test.setTimeout(240_000);
    const tracks = Array.from({ length: 40 }, (_, index) => spec(index + 1));
    const app = await launch(userDataDir, cuepointHome);

    try {
      const window = await ready(app);
      await importCollection(window, writeExport(workspace, tracks));
      await openLibrary(window);

      const table = window.getByRole("table", { name: "Library tracks" });

      // --- browse -------------------------------------------------------
      await expect(table).toBeVisible({ timeout: 30_000 });
      await expect(window.getByTestId("library-track-count")).toContainText("40 tracks");
      // The whole library opens by artist, and the artists run backwards
      // against the ids — so this is a real ordering, not the import order.
      await expect
        .poll(async () => (await visibleTitles(window))[0], { timeout: 30_000 })
        .toBe("Track 40");

      // --- scope --------------------------------------------------------
      const tree = window.getByRole("tree", { name: "Playlists" });
      await tree.getByText("Warmup", { exact: true }).click();

      await expect
        .poll(async () => (await visibleTitles(window)).slice(0, 4), { timeout: 30_000 })
        .toEqual(["Track 5", "Track 2", "Track 8", "Track 1"]);

      // --- sort ---------------------------------------------------------
      // Sorting a playlist by a column leaves its arrangement behind, which is
      // the point of having both.
      await table.getByRole("button", { name: "Title", exact: true }).click();
      await expect
        .poll(async () => (await visibleTitles(window))[0], { timeout: 30_000 })
        .toBe("Track 1");

      // --- back to the whole library ------------------------------------
      await tree.getByText("All tracks", { exact: true }).click();
      await expect
        .poll(async () => (await visibleTitles(window)).length, { timeout: 30_000 })
        .toBeGreaterThan(4);

      // --- filter -------------------------------------------------------
      await pageSearch(window).fill("Track 12");
      await expect
        .poll(async () => await visibleTitles(window), { timeout: 30_000 })
        .toEqual(["Track 12"]);

      // --- select and inspect -------------------------------------------
      await window.locator(".track-table__row").first().click();
      const inspector = window.locator(".cp-inspector").first();
      await expect(inspector).toContainText("Track 12", { timeout: 30_000 });
      // Fields from three different columns of the row, so an Inspector that
      // rendered only what the table already showed would not pass.
      await expect(inspector).toContainText(/House|Techno/);
      await expect(inspector).toContainText("Album 12");
      await expect(window.getByText(/1 track selected/)).toBeVisible();

      // --- refresh, then browse again -----------------------------------
      await pageSearch(window).fill("");
      // The refreshed export is missing five tracks, which a refresh deletes.
      writeExport(workspace, tracks.slice(0, 35));
      await window.getByRole("button", { name: /Check for changes/i }).click();
      const dialog = window.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 60_000 });
      await dialog.getByRole("button", { name: /Remove 5 tracks and refresh/i }).click();

      await expect(window.getByTestId("library-track-count")).toContainText("35 tracks", {
        timeout: 90_000,
      });
      // The table has to have asked again: the query never changed, but five of
      // the rows it was holding no longer exist.
      await expect
        .poll(async () => (await visibleTitles(window))[0], { timeout: 30_000 })
        .toBe("Track 35");
      await expect(window.getByText(/tracks selected/)).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test("holds a fixed amount of memory while scrolling a large library", async () => {
    // The measured claim in `docs/user-guide/performance.md`. It imports a real
    // collection and scrolls the length of it, sampling the renderer process,
    // because "we only fetch a window" is a design statement until something
    // watches the number.
    test.skip(
      !process.env.CUEPOINT_E2E_MEMORY,
      "long: set CUEPOINT_E2E_MEMORY=1 to measure",
    );
    test.setTimeout(900_000);

    const tracks = Array.from({ length: 50_000 }, (_, index) => spec(index + 1));
    const app = await launch(userDataDir, cuepointHome);

    try {
      const window = await ready(app);
      await importCollection(window, writeExport(workspace, tracks));
      await openLibrary(window);
      await expect(window.getByRole("table", { name: "Library tracks" })).toBeVisible({
        timeout: 60_000,
      });

      // `performance.memory` is bucketed to 10 MB unless Chromium is started
      // with --enable-precise-memory-info, so the renderer process's own
      // working set is the honest number here.
      const rendererKb = async () => {
        const metrics = await app.evaluate(({ app: electronApp }) =>
          electronApp.getAppMetrics().map((entry) => ({
            type: entry.type,
            workingSetSize: entry.memory.workingSetSize,
          })),
        );
        return metrics
          .filter((entry) => entry.type === "Tab" || entry.type === "renderer")
          .reduce((sum, entry) => sum + entry.workingSetSize, 0);
      };

      const scroller = window.locator(".track-table__scroll");
      const before = await rendererKb();

      const lap = async () => {
        for (let step = 1; step <= 50; step += 1) {
          // eslint-disable-next-line no-await-in-loop
          await scroller.evaluate((element, fraction) => {
            element.scrollTop = element.scrollHeight * fraction;
          }, step / 51);
          // eslint-disable-next-line no-await-in-loop
          await window.waitForTimeout(120);
        }
      };

      await lap();
      const afterOne = await rendererKb();
      // A second lap is the question that matters. Some growth on the first is
      // the browser warming up — buffers, fonts, compositing. Growth that
      // repeats is a leak.
      await lap();
      const after = await rendererKb();
      const rows = await window.locator(".track-table__row").count();

      // eslint-disable-next-line no-console
      console.log(
        `renderer working set: ${(before / 1024).toFixed(0)} MB -> ` +
          `${(afterOne / 1024).toFixed(0)} MB after one pass -> ` +
          `${(after / 1024).toFixed(0)} MB after two; ` +
          `${rows} row elements in the DOM`,
      );

      // Tens of rows in the DOM, not fifty thousand.
      expect(rows).toBeLessThan(200);
      // Growth, not a leak: a page that kept every window it loaded would be
      // hundreds of megabytes larger by the end of this. In KB.
      expect(after - before).toBeLessThan(150_000);
      // The second pass over the same 50,000 rows costs a fraction of the
      // first: the window is bounded, so browsing further does not cost more.
      expect(after - afterOne).toBeLessThan((afterOne - before) / 2 + 20_000);
    } finally {
      await app.close();
    }
  });
});
