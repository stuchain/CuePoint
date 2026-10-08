/**
 * The Discover page, end to end (DISCOVER-10).
 *
 * The specification's journey against a real engine, a real preload and a
 * real library: start a search, watch it in the status strip, open it, add two
 * tracks to the wantlist, and mark one bought. And the state a first visit
 * meets: no Beatport token, said plainly, with a way to the token field.
 *
 * Beatport is stubbed at the engine: `CUEPOINT_BEATPORT_FIXTURE` names
 * `src/tests/fixtures/beatport/discover/fixture.json`, whose `api` entries
 * answer the v4 catalog through the real client — two genres, one chart by the
 * library's artist, its three tracks, held back four seconds so the search can be
 * watched. `test_discover_journey_fixture.py` holds the file to this journey.
 * The token set here is a placeholder in a sandboxed config: nothing reaches
 * Beatport, and a developer's own token is never read.
 *
 * `CUEPOINT_E2E_EXECUTABLE` runs the same journey against a packaged build,
 * for example `release/win-unpacked/CuePoint.exe`; without it the development
 * app runs. Each launch gets its own `--user-data-dir` and `CUEPOINT_HOME`.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const BEATPORT = path.join(REPO_ROOT, "src", "tests", "fixtures", "beatport", "discover", "fixture.json");

/** A collection whose artist curated the fixture's chart, and whose label is on it. */
function writeExport(dir: string): string {
  const xml = path.join(dir, "collection.xml");
  const location = "file://localhost/" + path.join(dir, "harbour.mp3").replace(/\\/g, "/").replace(/^\/+/, "");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="1">
<TRACK TrackID="1" Name="Harbour Walk" Artist="Mara Veil" Label="Nightfall Audio" Genre="House" Tonality="8A" AverageBpm="122.00" TotalTime="300" Location="${location}"/>
  </COLLECTION>
  <PLAYLISTS><NODE Type="0" Name="ROOT" Count="0"/></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return xml;
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: cuepointHome,
    CUEPOINT_BEATPORT_FIXTURE: BEATPORT,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CUEPOINT_SKIP_BEATPORT;
  // The engine prefers this over the config file: a developer's own token
  // must not be what this journey runs on.
  delete env.BEATPORT_ACCESS_TOKEN;
  const packaged = process.env.CUEPOINT_E2E_EXECUTABLE;
  return packaged
    ? electron.launch({ executablePath: packaged, args: [`--user-data-dir=${userDataDir}`], env })
    : electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await window.evaluate(() => (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
  return window;
}

/** Import the collection, and wait for everything that follows an import. */
async function importLibrary(window: Page, xml: string) {
  const started = await window.evaluate(
    (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
    xml,
  );
  await expect
    .poll(
      async () => (await window.evaluate((id) => window.cuepoint!.getJob(id), started.job_id)).state,
      { timeout: 60_000 },
    )
    .toBe("succeeded");
  await expect
    .poll(
      async () =>
        (await window.evaluate(() => window.cuepoint!.listJobs!({ state: "active" }))).active_count,
      { timeout: 90_000 },
    )
    .toBe(0);
}

function row(window: Page, table: string, title: RegExp) {
  return window.getByRole("table", { name: table }).getByRole("row", { name: title });
}

test.describe("The Discover page (DISCOVER-10)", () => {
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

  test("says Beatport is not connected, and leads to the token field", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await window.getByRole("link", { name: "Discover" }).click();
      await expect(window.getByRole("heading", { name: "Discover", level: 1 })).toBeVisible();
      await expect(window.getByText("Connect your Beatport account")).toBeVisible({ timeout: 30_000 });
      // Usable without a token: past searches and the wantlist are CuePoint's own.
      await window.getByRole("tab", { name: "New search" }).click();
      await expect(window.getByRole("button", { name: "Start looking" })).toBeDisabled();
      await window.getByRole("tab", { name: "Wantlist" }).click();
      await expect(window.getByText("Your wantlist is empty.")).toBeVisible();

      await window.getByRole("button", { name: "Open Settings" }).click();
      await expect(window.locator("#settings-beatport-token")).toBeFocused({ timeout: 15_000 });
    } finally {
      await app.close();
    }
  });

  test("searches, is watched, and keeps two tracks on the wantlist, one bought", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importLibrary(window, writeExport(workspace));
      await window.evaluate(() => window.cuepoint!.setBeatportToken("e2e-not-a-real-token"));

      await window.getByRole("link", { name: "Discover" }).click();
      await window.getByRole("tab", { name: "New search" }).click();
      const panel = window.getByRole("region", { name: "New search" });
      await expect(panel).toBeVisible({ timeout: 30_000 });
      await expect(window.getByText("Connect your Beatport account")).toHaveCount(0);
      await panel.getByRole("checkbox", { name: "House" }).check();
      await panel.getByRole("button", { name: "Start looking" }).click();

      // The search is a job the status strip follows, stage and all.
      await expect(window.locator(".cp-status")).toContainText(
        /Reading charts|Discovering on Beatport/,
        { timeout: 15_000 },
      );

      // Results opens on it as soon as the engine has made it, and ends with its tracks.
      await expect(window.getByText("Found 3 tracks from 1 chart and 0 releases.", { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      const found = "Tracks this search found";
      await expect(row(window, found, /Harbour Lights/)).toBeVisible({ timeout: 15_000 });
      await expect(window.getByRole("table", { name: found }).getByRole("row")).toHaveCount(4);
      await expect(row(window, found, /Harbour Lights/)).toContainText("On a chart by Mara Veil: “Journey Selects”");
      // A Beatport row is not a library row: the Inspector says so.
      await expect(window.getByText(/Tracks found on Beatport are not in your library/)).toBeVisible();

      await row(window, found, /Harbour Lights/).locator('[data-column="title"]').click();
      await row(window, found, /Low Tide/).locator('[data-column="title"]').click({ modifiers: ["ControlOrMeta"] });
      await window.getByRole("button", { name: "Add to wantlist" }).click();
      await expect(window.getByText("Added 2 tracks to the wantlist")).toBeVisible();
      await expect(row(window, found, /Harbour Lights/)).toContainText("On wantlist");

      await window.getByRole("tab", { name: "Wantlist" }).click();
      await expect(window.getByRole("table", { name: "Wantlist" }).getByRole("row")).toHaveCount(3, {
        timeout: 15_000,
      });
      await row(window, "Wantlist", /Low Tide/).locator('[data-column="title"]').click();
      await window.getByRole("button", { name: "Mark bought" }).click();
      await expect(window.getByText(/Marked “Low Tide \(Original Mix\)” .* bought/)).toBeVisible();

      await window.getByRole("combobox", { name: "Marked bought" }).selectOption("only");
      await expect(window.getByRole("table", { name: "Wantlist" }).getByRole("row")).toHaveCount(2);
      await expect(row(window, "Wantlist", /Low Tide/)).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
