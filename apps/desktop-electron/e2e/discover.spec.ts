/**
 * The Discover page, end to end (DISCOVER-10).
 *
 * The specification's journey against a real engine, a real preload and a
 * real library: start a search, watch it in the status strip, open it, add two
 * tracks to the wantlist, and mark one bought. And the state a first visit
 * meets: no Beatport sign-in, said plainly, with the sign-in beside it and the
 * token field still reachable in Settings.
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
  await window.evaluate(() => ((localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.getItem("cuepoint-ui-lab-scale") === "1.25" && localStorage.removeItem("cuepoint-ui-lab-scale")), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
  await window.reload();
  await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
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

  test("says Beatport is not connected, and leads to the sign-in and the token field", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await window.getByRole("link", { name: "Discover" }).click();
      await expect(window.getByRole("heading", { name: "Discover", level: 1 })).toBeVisible();
      await expect(window.getByText("Sign in to Beatport to search its charts and releases.")).toBeVisible({ timeout: 30_000 });
      // Usable without a token: past searches and the wantlist are CuePoint's own.
      // With no library the page offers its tabs from "Dig genre charts".
      await window.getByRole("button", { name: "Dig genre charts" }).click();
      await window.getByRole("tab", { name: "New dig" }).click();
      await expect(window.getByRole("button", { name: "Start dig" })).toBeDisabled();
      await window.getByRole("tab", { name: "Wantlist" }).click();
      await expect(window.getByText("Your wantlist is empty")).toBeVisible();
      await expect(window.getByText("Add tracks from a dig's results with Add to wantlist.")).toBeVisible();

      // The banner offers the sign-in itself; the paste fallback is still in Settings.
      await expect(window.getByRole("button", { name: "Sign in to Beatport" })).toBeVisible();
      await window.getByRole("link", { name: "Settings" }).click();
      await window.getByRole("button", { name: "Paste a token instead" }).click();
      await expect(window.locator("#settings-beatport-token")).toBeVisible({ timeout: 15_000 });
    } finally {
      await app.close();
    }
  });

  test("searches, is watched, and keeps two tracks on the wantlist, one bought", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importLibrary(window, writeExport(workspace));
      await window.evaluate(() => window.cuepoint!.saveBeatportPastedToken("e2e-not-a-real-token"));

      await window.getByRole("link", { name: "Discover" }).click();
      await window.getByRole("tab", { name: "New dig" }).click();
      const panel = window.getByRole("region", { name: "New dig" });
      await expect(panel).toBeVisible({ timeout: 30_000 });
      await expect(window.getByText("Sign in to Beatport to search its charts and releases.")).toHaveCount(0);
      await panel.getByRole("checkbox", { name: "House" }).check();
      await panel.getByRole("button", { name: "Start dig" }).click();

      // The search is a job the status strip follows, stage and all.
      await expect(window.locator(".cp-status")).toContainText(
        /Reading charts|Discovering on Beatport/,
        { timeout: 15_000 },
      );

      // Results opens on it as soon as the engine has made it, and ends with its tracks.
      // The dig's own outcome line; a toast can say the same when the dig ends.
      await expect(window.locator(".discover-run__outcome").getByText("Dig found 3 tracks from 1 chart.", { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      // Results opens on rows of cards; "Everything" is the whole dig as one table.
      await expect(window.getByRole("button", { name: "Chart Journey Selects, 3 tracks" })).toBeVisible({
        timeout: 15_000,
      });
      await window.getByRole("button", { name: "Everything · 3 tracks" }).click();
      const found = "Tracks this dig found";
      await expect(row(window, found, /Harbour Lights/)).toBeVisible({ timeout: 15_000 });
      await expect(window.getByRole("table", { name: found }).getByRole("row")).toHaveCount(4);
      // M85/D12: "From" waits in the Columns list; shown, it says why the dig found the track.
      await window.getByRole("table", { name: found }).getByRole("button", { name: "Columns", exact: true }).click();
      await window.getByRole("dialog").getByRole("checkbox", { name: "From", exact: true }).check();
      await window.keyboard.press("Escape");
      await expect(row(window, found, /Harbour Lights/)).toContainText("On a chart by Mara Veil: “Journey Selects”");

      // Phase 14: at 1,280 × 800 and 1.5×, the run card's ⋯ menu button sits clear of its text
      // and the runs column does not push anything sideways.
      const size = await window.evaluate(() => [window.innerWidth, window.innerHeight, getComputedStyle(document.documentElement).getPropertyValue("--scale").trim()]);
      expect(size[2]).toBe("1.5");
      const card = await window.evaluate(() => {
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        };
        const item = document.querySelector(".discover-runs__row")!;
        const del = item.querySelector("button:not(.discover-runs__item)")!;
        const text = [...item.querySelectorAll(".discover-runs__when, .discover-runs__what, .discover-runs__found")].map(box);
        const list = document.querySelector(".discover-runs-view__list")!;
        const view = document.querySelector(".discover-runs-view")!;
        return {
          del: box(del),
          text,
          width: item.getBoundingClientRect().width,
          listSpill: list.scrollWidth - list.clientWidth,
          viewSpill: view.scrollWidth - view.clientWidth,
          pageSpill: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      expect(card.text.length).toBe(3);
      for (const t of card.text) {
        const apart = card.del.top >= t.bottom || card.del.bottom <= t.top || card.del.left >= t.right || card.del.right <= t.left;
        expect(apart, "the ⋯ button's box is clear of the card's text").toBe(true);
      }
      expect(card.width, "the run card is wide enough to read").toBeGreaterThanOrEqual(240);
      expect(card.listSpill, "the runs column does not scroll sideways").toBeLessThanOrEqual(0);
      expect(card.viewSpill, "the Results tab does not scroll sideways").toBeLessThanOrEqual(0);
      expect(card.pageSpill, "the page does not scroll sideways").toBeLessThanOrEqual(0);
      // A Beatport row is not a library row: Track details says so. It opens by itself only
      // where a selection is a library track (K1, DEC-280), so it is opened from its tab here.
      await window.getByRole("button", { name: "Track details", exact: true }).click();
      await expect(window.getByText(/Tracks found on Beatport are not in your library/)).toBeVisible();
      await window.getByRole("button", { name: "Hide track details" }).click();

      await row(window, found, /Harbour Lights/).locator('[data-column="title"]').click();
      await row(window, found, /Low Tide/).locator('[data-column="title"]').click({ modifiers: ["ControlOrMeta"] });
      // P13: one Beatport menu over the dig table, beside "Add to a Beatport playlist…".
      await window.getByRole("button", { name: "Beatport", exact: true }).click();
      await window.getByRole("menuitem", { name: "Add to wantlist" }).click();
      await expect(window.getByText("Added 2 tracks to the wantlist")).toBeVisible();
      await expect(row(window, found, /Harbour Lights/)).toContainText("On wantlist");

      // Back on the cards: tick the chart and add its tracks. Two are already wanted; the
      // engine adds the third.
      await window.getByRole("button", { name: "All results" }).click();
      await window.getByRole("checkbox", { name: "Tick Journey Selects" }).check();
      await expect(window.getByRole("group", { name: "Ticked cards" })).toContainText(
        "Ticked: Journey Selects · 3 tracks",
        { timeout: 15_000 },
      );
      await window.getByRole("group", { name: "Ticked cards" }).getByRole("button", { name: "Add to wantlist" }).click();
      await expect(window.getByText(/Night Bus.*2 tracks already on it/)).toBeVisible();

      await window.getByRole("tab", { name: "Wantlist" }).click();
      await expect(window.getByRole("table", { name: "Wantlist" }).getByRole("row")).toHaveCount(4, {
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
