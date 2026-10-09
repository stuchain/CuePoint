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
  await window.evaluate(() => (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
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

      // Nothing is matched yet, and the page offers to match every track
      // rather than saying "no tracks".
      await expect(window.getByText("Match your library on Beatport")).toBeVisible({
        timeout: 30_000,
      });
      await expect(window.getByRole("button", { name: "Match all 3 tracks…" })).toBeEnabled();
      await window.getByRole("combobox", { name: "Show" }).selectOption("not_matched");
      const queue = window.getByRole("table", { name: "Review queue" });
      await expect(queue.getByText("Present One")).toBeVisible();
      await expect(window.getByRole("button", { name: "Match tracks…" })).toBeEnabled();

      await window.getByRole("tab", { name: "Missing files" }).click();
      const missing = window.getByRole("table", { name: "Missing files" });
      await expect(missing.getByText("Gone")).toBeVisible();
      await expect(missing.getByText("Present One")).toHaveCount(0);

      await window.getByRole("tab", { name: "Health" }).click();
      await expect(window.getByRole("list", { name: "Checks" }).getByText("Files on disk")).toBeVisible();
      // A count opens the tab that fixes it (FLW-14)...
      await window
        .getByRole("button", { name: "1 Missing or unreadable files: open Missing files" })
        .click();
      await expect(window.getByRole("tab", { name: /^Missing files/, selected: true })).toBeVisible();
      await expect(window.getByRole("table", { name: "Missing files" }).getByText("Gone")).toBeVisible();

      // ...and one without a tab opens the Library on the same rule as its count.
      await window.getByRole("tab", { name: "Health" }).click();
      await window
        .getByRole("button", { name: /Not matched: open in the Library$/ })
        .click();
      const library = window.getByRole("table", { name: "Library tracks" });
      await expect(library.getByText("Present One")).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("fixes values from the Fix values tab and opens the match window, from the real engine", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importAndCheck(window, writeExport(workspace));
      await window.getByRole("link", { name: "Clean" }).click();

      await window.getByRole("tab", { name: "Fix values" }).click();
      await expect(
        window.getByText("Choose tracks: pick playlists here, or select tracks in the Library and use Fix ▸."),
      ).toBeVisible({ timeout: 30_000 });
      await expect(window.getByRole("button", { name: "Edit values…" })).toBeDisabled();
      await window.getByRole("radio", { name: "The whole library" }).click();
      await expect(window.getByRole("status").filter({ hasText: "3 tracks" })).toBeVisible();
      await window.getByRole("button", { name: "Edit values…" }).click();
      const editor = window.getByRole("dialog", { name: "Edit values" });
      await expect(editor).toBeVisible();
      await editor.getByRole("button", { name: "Cancel" }).click();

      await window.getByRole("button", { name: "Match tracks…" }).click();
      const matching = window.getByRole("dialog", { name: "Match tracks" });
      await expect(matching.getByRole("radio", { name: /^Tracks not looked up yet/ })).toBeChecked();
      await expect(matching).toContainText("CuePoint will search Beatport for 3 tracks.");
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
      await window.getByRole("tab", { name: "Review matches" }).click();
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

  test("keeps the match window on screen and each tab's intro clear of its body at 1280x800", async () => {
    test.setTimeout(240_000);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(1280, 800);
      });
      await importAndCheck(window, writeExport(workspace));
      await window.getByRole("link", { name: "Clean" }).click();
      await expect(window.getByRole("tab", { name: /^Review matches/ })).toBeVisible({ timeout: 30_000 });

      const inViewport = async (locator: ReturnType<Page["locator"]>) => {
        const box = await locator.boundingBox();
        const height = await window.evaluate(() => window.innerHeight);
        return box !== null && box.y >= 0 && box.y + box.height <= height;
      };
      const shots = process.env.CUEPOINT_E2E_SHOTS;

      for (const scale of [1.5, 2]) {
        await window.evaluate((value) => localStorage.setItem("cuepoint-ui-lab-scale", String(value)), scale);
        await window.reload();
        await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
        await expect(window.getByRole("tab", { name: /^Review matches/ })).toBeVisible({ timeout: 30_000 });
        expect(
          await window.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--scale").trim()),
        ).toBe(String(scale));

        // Each tab's one-line introduction sits above its body, not under it.
        for (const tab of ["Review matches", "Fix values", "Missing files", "Duplicates", "Health"]) {
          await window.getByRole("tab", { name: new RegExp(`^${tab}`) }).click();
          const lede = window.locator(".clean-screen__lede");
          await expect(lede).toBeVisible();
          const apart = await window.evaluate(() => {
            const intro = document.querySelector(".clean-screen__lede")!.getBoundingClientRect();
            const body = document.querySelector(".clean-screen__body")!.getBoundingClientRect();
            return { introHeight: intro.height, introBottom: intro.bottom, bodyTop: body.top };
          });
          expect(apart.introHeight, `${tab} intro has height at ${scale}x`).toBeGreaterThan(8);
          expect(apart.introBottom, `${tab} intro ends above its body at ${scale}x`).toBeLessThanOrEqual(
            apart.bodyTop + 1,
          );
          if (shots) await window.screenshot({ path: path.join(shots, `tab-${tab.split(" ")[0]}-${scale}.png`) });
        }

        // The match window keeps its title and Start matching on screen, also
        // with the places list open.
        await window.getByRole("button", { name: "Match tracks…" }).click();
        const matching = window.getByRole("dialog", { name: "Match tracks" });
        await expect(matching).toBeVisible();
        const title = matching.getByRole("heading", { name: "Match tracks" });
        const start = matching.getByRole("button", { name: "Start matching" });
        expect(await inViewport(title), `title in view at ${scale}x`).toBe(true);
        expect(await inViewport(start), `Start matching in view at ${scale}x`).toBe(true);
        await matching.getByRole("radio", { name: /^Tracks in chosen playlists/ }).click();
        expect(await inViewport(title), `title in view with places at ${scale}x`).toBe(true);
        expect(await inViewport(start), `Start matching in view with places at ${scale}x`).toBe(true);
        if (shots) await window.screenshot({ path: path.join(shots, `match-places-${scale}.png`) });
        await matching.getByRole("button", { name: "Cancel" }).click();
      }
    } finally {
      await app.close();
    }
  });
});
