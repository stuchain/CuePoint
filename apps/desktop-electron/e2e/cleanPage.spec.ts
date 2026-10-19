/**
 * The Clean page in the running app (CLEAN-12).
 *
 * The component tests drive the page against a faked bridge. This drives it
 * against a real engine, through a real preload, over a real library, for the
 * things only that can show: the page is reachable from the sidebar, reads
 * what the engine really sends, fills the content region, and has three tabs
 * (Match, Missing files, Duplicates; Health and Fix values left it, K3). Match
 * opens on its Playlists sub-tab (C22).
 *
 * CLEAN-14's `clean.spec.ts` is the phase's full journey, matching included;
 * nothing here matches, so Beatport is never reached.
 *
 * Each launch gets its own `--user-data-dir` and `CUEPOINT_HOME`.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

/** An export of three tracks: two whose files exist, and one that does not. */
function writeExport(dir: string): string {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const tracks = ["Present One", "Present Two", "Gone"].map((name, i) => {
    const file = path.join(music, `${i}.mp3`);
    if (name !== "Gone") writeFileSync(file, "not really audio");
    // A Rekordbox Location is a file URL: "file://localhost/" then the path
    // with no leading slash. Dropping the strip left "file://localhost//var/..."
    // on macOS, whose doubled slash the file check reads as a UNC share
    // ("//server/share") and reports every file under it as missing.
    const location = "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");
    return (
      `<TRACK TrackID="${i + 1}" Name="${name}" Artist="Artist ${i + 1}" ` +
      `Genre="House" Tonality="8A" AverageBpm="124.00" TotalTime="300" Location="${location}"/>`
    );
  });
  const xml = path.join(dir, "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="3">
${tracks.join("\n")}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0"/></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return xml;
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await window.evaluate(() => ((localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.getItem("cuepoint-ui-lab-scale") === "1.25" && localStorage.removeItem("cuepoint-ui-lab-scale")), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
  await window.reload();
  await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
  return window;
}

async function importAndCheck(window: Page, xmlPath: string) {
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
  // The file check follows the import on its own (CLEAN-07); wait for its
  // finding rather than for a time.
  await expect
    .poll(
      async () => {
        const health = await window.evaluate(() => window.cuepoint!.getLibraryHealth!());
        return health.counts.find((count) => count.id === "missing_files")?.count;
      },
      { timeout: 60_000 },
    )
    .toBe(1);
}

test.describe("The Clean page (CLEAN-12)", () => {
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

  test("asks for an import before there is a library", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await window.getByRole("link", { name: "Clean" }).click();
      await expect(window.getByText("No library yet")).toBeVisible();
      // The button goes to the Library and asks it to import; the file chooser is the system's,
      // so it is answered with a cancel.
      await app.evaluate(({ dialog }) => {
        (dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({ canceled: true, filePaths: [] });
      });
      await window.getByRole("button", { name: "Import a Rekordbox file…" }).click();
      await expect(window.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
      await expect(window).toHaveURL(/#\/library/);
    } finally {
      await app.close();
    }
  });

  test("shows the queue and the missing file, from the real engine", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importAndCheck(window, writeExport(workspace));
      await window.getByRole("link", { name: "Clean" }).click();

      // Match opens on Playlists (C22). Nothing is matched yet: the whole library says so,
      // and offers a tick to match it rather than saying "no tracks".
      await expect(window.getByRole("tab", { name: "Playlists", exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await expect(window.getByRole("row").filter({ hasText: "Whole library" })).toHaveAttribute("data-status", "not_matched", {
        timeout: 30_000,
      });
      await expect(window.getByRole("checkbox", { name: "Match Whole library" })).toBeEnabled();
      // There is no Table and no One at a time: the review list opens on a run.
      await expect(window.getByRole("tab", { name: "Table", exact: true })).toHaveCount(0);
      await expect(window.getByRole("tab", { name: /^One at a time/ })).toHaveCount(0);

      await window.getByRole("tab", { name: "Missing files" }).click();
      const missing = window.getByRole("table", { name: "Missing files" });
      await expect(missing.getByText("Gone")).toBeVisible();
      await expect(missing.getByText("Present One")).toHaveCount(0);

      // The tab says how many files are missing, and the one check button is "Check again".
      await expect(window.getByRole("tab", { name: "Missing files, 1" })).toBeVisible();
      await expect(window.getByRole("button", { name: "Check again" })).toBeVisible();
      await expect(window.getByRole("tab", { name: "Health" })).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test("opens on Match ▸ Playlists, with a tick on the whole-library row, one Match button and no header button", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importAndCheck(window, writeExport(workspace));
      await window.getByRole("link", { name: "Clean" }).click();

      await expect(window.getByRole("tab", { name: "Playlists", exact: true })).toHaveAttribute(
        "aria-selected",
        "true",
        { timeout: 30_000 },
      );
      // The export has no playlists: the view says so in one line. Only the whole library has a tick,
      // one Match button under the list starts a match, and there is no button in the header (C22).
      await expect(window.locator("p:visible", { hasText: "No playlists yet" })).toBeVisible();
      await expect(window.getByRole("checkbox", { name: /^Match / })).toHaveCount(1);
      await expect(window.getByRole("checkbox", { name: "Match Whole library" })).toBeEnabled();
      await expect(window.getByRole("button", { name: "Match ticked playlists" })).toBeDisabled();
      // The header has only the Details toggle, the last button of the row.
      await expect(window.getByTestId("clean-header").getByRole("button")).toHaveCount(1);
      await expect(window.getByTestId("clean-header").getByRole("button", { name: "Track details", exact: true })).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("reopens where it was, and fills a wide content region", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importAndCheck(window, writeExport(workspace));
      await window.getByRole("link", { name: "Clean" }).click();
      await window.getByRole("tab", { name: "Duplicates" }).click();
      await expect(window.getByRole("button", { name: "Find duplicates" }).first()).toBeVisible();

      // A renderer reload in the middle of a session keeps the tab (a fresh start is a new launch).
      await window.reload();
      await expect(window.getByRole("tab", { name: /^Duplicates/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(0.4),
      );
      await window.getByRole("tab", { name: /^Match/ }).click();
      const widths = await window.evaluate(() => ({
        main: document.querySelector(".app-main")!.getBoundingClientRect().width,
        page: document.querySelector(".clean-screen")!.getBoundingClientRect().width,
      }));
      expect(widths.main).toBeGreaterThan(1300);
      expect(widths.page).toBeGreaterThanOrEqual(widths.main - 2);
    } finally {
      await app.close();
    }
  });

  test("keeps the match window on screen and shows no intro line above any tab at 1280x800", async () => {
    test.setTimeout(240_000);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(1280, 800);
      });
      await importAndCheck(window, writeExport(workspace));
      await window.getByRole("link", { name: "Clean" }).click();
      await expect(window.getByRole("tab", { name: /^Match/ })).toBeVisible({ timeout: 30_000 });

      const inViewport = async (locator: ReturnType<Page["locator"]>) => {
        const box = await locator.boundingBox();
        const height = await window.evaluate(() => window.innerHeight);
        return box !== null && box.y >= 0 && box.y + box.height <= height;
      };
      const shots = process.env.CUEPOINT_E2E_SHOTS;

      for (const scale of [1.5, 2]) {
        await window.evaluate((value) => localStorage.setItem("cuepoint-ui-lab-scale", String(value)), scale);
        await window.reload();
        await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
        await expect(window.getByRole("tab", { name: /^Match/ })).toBeVisible({ timeout: 30_000 });
        // A reload keeps the history entry the window was opened with, so the match window comes back: close it.
        const leftOpen = window.getByRole("dialog", { name: "Match on Beatport" });
        if (await leftOpen.waitFor({ timeout: 3_000 }).then(() => true, () => false)) {
          await window.keyboard.press("Escape");
          await expect(leftOpen).toHaveCount(0);
        }
        expect(
          await window.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--scale").trim()),
        ).toBe(String(scale));

        // The page has three tabs and no line of introduction above their body (C15b, K3).
        const tabNames = ["Match", "Missing files", "Duplicates"];
        await expect(window.getByRole("tab").filter({ hasText: /^(Match|Missing files|Duplicates)/ })).toHaveCount(3);
        for (const tab of tabNames) {
          await window.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
          await expect(window.locator(".clean-screen__lede"), `${tab} has no intro at ${scale}x`).toHaveCount(0);
          await expect(window.locator(".clean-screen__body")).toBeVisible();
          if (shots) await window.screenshot({ path: path.join(shots, `tab-${tab.split(" ")[0]}-${scale}.png`) });
        }
        await window.getByRole("tab", { name: /^Match/ }).click();

        // The match window keeps its title and its Match button on screen, also with the
        // places list open. It opens from a track's Beatport tab in the Library (a playlist's
        // Match starts a run and opens no window, C22).
        await window.getByRole("link", { name: "Library", exact: true }).click();
        await window.getByRole("table", { name: "Library tracks" }).getByText("Present One").first().click();
        await window.getByRole("tab", { name: "Beatport" }).click();
        await window.getByRole("button", { name: "Match on Beatport", exact: true }).first().click();
        const matching = window.getByRole("dialog", { name: "Match on Beatport" });
        await expect(matching).toBeVisible();
        const title = matching.getByRole("heading", { name: "Match on Beatport" });
        const start = matching.getByRole("button", { name: /^Match / });
        expect(await inViewport(title), `title in view at ${scale}x`).toBe(true);
        expect(await inViewport(start), `Match button in view at ${scale}x`).toBe(true);
        await matching.getByRole("radio", { name: /^Tracks in chosen playlists/ }).click();
        expect(await inViewport(title), `title in view with places at ${scale}x`).toBe(true);
        expect(await inViewport(start), `Match button in view with places at ${scale}x`).toBe(true);
        if (shots) await window.screenshot({ path: path.join(shots, `match-places-${scale}.png`) });
        await matching.getByRole("button", { name: "Cancel" }).click();
      }
    } finally {
      await app.close();
    }
  });
});
