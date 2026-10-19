/**
 * The Library's pane starts at its own top (with "All tracks") and waits for nothing on the right.
 * The one line it still shares is the table header's: the Collections section ends on the divider
 * that runs straight across to the header's bottom edge, when the window is tall enough to hold it.
 * Otherwise (a small window) the pane is just its content. Measured in the running app, at 1x and
 * 1.5x, in the 1,264 x 735 page a Windows window leaves.
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
import { WINDOWS_INNER, setInnerSize } from "./windowSizes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const SCALE_KEY = "cuepoint-ui-lab-scale";

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
  await window.evaluate(() => ((localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.getItem("cuepoint-ui-lab-scale") === "1.25" && localStorage.removeItem("cuepoint-ui-lab-scale")), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
  await window.reload();
  await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
  return window;
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
  await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
}


/** Where the pane's parts sit, in page pixels, or null when absent. */
async function lines(win: Page) {
  return win.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)?.getBoundingClientRect() ?? null;
    const pane = rect(".cp-library-pane");
    const all = rect(".cp-library-pane__all");
    const collections = rect(".cp-library-pane .cp-collections");
    const header = rect(".track-table__header");
    return {
      allGapFromPaneTop: pane && all ? all.top - pane.top : null,
      collectionsBottom: collections ? collections.bottom : null,
      headerBottom: header ? header.bottom : null,
      sharedVar: document.querySelector('[style*="--library-collections-min"]') !== null,
    };
  });
}

test.describe("The Library's shared lines", () => {
  test.describe.configure({ timeout: 180_000 });

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

  test("All tracks starts at the pane's top and Collections ends on or below the table header's line, at 1x and 1.5x", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(workspace, [1, 2, 3, 4, 5]));
      await setInnerSize(app, window, WINDOWS_INNER);

      for (const scale of ["1", "1.5"]) {
        await window.evaluate(([key, value]) => localStorage.setItem(key!, value!), [SCALE_KEY, scale]);
        await window.reload();
        await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
        await expect(window.locator(".track-table__row").first()).toBeVisible({ timeout: 30_000 });
        await expect
          .poll(() => window.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--scale").trim()))
          .toBe(scale);

        // The observer writes the Collections height on a frame after layout, so poll.
        await expect
          .poll(
            async () => {
              const b = await lines(window);
              if (b.allGapFromPaneTop == null || b.collectionsBottom == null || b.headerBottom == null) {
                return "missing " + JSON.stringify(b);
              }
              // With no toolbar row the header's line is high on the page: a pane whose own rows already
              // run past it is as tall as its content (useSharedLines), and ends below the line, never above it.
              return Math.abs(b.allGapFromPaneTop) <= 1 && b.collectionsBottom - b.headerBottom >= -0.5
                ? "aligned"
                : JSON.stringify(b);
            },
            { message: `All tracks starts at the top and Collections ends on the header's line at ${scale}x`, timeout: 15_000 },
          )
          .toBe("aligned");

        // The vertical rule is one: the table draws no left border of its own.
        const left = await window.evaluate(
          () => getComputedStyle(document.querySelector(".library-screen__table .track-table")!).borderLeftWidth,
        );
        expect(left).toBe("0px");
      }
    } finally {
      await app.close();
    }
  });

  test("in a small window the pane starts at its top and the Playlists heading stays in view", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(workspace, [1, 2, 3, 4, 5]));
      await setInnerSize(app, window, { width: 1024, height: 640 });
      await expect(window.locator(".track-table__row").first()).toBeVisible({ timeout: 30_000 });
      // The shared height is held only while the pane can still show the Playlists heading under
      // it (useSharedLines); either way nothing sits above All tracks.
      expect((await lines(window)).allGapFromPaneTop).toBeLessThanOrEqual(1);
      await expect(window.getByRole("heading", { name: "Playlists" }).or(window.locator(".cp-playlist-pane__head").last())).toBeInViewport();
    } finally {
      await app.close();
    }
  });
});
