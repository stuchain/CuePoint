/**
 * The Library's pane and its table share their lines (R3): "All tracks" ends where the search row
 * does, the Collections heading where the Play / Organize bar does, and the "+ New" row where the
 * table's header does, so each divider runs straight across the page and the vertical one is
 * unbroken. Measured in the running app, at 1x and 1.5x, in the 1,264 x 735 page a Windows window
 * leaves, where the filter bar and the toolbar may wrap onto a second line.
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


/** Where each line of the pane and of the table ends, in page pixels, or null when absent. */
async function lineBottoms(win: Page) {
  return win.evaluate(() => {
    const bottom = (selector: string) => {
      const el = document.querySelector(selector);
      return el ? el.getBoundingClientRect().bottom : null;
    };
    return {
      paneAll: bottom(".cp-library-pane__all"),
      searchEnd: bottom(".library-screen__main > div:first-child"),
      paneCollections: bottom(".cp-collections > .cp-playlist-pane__head"),
      toolbarEnd: bottom(".library-toolbar"),
      paneNew: bottom(".cp-collections__create"),
      headerEnd: bottom(".track-table__header"),
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

  test("the pane's lines end where the table side's do, at 1x and 1.5x", async () => {
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

        // The observer writes the right side's heights on a frame after layout, so poll.
        await expect
          .poll(
            async () => {
              const b = await lineBottoms(window);
              if (Object.values(b).some((v) => v == null)) return "missing " + JSON.stringify(b);
              return [
                Math.abs(b.paneAll! - b.searchEnd!),
                Math.abs(b.paneCollections! - b.toolbarEnd!),
                Math.abs(b.paneNew! - b.headerEnd!),
              ].every((gap) => gap <= 0.5)
                ? "aligned"
                : JSON.stringify(b);
            },
            { message: `the lines match at ${scale}x`, timeout: 15_000 },
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
});
