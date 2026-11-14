/**
 * "Plays well next" in Track details, and Discover's Following tab, against a real engine, a real
 * preload, a real library and the real player.
 *
 * Beatport is stubbed by `CUEPOINT_BEATPORT_FIXTURE`, as in `discoverPages.spec.ts`: this spec
 * copies `src/tests/fixtures/beatport/phase/` into a temporary folder and puts its own listings in
 * front of that fixture's, so Mara Veil (artist 301001) and Nightfall Audio (label 40211) both have
 * releases dated relative to today. Nothing reaches Beatport; the token is a placeholder.
 *
 * Set `CUEPOINT_SHOT_DIR` to also take screenshots (at a device scale factor of 2, and again with
 * the window at 1024x700). Without it, no screenshot is taken.
 */
import { test, expect, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";
import { NO_PLAYER, hasPlayer } from "./playerAvailable";
import { clickRowAt } from "./rowClick";
import { launchElectron } from "./support/launchApp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const AUDIO = path.resolve(DESKTOP_ROOT, "../../src/tests/fixtures/audio");
const PHASE_DIR = path.resolve(DESKTOP_ROOT, "../../src/tests/fixtures/beatport/phase");
const SHOTS = process.env.CUEPOINT_SHOT_DIR;

interface TrackSpec {
  file: string;
  name: string;
  artist: string;
  label: string;
  bpm?: string;
  key?: string;
  genre: string;
  year: string;
}

const TRACKS: TrackSpec[] = [
  { file: "tone.flac", name: "Harbour Lights", artist: "Mara Veil, Kiko", label: "Nightfall Audio", bpm: "124.00", key: "8A", genre: "House", year: "2025" },
  { file: "tone.wav", name: "Low Tide", artist: "Mara Veil", label: "Nightfall Audio", bpm: "124.00", key: "9A", genre: "House", year: "2024" },
  { file: "tone.aiff", name: "Night Bus", artist: "Kiko", label: "Cold Room", bpm: "62.00", key: "8A", genre: "Techno", year: "2023" },
  { file: "tone.m4a", name: "Signal", artist: "DJEFF", label: "Cold Room", bpm: "128.00", key: "8B", genre: "House", year: "2022" },
  // Neither a key nor a tempo: nothing to rank by.
  { file: "tone.wav", name: "Mystery", artist: "Unknown", label: "Cold Room", genre: "House", year: "2021" },
];

function toLocation(file: string): string {
  const full = path.join(AUDIO, file).split(path.sep).join("/");
  return "file://localhost/" + full.replace(/^\/+/, "");
}

/** The collection; `toMatch` puts the first two tracks in a playlist of that name. */
function writeExport(dir: string, toMatch?: string): string {
  const entries = TRACKS.map((track, index) => {
    const tonality = track.key ? ` Tonality="${track.key}"` : "";
    const bpm = track.bpm ? ` AverageBpm="${track.bpm}"` : "";
    return (
      `<TRACK TrackID="${index + 1}" Name="${track.name}" Artist="${track.artist}" ` +
      `Label="${track.label}" Genre="${track.genre}"${tonality}${bpm} Year="${track.year}" ` +
      `TotalTime="1" Location="${toLocation(track.file)}"/>`
    );
  }).join("\n");
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

/** A Beatport track as the v4 API lists it. */
function apiTrack(id: number, name: string, daysAgo: number, artists: Array<[number, string]>, owned = false) {
  return {
    new_release_date: `{{today-${daysAgo}}}`,
    publish_date: `{{today-${daysAgo}}}`,
    id,
    name,
    mix_name: "Original Mix",
    slug: name.toLowerCase().replace(/ /g, "-"),
    key: { id: 8, name: "A Minor", camelot_number: 8, camelot_letter: "A" },
    bpm: 124,
    artists: artists.map(([artistId, artistName]) => ({ id: artistId, name: artistName, slug: artistName.toLowerCase().replace(/ /g, "-") })),
    remixers: [],
    genre: { id: 5, name: "House", slug: "house" },
    release: {
      id: 4600000 + id,
      name: name,
      slug: name.toLowerCase().replace(/ /g, "-"),
      label: { id: 40211, name: "Nightfall Audio", slug: "nightfall-audio" },
    },
    owned,
  };
}

/**
 * The phase fixture with a label listing of its own in front: three tracks dated inside the follow
 * window, one of them Salt Air (also on Mara Veil's listing, so it comes from both) and one of them
 * Low Tide, which the library owns (so it is hidden by default).
 */
function writeFixture(dir: string): string {
  cpSync(PHASE_DIR, dir, { recursive: true });
  const file = path.join(dir, "fixture.json");
  const fixture = JSON.parse(readFileSync(file, "utf-8")) as { api: unknown[] };
  const mara: [number, string] = [301001, "Mara Veil"];
  const kiko: [number, string] = [301002, "Kiko"];
  const label = {
    count: 4,
    next: null,
    page: "1/1",
    per_page: 100,
    results: [
      apiTrack(19000005, "Night Drive", 2, [kiko]),
      { ...apiTrack(19000002, "Low Tide", 3, [mara]), release: { id: 4500002, name: "Tides EP", slug: "low-tide", label: { id: 40211, name: "Nightfall Audio", slug: "nightfall-audio" } } },
      apiTrack(19000004, "Salt Air", 5, [mara, kiko]),
      apiTrack(19000006, "Label Cut", 20, [[301003, "Oriel"]]),
    ].map(({ owned: _owned, ...track }) => track),
  };
  fixture.api.unshift({ path: "catalog/tracks", params: { label_id: 40211 }, body: label });
  writeFileSync(file, JSON.stringify(fixture), "utf-8");
  return file;
}

function launch(userDataDir: string, cuepointHome: string, beatport?: string): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CUEPOINT_SKIP_BEATPORT;
  delete env.BEATPORT_ACCESS_TOKEN;
  if (beatport) env.CUEPOINT_BEATPORT_FIXTURE = beatport;
  else delete env.CUEPOINT_BEATPORT_FIXTURE;
  const args = [".", `--user-data-dir=${userDataDir}`];
  if (SHOTS) args.push("--force-device-scale-factor=2");
  return launchElectron({ cwd: DESKTOP_ROOT, args, env });
}

async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
  });
  await window.evaluate(() => {
    localStorage.setItem("cuepoint-onboarding-complete", "1");
    localStorage.setItem("cuepoint-phase14-note-seen", "1");
  });
  await window.reload();
  await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
  return window;
}

async function idle(window: Page) {
  await expect
    .poll(async () => (await window.evaluate(() => window.cuepoint!.listJobs!({ state: "active" }))).active_count, {
      timeout: 90_000,
    })
    .toBe(0);
}

async function importLibrary(window: Page, xml: string) {
  const started = await window.evaluate((file) => window.cuepoint!.startLibraryImport!({ xml_path: file }), xml);
  await expect
    .poll(async () => (await window.evaluate((id) => window.cuepoint!.getJob(id), started.job_id)).state, { timeout: 60_000 })
    .toBe("succeeded");
  await idle(window);
  await window.evaluate(async () => {
    const c = window.cuepoint!;
    for (const track of (await c.browseLibrary!({ limit: 50 })).tracks) {
      if (track.key) await c.setTrackOverrides!({ trackId: track.id, key: track.key });
    }
  });
  await window.reload();
  await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
}

function row(window: Page, table: string, title: string) {
  return window.getByRole("grid", { name: table }).locator(".track-table__row", { hasText: title }).first();
}

async function queueTitles(window: Page): Promise<string[]> {
  return window.evaluate(async () => {
    const page = await window.cuepoint!.player!.queueWindow(0, 200);
    return page.items.map((item: { title: string }) => item.title);
  });
}

async function currentTitle(window: Page): Promise<string | null> {
  return window.evaluate(async () => (await window.cuepoint!.player!.getState()).queue.currentItem?.title ?? null);
}

/**
 * A screenshot at the window's size, then again at 1024x700, when `CUEPOINT_SHOT_DIR` is set.
 * `target` is what to look at; the page is restored to 1440x900 after.
 */
async function shoot(app: ElectronApplication, window: Page, name: string, target?: Locator, narrow?: () => Promise<void>) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  const take = async (file: string) => {
    await window.waitForTimeout(400);
    if (target) await target.screenshot({ path: path.join(SHOTS, file) });
    else await window.screenshot({ path: path.join(SHOTS, file) });
  };
  await take(`${name}.png`);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1024, 700));
  await window.waitForTimeout(600);
  await narrow?.();
  await window.screenshot({ path: path.join(SHOTS, `${name}-1024x700.png`) });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1440, 900));
  await window.waitForTimeout(600);
}

test.describe("Plays well next and Following", () => {
  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-xml-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  test("Plays well next: three picks, Play next, double-click, a played view, and no key or tempo", async () => {
    test.skip(!hasPlayer, NO_PLAYER);
    test.setTimeout(240_000);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importLibrary(window, writeExport(workspace));
      await window.evaluate(async () => {
        await window.cuepoint!.player!.setVolume(0);
        await window.cuepoint!.player!.setRepeat("one");
      });
      await window.getByRole("link", { name: "Library" }).click();

      const inspector = window.locator(".cp-track-detail:visible");
      const section = inspector.getByRole("region", { name: "Plays well next" });
      const picks = section.getByRole("listitem");

      await test.step("a track with a key and tempo lists three picks", async () => {
        await row(window, "Library tracks", "Harbour Lights").click();
        await expect(inspector.getByRole("heading", { name: "Harbour Lights" })).toBeVisible({ timeout: 30_000 });
        await expect(section).toBeVisible({ timeout: 15_000 });
        await expect(picks).toHaveCount(3, { timeout: 30_000 });
        // Best first, each with its key, its tempo and a button.
        await expect(picks.nth(0)).toContainText("Low Tide");
        await expect(picks.nth(1)).toContainText("Night Bus");
        await expect(picks.nth(2)).toContainText("Signal");
        await expect(picks.nth(0)).toContainText("124");
        await expect(picks.nth(0).getByRole("button", { name: "Play next: Low Tide" })).toBeVisible();
        await section.scrollIntoViewIfNeeded();
        await shoot(app, window, "plays-well-next", undefined, async () => {
          // In a window this narrow, Track details folds away; the page header's Details button brings it back.
          const toggle = window.locator('button[aria-label="Track details"]:visible').first();
          if (await toggle.isVisible()) await toggle.click();
          await section.scrollIntoViewIfNeeded();
          await window.waitForTimeout(400);
        });
      });

      await test.step("Play next queues one, and the queue panel shows it next", async () => {
        await window.getByRole("button", { name: "Play next: Night Bus" }).click();
        await expect.poll(() => queueTitles(window), { timeout: 15_000 }).toContain("Night Bus");
        await window.getByRole("button", { name: /Show the queue/ }).click();
        const panel = window.getByRole("complementary", { name: "Playback queue" });
        await expect(panel).toBeVisible();
        await expect(panel.getByRole("option").filter({ hasText: "Night Bus" })).toHaveCount(1);
        // It is no longer a suggestion: it is already coming up.
        await expect(picks.filter({ hasText: "Night Bus" })).toHaveCount(0, { timeout: 15_000 });
        await window.getByRole("button", { name: /Hide the queue/ }).click();
      });

      await test.step("a double-click plays the row now and keeps the rest of the queue", async () => {
        const before = await queueTitles(window);
        await expect(picks.filter({ hasText: "Signal" })).toHaveCount(1);
        await picks.filter({ hasText: "Signal" }).locator(".cp-next-picks__text").dblclick();
        await expect.poll(() => currentTitle(window), { timeout: 30_000 }).toBe("Signal");
        const after = await queueTitles(window);
        for (const title of before) expect(after, `${title} kept`).toContain(title);
        expect(after).toContain("Signal");
      });

      await test.step("playing a whole view from All tracks still shows picks", async () => {
        await clickRowAt(window, row(window, "Library tracks", "Low Tide"), { clickCount: 2 });
        // The clips are a quarter of a second, so which one is current can have moved on by the time it is read:
        // the whole view being the queue is what is asserted.
        await expect
          .poll(() => queueTitles(window), { timeout: 30_000 })
          .toEqual(["Signal", "Night Bus", "Low Tide", "Harbour Lights", "Mystery"]);
        await row(window, "Library tracks", "Harbour Lights").click();
        await expect(inspector.getByRole("heading", { name: "Harbour Lights" })).toBeVisible({ timeout: 30_000 });
        await expect(section).toBeVisible();
        // Whatever it offers, it must say something: rows, or that nothing is close.
        await expect(picks.first().or(section.getByText(/No close matches|could not/))).toBeVisible({ timeout: 30_000 });
        console.log("picks after a whole view was queued:", JSON.stringify(await section.innerText()));
        console.log("queue:", JSON.stringify(await queueTitles(window)));
      });

      await test.step("a track with no key and no tempo says what it needs", async () => {
        await row(window, "Library tracks", "Mystery").click();
        await expect(inspector.getByRole("heading", { name: "Mystery" })).toBeVisible({ timeout: 30_000 });
        await expect(section.getByText("Needs a key or BPM to suggest a next track.")).toBeVisible({ timeout: 15_000 });
        await expect(picks).toHaveCount(0);
      });
    } finally {
      await app.close();
    }
  });

  test("Following: suggestions, follow two, the feed, filter, check again, unfollow, leave and return, artist page", async () => {
    test.setTimeout(420_000);
    const nav = (window: Page) => window.getByRole("navigation", { name: /main navigation/i });
    const fixture = writeFixture(path.join(workspace, "beatport"));
    const app = await launch(userDataDir, cuepointHome, fixture);
    try {
      const window = await ready(app);

      await test.step("import, match and accept the two Beatport tracks, so their credits are linked", async () => {
        await importLibrary(window, writeExport(workspace, "To match"));
        await window.evaluate(async () => {
          await window.cuepoint!.player!.setVolume(0);
          await window.cuepoint!.saveBeatportPastedToken("e2e-not-a-real-token");
        });
        await nav(window).getByRole("link", { name: "Clean", exact: true }).click();
        await window.getByRole("checkbox", { name: "Match To match" }).check();
        await window.getByRole("button", { name: "Match ticked playlists" }).click();
        await idle(window);
        await expect(window.getByRole("region", { name: /^Review / })).toBeVisible({ timeout: 30_000 });
        await nav(window).getByRole("link", { name: "Discover" }).click();
        await expect(window.getByRole("tab", { name: "Results" })).toBeVisible({ timeout: 30_000 });
        await idle(window);
      });

      const following = window.getByRole("region", { name: "Following", exact: true });
      const suggestions = following.getByRole("list", { name: "Suggested artists and labels" });

      await test.step("with no follows, Following suggests the linked names", async () => {
        await window.getByRole("tab", { name: /^Following/ }).click();
        await expect(following.getByRole("heading", { name: "Follow artists and labels" })).toBeVisible({ timeout: 30_000 });
        await expect(suggestions.getByRole("listitem")).toHaveCount(3, { timeout: 30_000 });
        await expect(suggestions).toContainText("Mara Veil");
        await expect(suggestions).toContainText("Nightfall Audio");
        await expect(suggestions).toContainText("Kiko");
        await expect(following.getByRole("button", { name: /^Show what's new \(0 followed\)/ })).toBeDisabled();
        await shoot(app, window, "following-suggestions");
      });

      await test.step("follow two and show what is new", async () => {
        await following.getByRole("button", { name: "Follow Mara Veil" }).click();
        await expect(following.getByRole("button", { name: "Following Mara Veil" })).toBeVisible({ timeout: 15_000 });
        await following.getByRole("button", { name: "Follow Nightfall Audio" }).click();
        await expect(following.getByRole("button", { name: "Following Nightfall Audio" })).toBeVisible({ timeout: 15_000 });
        await following.getByRole("button", { name: "Show what's new (2 followed)" }).click();
      });

      const list = following.getByRole("navigation", { name: "Followed artists and labels" });
      const status = following.getByRole("status").filter({ hasText: /new track/ });
      const feedTable = following.getByRole("grid", { name: "New tracks from who you follow" });
      const titles = () =>
        feedTable
          .locator('.track-table__row [data-column="title"]')
          .allInnerTexts()
          .then((all) => all.map((t) => t.replace(/^Now playing:\s*/, "").replace(/ \(Original Mix\)$/, "").trim()).filter(Boolean));

      await test.step("the feed is the faked listings, newest first, owned hidden, counts agree", async () => {
        // Night Drive (2 days), Salt Air (5, from both follows, once), Undertow (12), Label Cut (20); Low Tide is owned.
        await expect.poll(titles, { timeout: 60_000 }).toEqual(["Night Drive", "Salt Air", "Undertow", "Label Cut"]);
        await expect(status).toContainText("4 new tracks", { timeout: 15_000 });
        await expect(status).toContainText("1 you own hidden");
        // The counts on the left are the status line's.
        await expect(list.getByRole("button", { name: /^All/ })).toContainText("4 new");
        await expect(list.getByRole("button", { name: /^Nightfall Audio/ })).toContainText("4");
        await expect(list.getByRole("button", { name: /^Mara Veil/ })).toContainText("2");
        await shoot(app, window, "following-feed");
      });

      await test.step("pick one follow, and the feed filters", async () => {
        await list.getByRole("button", { name: /^Mara Veil/ }).click();
        await expect.poll(titles, { timeout: 30_000 }).toEqual(["Salt Air", "Undertow"]);
        await expect(status).toContainText("2 new tracks");
        await list.getByRole("button", { name: /^All/ }).click();
        await expect.poll(titles, { timeout: 30_000 }).toHaveLength(4);
      });

      await test.step("Check again runs the check and the feed stays the same", async () => {
        await following.getByRole("button", { name: "Check again" }).click();
        await expect(following.getByRole("button", { name: "Check again" })).toBeEnabled({ timeout: 60_000 });
        await idle(window);
        await expect.poll(titles, { timeout: 30_000 }).toEqual(["Night Drive", "Salt Air", "Undertow", "Label Cut"]);
      });

      await test.step("leave the tab and return: what was seen is no longer new", async () => {
        await window.getByRole("tab", { name: "Results" }).click();
        await window.getByRole("tab", { name: /^Following/ }).click();
        await expect(list.getByRole("button", { name: /^All/ })).toContainText("nothing new", { timeout: 30_000 });
        await expect(feedTable.getByText("Nothing new from the names you follow")).toBeVisible({ timeout: 30_000 });
      });

      await test.step("unfollow one", async () => {
        await list.getByRole("button", { name: /^Mara Veil/ }).click();
        await list.getByRole("button", { name: "Unfollow Mara Veil" }).click();
        await expect(list.getByRole("button", { name: /^Mara Veil/ })).toHaveCount(0, { timeout: 15_000 });
        await expect(list.getByRole("button", { name: /^Nightfall Audio/ })).toBeVisible();
      });

      await test.step("an artist page offers Follow and Following", async () => {
        await window.evaluate(() => {
          window.location.hash = "#/discover/artist/bp%3A301001";
        });
        await expect(window.getByRole("heading", { name: "Mara Veil", level: 1 })).toBeVisible({ timeout: 30_000 });
        const page = window.locator("main.app-main .screen:visible");
        const toggle = page.getByRole("button", { name: /^(Follow|Following)$/ });
        await expect(toggle).toHaveText("Follow", { timeout: 30_000 });
        await toggle.click();
        await expect(toggle).toHaveText("Following", { timeout: 15_000 });
        await shoot(app, window, "artist-follow");
        await toggle.click();
        await expect(toggle).toHaveText("Follow", { timeout: 15_000 });
      });
    } finally {
      await app.close();
    }
  });
});
