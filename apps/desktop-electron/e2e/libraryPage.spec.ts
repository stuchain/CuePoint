/**
 * The Library page in the running app (LIBRARY-11).
 *
 * The unit tests drive the page against a faked bridge and prove the wording
 * and the flow. This drives it against a real engine, through a real preload,
 * with a real SQLite library underneath — which is where a page that renders
 * perfectly against fixtures still fails, because the shape it was handed is
 * not the shape the engine actually sends.
 *
 * The acceptance criterion is one sentence about a user: import a collection,
 * see it, refresh it, and cancel a refresh at the preview without anything
 * changing. Those are the tests.
 *
 * The file dialog cannot be clicked from Playwright, so the import is started
 * through the same bridge method the button calls; everything after that — the
 * counts, the preview, the confirm, the cancel — is real clicking.
 *
 * Each launch gets its own `--user-data-dir` and `CUEPOINT_HOME`, so a run
 * never reads or writes the real CuePoint library.
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

const TRACK_ATTRS =
  'Genre="House" Tonality="8A" AverageBpm="124.00" Year="2024" ' +
  'TotalTime="360" BitRate="320" Rating="204" PlayCount="3"';

function writeExport(dir: string, ids: number[], name = "collection.xml"): string {
  const entries = ids
    .map(
      (i) =>
        `<TRACK TrackID="${i}" Name="Track ${i}" Artist="Artist ${i}" ${TRACK_ATTRS} ` +
        `Location="file://localhost/m/${i}.mp3"/>`,
    )
    .join("\n");
  const file = path.join(dir, name);
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${ids.length}">
${entries}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0">
    <NODE Name="set" Type="1" Entries="1"><TRACK Key="${ids[0] ?? 0}"/></NODE>
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
  await window.evaluate(() => (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
  return window;
}

/** Navigate to Library by clicking the sidebar entry the registry now renders. */
async function openLibrary(window: Page) {
  await window.getByRole("link", { name: "Library" }).click();
  await expect(window.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
}

/** Import through the bridge — the file dialog itself is not clickable here. */
async function importCollection(window: Page, xmlPath: string) {
  const started = await window.evaluate(
    (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
    xmlPath,
  );
  await expect
    .poll(
      async () =>
        (await window.evaluate((id) => window.cuepoint!.getJob!(id), started.job_id))!.state,
      { timeout: 60_000 },
    )
    .toBe("succeeded");
  // The Library is home (DEC-100), so it is already open, and it reads the
  // library when it loads: an import made behind its back, through the bridge,
  // is seen on the next load — as it would be after a relaunch.
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
}

/**
 * The whole rows the Library table shows at the default window and scale (PAGES-05A,
 * PAGES-05C).
 *
 * As DEC-112 holds Prepare's: the number is measured, held, and a change that loses a
 * row fails here and has to say why. The window is as the app opens it (1,280 × 800 at
 * 1.5×), the header is the three-button one (FLW-11), the filter row is above the table
 * and the toolbar row (FLW-8) directly over it; the notice line is absent, because it
 * shows only after an import. Whoever adds a row or a line to any of them re-measures and
 * moves this number on purpose.
 *
 * Linux measured 2 before 05C (a 155px header, then a selection strip and a Columns row of
 * about 160px under the table), 3 with the toolbar row alone (70px: two lines of 30px
 * buttons) and measures 4 now: the filter row lost the "Search" word above its box (the
 * label stays for screen readers) and Add filter and Tags… dropped their full hit-target
 * floor, which took the filter bar from 162px to 146px and left the table 271px (a 53px
 * header, four 50px rows and 18px over). The toolbar's buttons stay 30px: a taller button
 * costs the 4th row's margin (DEC-217). Windows and macOS are owed a measure and hold one
 * row lower until then.
 */
const ON_LINUX = process.platform === "linux";
const WHOLE_ROWS_LIBRARY_MEASURED = 4;
const WHOLE_ROWS_LIBRARY = ON_LINUX
  ? WHOLE_ROWS_LIBRARY_MEASURED
  : WHOLE_ROWS_LIBRARY_MEASURED - 1;

test.describe("The Library page (LIBRARY-11)", () => {
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

  test("is reachable from the sidebar and says what to do when empty", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);

      // DEC-020's registry: enabling one flag is what put this here.
      await openLibrary(window);

      await expect(window.getByText(/Nothing imported yet/i)).toBeVisible();
      await expect(
        window.getByRole("button", { name: /Import your Rekordbox collection/i }),
      ).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("shows a real imported collection", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      const xmlPath = writeExport(workspace, [0, 1, 2, 3, 4, 5]);

      await importCollection(window, xmlPath);
      await openLibrary(window);

      await expect(window.getByTestId("library-track-count")).toHaveText("6 tracks");
      await expect(window.getByText(xmlPath)).toBeVisible();
      await expect(window.getByText("In sync")).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("shows its whole rows with the three header buttons on one line", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      // Measured with the notice line hidden: the first steps' entry (RUN-3) shares that
      // line, and a library whose first steps are done shows none.
      await window.evaluate(() => localStorage.setItem("cuepoint-first-steps-done", "1"));
      await importCollection(
        window,
        writeExport(
          workspace,
          Array.from({ length: 40 }, (_unused, i) => i),
        ),
      );
      await openLibrary(window);
      const table = window.getByRole("table", { name: "Library tracks" });
      await expect(table.locator(".track-table__row").first()).toBeVisible({ timeout: 30_000 });

      // Three buttons, never a menu, and on one line whatever their labels say.
      const names = ["Check Rekordbox for changes", "Import another file…", "Export to Rekordbox…"];
      const tops: number[] = [];
      const shown: string[] = [];
      for (const name of names) {
        const button = window.locator(".library-header").getByRole("button", { name });
        await expect(button).toBeVisible();
        tops.push((await button.boundingBox())!.y);
        shown.push((await button.innerText()).trim());
      }
      expect(new Set(tops.map(Math.round)).size, `button tops ${tops} (${shown})`).toBe(1);
      console.log("PAGES-05A header labels:", shown);
      // The toolbar row above the table: the selection bar's six groups and Clear
      // selection, then the count and Columns… (FLW-8).
      const bar = window.getByRole("toolbar", { name: "Selected tracks" });
      await expect(bar.getByRole("button")).toHaveCount(7);
      await expect(bar.getByRole("button", { name: "Play", exact: true })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
      await expect(window.getByRole("button", { name: "Columns…" })).toBeVisible();
      // The notice line is not on the page while someone works in the table.
      await expect(window.getByRole("status", { name: "Getting your library ready" })).toHaveCount(0);

      const m = await window.evaluate(() => {
        const box = document.querySelector<HTMLElement>('[role="table"][aria-label="Library tracks"]')!;
        const header = box.querySelector<HTMLElement>(".track-table__header")!;
        const rect = box.getBoundingClientRect();
        const top = Math.max(rect.top + box.clientTop + header.getBoundingClientRect().height, 0);
        const bottom = Math.min(rect.top + box.clientTop + box.clientHeight, window.innerHeight);
        let visibleTop = top;
        let visibleBottom = bottom;
        // What is on screen is what every clipping ancestor lets through.
        for (let el = box.parentElement; el; el = el.parentElement) {
          if (!/(auto|scroll|hidden)/.test(getComputedStyle(el).overflowY)) continue;
          const r = el.getBoundingClientRect();
          visibleTop = Math.max(visibleTop, r.top + el.clientTop);
          visibleBottom = Math.min(visibleBottom, r.top + el.clientTop + el.clientHeight);
        }
        let whole = 0;
        for (const row of box.querySelectorAll<HTMLElement>(".track-table__row")) {
          const r = row.getBoundingClientRect();
          if (r.top >= visibleTop - 0.5 && r.bottom <= visibleBottom + 0.5) whole += 1;
        }
        return {
          whole,
          scale: getComputedStyle(document.documentElement).getPropertyValue("--scale").trim(),
          window: { width: window.innerWidth, height: window.innerHeight },
          headerHeight: document.querySelector(".library-header")!.getBoundingClientRect().height,
          parts: Object.fromEntries(
            [
              ".library-header",
              ".cp-filter-bar",
              ".library-toolbar",
              ".library-screen__table",
              ".track-table__header",
              ".track-table__row",
              ".cp-status",
              ".library-screen__main",
              ".library-screen__body",
            ].map((selector) => {
              const found = document.querySelector<HTMLElement>(selector);
              return [selector, found ? Math.round(found.getBoundingClientRect().height) : null];
            }),
          ),
        };
      });
      console.log("PAGES-05C Library whole rows:", m.whole, JSON.stringify(m));
      // The default window, whose inner height is what the screen leaves it.
      // 1,280 wide outside: a Windows frame takes 16 px of the page's width.
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getSize()[0])).toBe(1280);
      expect(m.window.width).toBeGreaterThanOrEqual(1264);
      expect(m.window.height).toBeGreaterThan(700);
      expect(m.scale).toBe("1.5");
      expect(m.whole, "whole rows the Library shows").toBeGreaterThanOrEqual(WHOLE_ROWS_LIBRARY);
    } finally {
      await app.close();
    }
  });

  test("notices when the export has changed since the import", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      const xmlPath = writeExport(workspace, [0, 1, 2, 3, 4, 5]);
      await importCollection(window, xmlPath);

      // The user re-exports from Rekordbox. The Library, already open as home,
      // read the file's state when it loaded after the import; it reads it
      // again on its next load, as at the next launch. Without the reload this
      // raced that first read, and passed only when the rewrite won.
      writeExport(workspace, [0, 1, 2, 3, 4, 5, 6]);
      await window.reload();
      await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
      await openLibrary(window);

      await expect(window.getByText("Changed in Rekordbox")).toBeVisible();
      await expect(window.getByText(/has changed since your last import/i)).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("cancelling the preview changes nothing (the acceptance criterion)", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(workspace, [0, 1, 2, 3, 4, 5]));
      // Two tracks leave the collection, so the preview has removals to warn
      // about — the case where cancelling matters most.
      writeExport(workspace, [0, 1, 2, 3]);
      await openLibrary(window);

      await window.getByRole("button", { name: /Check Rekordbox for changes/i }).click();
      const dialog = window.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByTestId("count-removed")).toHaveText("2");
      await expect(dialog.getByText(/cannot be undone/i)).toBeVisible();

      await dialog.getByRole("button", { name: "Cancel" }).click();

      await expect(dialog).not.toBeVisible();
      // Still six: the preview wrote nothing and the cancel applied nothing.
      await expect(window.getByTestId("library-track-count")).toHaveText("6 tracks");
      const summary = await window.evaluate(() => window.cuepoint!.getLibrarySummary!());
      expect(summary.track_count).toBe(6);
    } finally {
      await app.close();
    }
  });

  test("confirming the preview applies exactly what it promised", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(workspace, [0, 1, 2, 3, 4, 5]));
      writeExport(workspace, [0, 1, 2, 3, 9]);
      await openLibrary(window);

      await window.getByRole("button", { name: /Check Rekordbox for changes/i }).click();
      const dialog = window.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByTestId("count-added")).toHaveText("1");
      await expect(dialog.getByTestId("count-removed")).toHaveText("2");

      // The irreversible number is on the button, not only in the paragraph.
      await dialog.getByRole("button", { name: /Remove 2 tracks and refresh/i }).click();

      await expect(dialog).not.toBeVisible({ timeout: 30_000 });
      await expect(window.getByTestId("library-track-count")).toHaveText("5 tracks", {
        timeout: 30_000,
      });
      await expect(window.getByText(/2 removed/)).toBeVisible();
      await expect(window.getByText("In sync")).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("two watchers can follow the same job at once", async () => {
    // A regression test, and the real-collection run is what found it. The
    // status strip follows whatever job is running; the Library page follows
    // the job it just started. Those are the same job, from the same renderer,
    // and the supervisor used to cancel the first stream when the second
    // subscribed — so the page waited forever for work the engine had already
    // finished. Small exports hid it, because the job was over before either
    // subscription attached.
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      const xmlPath = writeExport(
        workspace,
        Array.from({ length: 20_000 }, (_unused, i) => i),
        "big.xml",
      );

      const seen = await window.evaluate(async (file) => {
        const started = await window.cuepoint!.startLibraryImport!({ xml_path: file });
        const terminal = ["succeeded", "failed", "cancelled"];
        const wait = (label: string) =>
          new Promise<string>((resolve) => {
            const stop = window.cuepoint!.subscribeJobEvents!(
              started.job_id,
              (event: { state?: string }) => {
                if (event.state && terminal.includes(event.state)) {
                  stop();
                  resolve(`${label}:${event.state}`);
                }
              },
            );
            setTimeout(() => resolve(`${label}:timed-out`), 120_000);
          });

        // Both subscribe before the job can finish, which is the case that
        // used to break.
        return Promise.all([wait("first"), wait("second")]);
      }, xmlPath);

      expect(seen).toEqual(["first:succeeded", "second:succeeded"]);
    } finally {
      await app.close();
    }
  });

  test("says so plainly when a refresh would change nothing", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(workspace, [0, 1, 2]));
      await openLibrary(window);

      await window.getByRole("button", { name: /Check Rekordbox for changes/i }).click();
      const dialog = window.getByRole("dialog");

      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByText(/already matches this export/i)).toBeVisible();
      // Nothing to confirm means no confirm button to press by mistake.
      await expect(
        dialog.getByRole("button", { name: /Remove|Apply changes/i }),
      ).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test("fills a content region wider than the reading width", async () => {
    // Found in CLEAN-12: App.css caps `.app-main .screen` at 1200px and loads
    // after library.css, so the browser's own "the table wants the whole
    // region" lost on any wide display. Zooming out gives the renderer a
    // viewport wider than this machine's screen allows a window to be.
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(workspace, [0, 1, 2]));
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(0.4),
      );
      await openLibrary(window);
      await window.getByRole("table", { name: "Library tracks" }).waitFor();

      const widths = await window.evaluate(() => ({
        main: document.querySelector(".app-main")!.getBoundingClientRect().width,
        page: document.querySelector(".library-screen--browser")!.getBoundingClientRect().width,
      }));
      expect(widths.main).toBeGreaterThan(1300);
      expect(widths.page).toBeGreaterThan(1250);
      expect(widths.page).toBeGreaterThanOrEqual(widths.main - 2);
    } finally {
      await app.close();
    }
  });
});
