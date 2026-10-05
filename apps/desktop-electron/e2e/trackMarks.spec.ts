/**
 * Cue points and beat grids, imported and shown read-only (WAVE-04, DEC-118).
 *
 * The step's acceptance: the Inspector lists the cues of a fixture library. In
 * the packaged app, the engine's import reads `marks.xml` — every kind of mark,
 * a variable grid and marks CuePoint must refuse — and the Inspector shows
 * each cue on one line and the grid in words. Then a refresh with one cue
 * moved is previewed as one line, applied, and shown.
 *
 * The file dialog cannot be clicked from Playwright, so the import is started
 * through the bridge method the button calls. Everything else is clicking.
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
import { mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const FIXTURE = path.resolve(DESKTOP_ROOT, "../../src/tests/fixtures/rekordbox/marks.xml");

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
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
}

/** Search the page for one title and open it in the Inspector. */
async function inspect(window: Page, title: string) {
  await window.locator(".cp-filter-bar").getByRole("textbox", { name: "Search" }).fill(title);
  const row = window.locator(".track-table__row").filter({ hasText: title }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  const inspector = window.locator(".cp-inspector").first();
  await expect(inspector.getByRole("heading", { name: title })).toBeVisible({ timeout: 30_000 });
  return inspector.getByRole("region", { name: "Cue points and beat grid" });
}

test.describe("Cue points and beat grids (WAVE-04)", () => {
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

  test("the Inspector lists a fixture library's cues, and a refresh moves one", async () => {
    test.setTimeout(240_000);
    const source = path.join(workspace, "collection.xml");
    const original = readFileSync(FIXTURE, "utf-8");
    writeFileSync(source, original, "utf-8");
    const app = await launch(userDataDir, cuepointHome);

    try {
      const window = await ready(app);
      await importCollection(window, source);
      await window.getByRole("link", { name: "Library" }).click();
      await expect(window.getByTestId("library-track-count")).toContainText("5 tracks", {
        timeout: 30_000,
      });

      // --- every kind of mark, in the order the track plays them ---------
      let marks = await inspect(window, "Every Mark");
      await expect(marks.getByRole("heading")).toHaveText("Cues · 4 hot, 5 memory");
      await expect(marks.getByRole("listitem")).toHaveText([
        "Memory · 0:00.0 · Intro",
        "Memory · 0:01.5 · Fade-in · Fade in",
        "Memory · 0:32.0 · Load point · Load here",
        "A · 1:04.0 · Drop",
        "B · 1:36.0",
        "C · 2:00.0–2:07.5 · Loop · Build loop",
        "Memory · 3:00.0–3:02.0 · Loop",
        "H · 5:00.0 · H cue",
        "Memory · 6:00.2 · Fade-out · Fade out",
      ]);
      await expect(marks).toContainText("Beat grid · 128.00 BPM");
      // Rekordbox's own colour beside the cue that has one.
      await expect(
        marks.locator('.cp-track-detail__cue-colour[data-colour="#28e214"]'),
      ).toHaveCount(1);
      // Read-only: nothing among the marks can be typed into or pressed.
      await expect(marks.getByRole("button")).toHaveCount(0);
      await expect(marks.getByRole("textbox")).toHaveCount(0);

      marks = await inspect(window, "Variable Grid");
      await expect(marks).toContainText("Beat grid · variable, 121.00–124.00 BPM");

      // Refused marks are skipped, never shown under a guess.
      marks = await inspect(window, "Malformed Marks");
      await expect(marks.getByRole("listitem")).toHaveText(["Memory · 0:20.0 · Kept"]);

      marks = await inspect(window, "No Marks");
      await expect(marks.getByRole("heading")).toHaveText("No cues");
      await expect(marks).toContainText("No beat grid");

      // --- a refresh that moves one cue ---------------------------------
      writeFileSync(
        source,
        original.replace('Start="64.025" Num="0"', 'Start="65.000" Num="0"'),
        "utf-8",
      );
      const stat = statSync(source);
      utimesSync(source, stat.atime.getTime() / 1000 + 5, stat.mtime.getTime() / 1000 + 5);

      await window.locator(".cp-filter-bar").getByRole("textbox", { name: "Search" }).fill("");
      await window.getByRole("button", { name: /Check for changes/i }).click();
      const dialog = window.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 60_000 });
      await expect(dialog).toContainText("Tracks whose cues or beat grid changed");
      await expect(dialog.getByTestId("count-marks_changed")).toHaveText("1");
      await dialog.getByRole("button", { name: "Apply changes" }).click();
      await expect(dialog).toBeHidden({ timeout: 90_000 });

      marks = await inspect(window, "Every Mark");
      await expect(marks.getByRole("listitem").nth(3)).toHaveText("A · 1:05.0 · Drop", {
        timeout: 30_000,
      });
    } finally {
      await app.close();
    }
  });
});
