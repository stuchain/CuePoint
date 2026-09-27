/**
 * Artist pages and Similar tracks, end to end (DISCOVER-11).
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
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const AUDIO = path.resolve(DESKTOP_ROOT, "../../src/tests/fixtures/audio");

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

function writeExport(dir: string): string {
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
</COLLECTION><PLAYLISTS><NODE Name="ROOT" Type="0"></NODE></PLAYLISTS></DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return target;
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: cuepointHome,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  // No Beatport at all: this journey is the library's and the player's.
  delete env.BEATPORT_ACCESS_TOKEN;
  delete env.CUEPOINT_BEATPORT_FIXTURE;
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
  await expect(window.locator(".cp-status")).toContainText(/Engine connected/i, {
    timeout: 60_000,
  });
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
});
