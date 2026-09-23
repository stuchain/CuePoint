/**
 * The Clean page in the running app (CLEAN-12).
 *
 * The component tests drive the page against a faked bridge. This drives it
 * against a real engine, through a real preload, over a real library, for the
 * things only that can show: the page is reachable from the sidebar, reads
 * what the engine really sends, fills the content region, and a Health count
 * opens the Library on exactly the tracks it counts.
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
  await window.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  await expect(window.locator(".cp-status")).toContainText(/Engine connected/i, {
    timeout: 60_000,
  });
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
      await expect(window.getByText("No collection imported yet")).toBeVisible();
      await window.getByRole("button", { name: "Go to the Library" }).click();
      await expect(window.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("shows the queue, the missing file, and Health, from the real engine", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importAndCheck(window, writeExport(workspace));
      await window.getByRole("link", { name: "Clean" }).click();

      // Nothing is matched yet, and the queue says so rather than "no tracks".
      await expect(window.getByText("Nothing is matched yet.")).toBeVisible({ timeout: 30_000 });
      await window.getByRole("button", { name: "Show what is not matched" }).click();
      const queue = window.getByRole("table", { name: "Review queue" });
      await expect(queue.getByText("Present One")).toBeVisible();
      await expect(window.getByRole("button", { name: "Match all 3" })).toBeEnabled();

      await window.getByRole("tab", { name: "Missing files" }).click();
      const missing = window.getByRole("table", { name: "Missing files" });
      await expect(missing.getByText("Gone")).toBeVisible();
      await expect(missing.getByText("Present One")).toHaveCount(0);

      await window.getByRole("tab", { name: "Health" }).click();
      await expect(window.getByRole("list", { name: "Checks" }).getByText("Files checked")).toBeVisible();
      await window
        .getByRole("button", { name: "1 Missing or unreadable files: open in the Library" })
        .click();

      // The count and the Library agree, because they are one rule set.
      const library = window.getByRole("table", { name: "Library tracks" });
      await expect(library.getByText("Gone")).toBeVisible();
      await expect(library.getByText("Present One")).toHaveCount(0);
      await expect(window.getByText(/File status is any of Missing, Unreadable/)).toBeVisible();
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

      await window.reload();
      await expect(window.getByRole("tab", { name: "Duplicates" })).toHaveAttribute(
        "aria-selected",
        "true",
      );

      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]!.webContents.setZoomFactor(0.4),
      );
      await window.getByRole("tab", { name: "Review" }).click();
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
});
