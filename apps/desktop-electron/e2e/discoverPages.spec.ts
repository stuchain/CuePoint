/**
 * Artist pages and Similar tracks (DISCOVER-11), and the whole of Phase 9 in
 * the order a person meets it (DISCOVER-12).
 *
 * The specification's journey against a real engine, a real preload, a real
 * library and the real player: from a track in the Library, open its artist's
 * page through the Inspector's credit, play a track from the page, open
 * Similar tracks and queue a suggestion.
 *
 * Nothing here needs Beatport. An artist known only by name is never looked
 * up (DEC-095), so the page's Beatport half says so without asking, and
 * Similar tracks are local (DEC-096). No token is set, and a developer's own
 * is removed from the launch environment.
 *
 * The four tracks are the audio fixtures, a quarter of a second each, so
 * repeat-one is on before anything plays and the volume is at zero, as in
 * `libraryPlayback.spec.ts`. `CUEPOINT_E2E_EXECUTABLE` runs the journey
 * against a packaged build, for example `release/win-unpacked/CuePoint.exe`.
 *
 * The phase journey does need Beatport, and gets a stubbed one:
 * `CUEPOINT_BEATPORT_FIXTURE` names `src/tests/fixtures/beatport/phase/`, which
 * answers Clean's search and track pages and the v4 API — resolution, Mara
 * Veil's chart, her releases, and a playlist to push to — through the real
 * matcher and the real client. `test_phase_journey_fixture.py` holds the file
 * to this journey. The token is a placeholder in a sandboxed config; nothing
 * reaches Beatport.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const AUDIO = path.resolve(DESKTOP_ROOT, "../../src/tests/fixtures/audio");
const PHASE_BEATPORT = path.resolve(
  DESKTOP_ROOT,
  "../../src/tests/fixtures/beatport/phase/fixture.json",
);

/**
 * Two tracks by Mara Veil, one shared with Kiko; Kiko's own; and DJEFF's.
 * Tempos and keys close enough that each has suggestions with reasons.
 */
const TRACKS = [
  { file: "tone.flac", name: "Harbour Lights", artist: "Mara Veil, Kiko", label: "Nightfall Audio", bpm: "124.00", key: "8A", genre: "House", year: "2025" },
  { file: "tone.wav", name: "Low Tide", artist: "Mara Veil", label: "Nightfall Audio", bpm: "124.00", key: "9A", genre: "House", year: "2024" },
  { file: "tone.aiff", name: "Night Bus", artist: "Kiko", label: "Cold Room", bpm: "62.00", key: "8A", genre: "Techno", year: "2023" },
  { file: "tone.m4a", name: "Signal", artist: "DJEFF", label: "Cold Room", bpm: "128.00", key: "8B", genre: "House", year: "2022" },
];

function toLocation(file: string): string {
  const full = path.join(AUDIO, file).split(path.sep).join("/");
  return "file://localhost/" + full.replace(/^\/+/, "");
}

/** The collection; `toMatch` puts the first two tracks in a playlist of that name. */
function writeExport(dir: string, toMatch?: string): string {
  const entries = TRACKS.map(
    (track, index) =>
      `<TRACK TrackID="${index + 1}" Name="${track.name}" Artist="${track.artist}" ` +
      `Label="${track.label}" Genre="${track.genre}" Tonality="${track.key}" ` +
      `AverageBpm="${track.bpm}" Year="${track.year}" TotalTime="1" Location="${toLocation(track.file)}"/>`,
  ).join("\n");
  const target = path.join(dir, "collection.xml");
  writeFileSync(
    target,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0"><COLLECTION Entries="${TRACKS.length}">
${entries}
</COLLECTION><PLAYLISTS><NODE Name="ROOT" Type="0">${
      toMatch
        ? `<NODE Name="${toMatch}" Type="1" KeyType="0" Entries="2"><TRACK Key="1"/><TRACK Key="2"/></NODE>`
        : ""
    }</NODE></PLAYLISTS></DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return target;
}

/** `beatport` names a fixture file; without one there is no Beatport at all. */
function launch(
  userDataDir: string,
  cuepointHome: string,
  beatport?: string,
): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: cuepointHome,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CUEPOINT_SKIP_BEATPORT;
  // The engine prefers this over the config file: a developer's own token
  // must never be what a journey runs on.
  delete env.BEATPORT_ACCESS_TOKEN;
  if (beatport) env.CUEPOINT_BEATPORT_FIXTURE = beatport;
  else delete env.CUEPOINT_BEATPORT_FIXTURE;
  const packaged = process.env.CUEPOINT_E2E_EXECUTABLE;
  return packaged
    ? electron.launch({ executablePath: packaged, args: [`--user-data-dir=${userDataDir}`], env })
    : electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
  });
  await window.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
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
  // Keys come from corrections or accepted matches, not Rekordbox (PAGES-15): type each one.
  await window.evaluate(async () => {
    const c = window.cuepoint!;
    for (const track of (await c.browseLibrary!({ limit: 50 })).tracks) {
      if (track.key) await c.setTrackOverrides!({ trackId: track.id, key: track.key });
    }
  });
  // The Library is home (DEC-100), so it is already open, and it reads the
  // library when it loads: an import made behind its back, through the bridge,
  // is seen on the next load — as it would be after a relaunch.
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
}

/** Wait until no job is running. */
async function idle(window: Page) {
  await expect
    .poll(
      async () =>
        (await window.evaluate(() => window.cuepoint!.listJobs!({ state: "active" }))).active_count,
      { timeout: 90_000 },
    )
    .toBe(0);
}

/** The queue main is holding, read the way the panel reads it. */
async function queueTitles(window: Page): Promise<string[]> {
  return window.evaluate(async () => {
    const page = await window.cuepoint!.player!.queueWindow(0, 200);
    return page.items.map((item: { title: string }) => item.title);
  });
}

async function currentTitle(window: Page): Promise<string | null> {
  return window.evaluate(async () => {
    const state = await window.cuepoint!.player!.getState();
    return state.queue.currentItem?.title ?? null;
  });
}

/** The titles a table shows, top to bottom. */
async function titlesIn(window: Page, table: string): Promise<string[]> {
  return window
    .getByRole("table", { name: table })
    .locator('.track-table__row [data-column="title"]')
    .allInnerTexts()
    .then((values) => values.map((value) => value.trim()).filter(Boolean));
}

/** A row of a Beatport table, by what it shows. */
function bpRow(window: Page, table: string, title: string) {
  return window.getByRole("table", { name: table }).getByRole("row").filter({ hasText: title });
}

/** A row of the Clean page's review queue. */
function queueRow(window: Page, title: string) {
  return window.getByRole("table", { name: "Review queue" }).getByRole("row").filter({ hasText: title });
}

function row(window: Page, table: string, title: string) {
  return window
    .getByRole("table", { name: table })
    .locator(".track-table__row", { hasText: title })
    .first();
}

test.describe("Artist pages and Similar tracks (DISCOVER-11)", () => {
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

  test("from a Library track to its artist's page, playing, and Similar tracks queued", async () => {
    test.setTimeout(240_000);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importLibrary(window, writeExport(workspace));
      await window.evaluate(async () => {
        await window.cuepoint!.player!.setVolume(0);
        await window.cuepoint!.player!.setRepeat("one");
      });

      // --- a track in the Library, and its artist through the Inspector ----
      await window.getByRole("link", { name: "Library" }).click();
      await row(window, "Library tracks", "Harbour Lights").click();
      const inspector = window.locator(".cp-track-detail");
      await expect(inspector.getByRole("heading", { name: "Harbour Lights" })).toBeVisible({
        timeout: 30_000,
      });
      // The credit reads as written, each artist in it a link.
      await expect(inspector.locator(".cp-track-detail__artist")).toHaveText("Mara Veil, Kiko");
      await inspector.getByRole("button", { name: "Mara Veil" }).click();

      // --- the artist's page -----------------------------------------------
      await expect(window.getByRole("heading", { name: "Mara Veil", level: 1 })).toBeVisible({
        timeout: 30_000,
      });
      await expect(window).toHaveURL(/#\/discover\/artist\/name%3Amara%20veil$/);
      await expect(window.getByText("Grouped by name")).toBeVisible();
      await expect(window.getByText("2 tracks in your library")).toBeVisible();
      await expect(window.getByRole("link", { name: "Discover" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      // Newest first; the page is the Library's own query over her name.
      await expect.poll(() => titlesIn(window, "Your tracks")).toEqual(["Harbour Lights", "Low Tide"]);
      // Known by name only, and never looked up on Beatport by name.
      await expect(window.getByText("Known by name only")).toBeVisible();

      // --- play a track from the page (DEC-012) ----------------------------
      await row(window, "Your tracks", "Low Tide").dblclick();
      await expect.poll(() => currentTitle(window), { timeout: 30_000 }).toBe("Low Tide");
      expect(await queueTitles(window)).toEqual(["Harbour Lights", "Low Tide"]);

      // --- Similar tracks for one of her tracks ----------------------------
      await row(window, "Your tracks", "Harbour Lights").click({ button: "right" });
      await window.getByRole("menu").getByRole("menuitem", { name: "Similar tracks" }).click();
      await expect(window).toHaveURL(/#\/discover\/similar\/\d+$/);
      await expect(window.getByRole("heading", { name: "Harbour Lights", level: 1 })).toBeVisible({
        timeout: 30_000,
      });
      // Best first: Low Tide shares the most, Night Bus is at half time.
      await expect
        .poll(() => titlesIn(window, "Similar tracks"), { timeout: 30_000 })
        .toEqual(["Low Tide", "Night Bus", "Signal"]);
      // Each suggestion says why, in words.
      await expect(row(window, "Similar tracks", "Low Tide")).toContainText(
        "One step on the wheel: 8A → 9A",
      );
      await expect(row(window, "Similar tracks", "Night Bus")).toContainText("Half time: 124 → 62");

      // --- queue a suggestion without interrupting (DEC-013) ---------------
      await row(window, "Similar tracks", "Night Bus").click({ button: "right" });
      await window.getByRole("menu").getByRole("menuitem", { name: "Add to queue" }).click();
      await expect(window.getByText("1 track added to the queue")).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(() => queueTitles(window))
        .toEqual(["Harbour Lights", "Low Tide", "Night Bus"]);
      expect(await currentTitle(window)).toBe("Low Tide");
    } finally {
      await app.close();
    }
  });

  test("the whole of Phase 9, in the order a person meets it (DISCOVER-12)", async () => {
    test.setTimeout(420_000);
    const nav = (window: Page) => window.getByRole("navigation", { name: /main navigation/i });
    const found = "Tracks this run found";
    const app = await launch(userDataDir, cuepointHome, PHASE_BEATPORT);
    try {
      const window = await ready(app);
      const inspector = window.locator(".cp-track-detail");

      await test.step("import a library", async () => {
        await importLibrary(window, writeExport(workspace, "To match"));
        await window.evaluate(async () => {
          await window.cuepoint!.player!.setVolume(0);
          await window.cuepoint!.player!.setRepeat("one");
          // A placeholder in the sandboxed config; the fixture answers for Beatport.
          await window.cuepoint!.setBeatportToken("e2e-not-a-real-token");
        });
      });

      await test.step("match and accept two tracks", async () => {
        await nav(window).getByRole("link", { name: "Clean", exact: true }).click();
        await expect(window.getByText("Nothing is matched yet.")).toBeVisible({ timeout: 30_000 });
        await window.getByRole("combobox", { name: "In" }).selectOption({ label: "To match" });
        await window.getByRole("combobox", { name: "Show" }).selectOption("not_matched");
        await expect(queueRow(window, "Low Tide")).toBeVisible({ timeout: 15_000 });
        await window.getByRole("button", { name: "Match all 2" }).click();
        await expect(window.getByText("Matching finished.")).toBeVisible({ timeout: 90_000 });
        await idle(window);
        await window.getByRole("combobox", { name: "Show" }).selectOption("accepted");
        await expect(queueRow(window, "Harbour Lights")).toBeVisible({ timeout: 15_000 });
        await expect(queueRow(window, "Low Tide")).toBeVisible();
      });

      await test.step("resolve identities", async () => {
        await nav(window).getByRole("link", { name: "Discover" }).click();
        const banner = window.getByRole("status", { name: "Resolve Beatport identities" });
        await expect(banner).toContainText("2 matched tracks have not been read from Beatport yet", {
          timeout: 30_000,
        });
        await banner.getByRole("button", { name: "Resolve Beatport identities" }).click();
        await expect(banner).toHaveCount(0, { timeout: 60_000 });
        await idle(window);
      });

      await test.step("run discovery, and see the two accepted tracks hidden as owned", async () => {
        const panel = window.getByRole("region", { name: "New run" });
        await expect(panel).toBeVisible({ timeout: 30_000 });
        await panel.getByRole("checkbox", { name: "House" }).check();
        await panel.getByRole("button", { name: "Start run" }).click();
        // A job the status strip follows (acceptance 2).
        await expect(window.locator(".cp-status")).toContainText(
          /Reading charts|Discovering on Beatport/,
          { timeout: 15_000 },
        );
        await expect(
          window.getByText("Found 4 tracks from 1 chart and 0 releases.", { exact: true }),
        ).toBeVisible({ timeout: 60_000 });
        const rows = window.getByRole("table", { name: found }).getByRole("row");
        // The header and the two tracks nobody owns; the two accepted are counted.
        await expect(rows).toHaveCount(3, { timeout: 15_000 });
        await expect(bpRow(window, found, "Undertow")).toBeVisible();
        await expect(bpRow(window, found, "Salt Air")).toBeVisible();
        await expect(window.getByText("2 owned tracks hidden")).toBeVisible();
        const show = window.getByRole("checkbox", { name: "Show tracks you own" });
        await show.check();
        await expect(rows).toHaveCount(5, { timeout: 15_000 });
        await expect(bpRow(window, found, "Harbour Lights")).toContainText("Owned");
        await expect(bpRow(window, found, "Low Tide")).toContainText("Owned");
        await show.uncheck();
        await expect(rows).toHaveCount(3, { timeout: 15_000 });
      });

      await test.step("add a track to the wantlist, and push two to a Beatport playlist", async () => {
        await bpRow(window, found, "Undertow").click();
        await window.getByRole("button", { name: "Add to wantlist" }).click();
        // One track is named, not counted.
        await expect(window.getByText(/Added .*Undertow.* to the wantlist/)).toBeVisible({
          timeout: 15_000,
        });
        // The add reloads the table; select again only once it has.
        await expect(bpRow(window, found, "Undertow")).toContainText("Wanted", { timeout: 15_000 });
        await bpRow(window, found, "Salt Air").click({ modifiers: ["ControlOrMeta"] });
        await window.getByRole("button", { name: "Push to Beatport playlist…" }).click();
        const dialog = window.getByRole("dialog", { name: "Push to a Beatport playlist" });
        await expect(dialog).toContainText("the 2 selected tracks");
        await dialog.getByLabel("Playlist name").fill("Journey push");
        await dialog.getByRole("button", { name: "Push", exact: true }).click();
        // A refusal would keep the dialog open, saying why.
        await expect(dialog).toHaveCount(0, { timeout: 15_000 });
        const notice = window.getByRole("status", { name: "Beatport playlist" });
        await expect(notice).toContainText("Added 2 tracks to “Journey push” on Beatport.", {
          timeout: 60_000,
        });
        await expect(notice.getByRole("button", { name: "Open the playlist" })).toBeVisible();
        await idle(window);
        await window.getByRole("tab", { name: "Wantlist" }).click();
        const wanted = window.getByRole("table", { name: "Wantlist" }).getByRole("row");
        await expect(wanted).toHaveCount(2, { timeout: 15_000 });
        await expect(bpRow(window, "Wantlist", "Undertow")).toBeVisible();
      });

      await test.step("open an artist page by its Beatport id", async () => {
        await nav(window).getByRole("link", { name: "Library" }).click();
        await row(window, "Library tracks", "Harbour Lights").click();
        await expect(inspector.getByRole("heading", { name: "Harbour Lights" })).toBeVisible({
          timeout: 30_000,
        });
        await inspector.getByRole("button", { name: "Mara Veil" }).click();
        await expect(window).toHaveURL(/#\/discover\/artist\/bp%3A301001$/, { timeout: 30_000 });
        await expect(window.getByRole("heading", { name: "Mara Veil", level: 1 })).toBeVisible();
        await expect(window.getByText("Beatport artist", { exact: true })).toBeVisible();
        await expect.poll(() => titlesIn(window, "Your tracks")).toEqual(["Harbour Lights", "Low Tide"]);
        const releases = "Beatport's releases by this artist";
        await expect(window.getByText(/4 tracks released since .*, 2 owned\./)).toBeVisible({
          timeout: 30_000,
        });
        await expect(bpRow(window, releases, "Low Tide")).toContainText("Owned");
        await expect(bpRow(window, releases, "Salt Air")).not.toContainText("Owned");
      });

      await test.step("open a label page by name, and play from it", async () => {
        await nav(window).getByRole("link", { name: "Library" }).click();
        await row(window, "Library tracks", "Night Bus").click();
        await expect(inspector.getByRole("heading", { name: "Night Bus" })).toBeVisible({
          timeout: 30_000,
        });
        await inspector.getByRole("button", { name: "Cold Room" }).click();
        await expect(window).toHaveURL(/#\/discover\/label\/name%3Acold%20room$/, {
          timeout: 30_000,
        });
        await expect(window.getByText("Grouped by name")).toBeVisible();
        await expect.poll(() => titlesIn(window, "Your tracks")).toEqual(["Night Bus", "Signal"]);
        await expect(window.getByText("Not found on Beatport")).toBeVisible({ timeout: 30_000 });
        await row(window, "Your tracks", "Signal").dblclick();
        await expect.poll(() => currentTitle(window), { timeout: 30_000 }).toBe("Signal");
        expect(await queueTitles(window)).toEqual(["Night Bus", "Signal"]);
      });

      await test.step("open Similar tracks, and queue a suggestion", async () => {
        await row(window, "Your tracks", "Signal").click({ button: "right" });
        await window.getByRole("menu").getByRole("menuitem", { name: "Similar tracks" }).click();
        await expect(window).toHaveURL(/#\/discover\/similar\/\d+$/);
        await expect(window.getByRole("heading", { name: "Signal", level: 1 })).toBeVisible({
          timeout: 30_000,
        });
        await expect
          .poll(() => titlesIn(window, "Similar tracks"), { timeout: 30_000 })
          .toEqual(["Harbour Lights", "Night Bus", "Low Tide"]);
        await expect(row(window, "Similar tracks", "Night Bus")).toContainText("Cold Room");
        await row(window, "Similar tracks", "Low Tide").click({ button: "right" });
        await window.getByRole("menu").getByRole("menuitem", { name: "Add to queue" }).click();
        await expect(window.getByText("1 track added to the queue")).toBeVisible({ timeout: 15_000 });
        await expect.poll(() => queueTitles(window)).toEqual(["Night Bus", "Signal", "Low Tide"]);
        expect(await currentTitle(window)).toBe("Signal");
      });

      await test.step("inCrate's address opens Discover, and the old home the Library", async () => {
        await expect(nav(window).getByRole("link", { name: "Tools" })).toHaveCount(0);
        await expect(nav(window).getByRole("link", { name: "inCrate" })).toHaveCount(0);
        await window.evaluate(() => {
          window.location.hash = "#/incrate";
        });
        await expect(window).toHaveURL(/#\/discover$/, { timeout: 15_000 });
        await expect(window.getByRole("heading", { name: "Discover", level: 1 })).toBeVisible();
        await window.evaluate(() => {
          window.location.hash = "#/";
        });
        await expect(window).toHaveURL(/#\/library$/, { timeout: 15_000 });
        await expect(row(window, "Library tracks", "Signal")).toBeVisible({ timeout: 30_000 });
      });
    } finally {
      await app.close();
    }

    await test.step("relaunch, and land on the Library", async () => {
      const again = await launch(userDataDir, cuepointHome, PHASE_BEATPORT);
      try {
        const window = await again.firstWindow({ timeout: 60_000 });
        await expect(window).toHaveURL(/#\/library$/, { timeout: 30_000 });
        await expect(
          nav(window).getByRole("link", { name: "Library", exact: true }),
        ).toHaveAttribute("aria-current", "page");
        await expect(row(window, "Library tracks", "Harbour Lights")).toBeVisible({ timeout: 60_000 });
        // What the session made is kept: the wantlist and the run (acceptance 2, 5).
        await nav(window).getByRole("link", { name: "Discover" }).click();
        // Discover reopens on the tab used last, which was the wantlist.
        await expect(window.getByRole("tab", { name: "Wantlist" })).toHaveAttribute(
          "aria-selected",
          "true",
          { timeout: 30_000 },
        );
        await expect(bpRow(window, "Wantlist", "Undertow")).toBeVisible({ timeout: 15_000 });
        await window.getByRole("tab", { name: "Runs" }).click();
        await window
          .getByRole("navigation", { name: "Runs" })
          .getByRole("button", { name: /4 tracks found/ })
          .click();
        await expect(window.getByText("Found 4 tracks from 1 chart and 0 releases.")).toBeVisible({
          timeout: 30_000,
        });
        // The same tracks, still owned where they were, and why each was found.
        await expect(window.getByRole("table", { name: found }).getByRole("row")).toHaveCount(3, {
          timeout: 15_000,
        });
        await expect(bpRow(window, found, "Undertow")).toContainText("Harbour Selects");
      } finally {
        await again.close();
      }
    });
  });
});
