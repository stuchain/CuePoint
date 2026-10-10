/**
 * The website's pictures, taken from the running app (SITE-04).
 *
 * `npm run capture:showcase` opens the development app on the made-up library
 * (`e2e/fixtures/showcase/`), builds what the pictures need through the bridge
 * (an import, the seeded matches, a folder of Collections, a Set with chapters,
 * the waveform analysis, one paused track) and takes a fixed list of shots of the
 * app's window at its default size, 1280 x 800 (DEC-161), in the site's one theme,
 * Neo Dark (DEC-222), at a device scale of 2 so each PNG is 2560 x 1600. The
 * PNGs land in `apps/website/src/assets/app/<id>-neoDark.png` and `shots.json`
 * beside them names each with a draft of its alt text; the website's
 * `shots.test.ts` holds the two together.
 *
 * Nothing on screen is anyone's: the library is written under a neutral root
 * that was not there before, `/Users/dj` (so the paths the Library header and
 * Track details show are a DJ's, not this machine's) or else `C:\DJ` / `/DJ`,
 * or the empty folder `CUEPOINT_SHOWCASE_ROOT` names; a root whose path holds
 * this machine's home folder or user name is refused. Afterwards only what the
 * capture wrote is taken away. Nothing reaches Beatport: the fixture answers.
 *
 * The main suite's config ignores this folder; `captureConfig.test.ts` holds that.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir, userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { untilAnalysed } from "../analysisProgress";
import { waitForEngine } from "../engineReady";
import { NO_PLAYER, hasPlayer } from "../playerAvailable";
import { SEED_MATCHES_PY, buildShowcase, removeWritten, writeShowcase, type Showcase, type Written } from "../fixtures/showcase/showcase";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "..", "..");
const OUT_DIR = path.join(REPO_ROOT, "apps", "website", "src", "assets", "app");

const THEME = "neoDark";
const WINDOW = { width: 1280, height: 800 } as const;
const SCALE = 2;

type Bridge = Record<string, any>;

/**
 * Every picture, in the order it is taken, with the alt text it starts from
 * (home.ts's words, kept to what the picture shows; reviewed by hand once).
 */
const ALT: Record<string, string> = {
  library: "The Library page: the table of tracks with the Collections and playlists beside it, and the Track details panel open on one track, showing its cover, key and waveform.",
  window: "The CuePoint window on a library of tracks, with the Camelot wheel open and the selected track's key lit with the keys that mix with it.",
  waveforms: "The player bar with a paused track's waveform, and Track details showing the track's waveform, loudness and cue points.",
  keys: "The Keys page: the keys of three playlists counted on the Camelot wheel and as a list, with one key opened and its tracks counted beneath.",
  statistics: "The Statistics page's Your library section: four charts of how the whole library spreads by genre, tempo, year and date added, with the count on every bar.",
  prepare: "The Prepare page: a Set as a running order in chapters, with the checks between tracks and the transition strip open on one of them.",
  export: "The Export to Rekordbox window: how many tracks and which playlists the new Rekordbox file will hold, before anything is written.",
  discover: "The Discover page after a search: new tracks found on a Beatport chart by an artist in the library, with their artists and labels.",
  clean: "The Clean page's review queue: the tracks a Beatport match left waiting for a yes or no, with their tempo and genre beside them.",
  "clean-compare": "Clean's comparison for a track that needs review: the library's values beside two Beatport candidates, with their scores, titles and artists.",
};

function python(): string {
  if (process.env.CUEPOINT_PYTHON) return process.env.CUEPOINT_PYTHON;
  const local =
    process.platform === "win32"
      ? path.join(REPO_ROOT, ".venv", "Scripts", "python.exe")
      : path.join(REPO_ROOT, ".venv", "bin", "python");
  if (existsSync(local)) return local;
  return process.platform === "win32" ? "python" : "python3";
}

interface LibraryRoot {
  root: string;
  /** The folders this capture made for the root, deepest first; taken away afterwards if empty. */
  created: string[];
}

/** The folders under `dir` (itself included) that are not there yet, deepest first. */
function missingAncestors(dir: string): string[] {
  const missing: string[] = [];
  for (let at = dir; !existsSync(at); at = path.dirname(at)) {
    missing.push(at);
    if (path.dirname(at) === at) break;
  }
  return missing;
}

/** Make `dir` and whatever is missing above it, and prove it takes a file; what was made, or null. */
function tryMake(dir: string): string[] | null {
  const created = missingAncestors(dir);
  try {
    mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, ".cuepoint-probe");
    writeFileSync(probe, "");
    rmSync(probe);
    return created;
  } catch {
    for (const made of created) {
      try {
        rmdirSync(made);
      } catch {
        // never made, or not ours to take: leave it
      }
    }
    return null;
  }
}

/** The pictures print the path: it must not carry this machine's home folder or user name. */
function assertNeutral(root: string): void {
  const lower = root.toLowerCase();
  const home = homedir().toLowerCase();
  let username = "";
  try {
    username = userInfo().username.toLowerCase();
  } catch {
    // no account name to check against
  }
  for (const [what, value] of [
    ["the home folder", home],
    ["the user name", username],
  ] as const) {
    if (value && lower.includes(value)) {
      throw new Error(`The library root ${root} contains ${what} (${value}), which the pictures would show. Set CUEPOINT_SHOWCASE_ROOT to an empty folder whose path contains no username.`);
    }
  }
}

/**
 * Where the library is written: a path that reads as a DJ's own and was not
 * there before, so nothing of anyone's is touched. `CUEPOINT_SHOWCASE_ROOT`
 * chooses it (an empty folder, or one to make); otherwise `/Users/dj` (a
 * Mac's home; on Windows the same spelling is `C:\Users\dj`) when it does not
 * exist and can be made, else `DJ` at the drive's root (`C:\DJ`, `/DJ`), the
 * same way. A root that exists already is a real account's: it is left alone.
 */
function libraryRoot(): LibraryRoot {
  const asked = process.env.CUEPOINT_SHOWCASE_ROOT;
  if (asked) {
    const root = path.resolve(asked);
    assertNeutral(root);
    if (existsSync(root)) {
      if (!statSync(root).isDirectory() || readdirSync(root).length > 0) {
        throw new Error(`CUEPOINT_SHOWCASE_ROOT=${asked} is not an empty folder; the capture writes only into an empty one it can take away again.`);
      }
      return { root, created: [] };
    }
    const created = tryMake(root);
    if (!created) throw new Error(`CUEPOINT_SHOWCASE_ROOT=${asked} cannot be made.`);
    return { root, created };
  }
  const candidates = [path.resolve("/Users/dj"), path.join(path.parse(tmpdir()).root, "DJ")];
  for (const candidate of candidates) {
    if (existsSync(candidate)) continue;
    const created = tryMake(candidate);
    if (!created) continue;
    assertNeutral(candidate);
    return { root: candidate, created };
  }
  throw new Error(
    `No neutral folder for the library: ${candidates.join(" and ")} exist already or cannot be made here. ` +
      "Set CUEPOINT_SHOWCASE_ROOT to an empty folder whose path contains no username.",
  );
}

/** Take away what the capture wrote, then the folders it made, each only once empty. */
function cleanupLibrary(library: LibraryRoot, written: Written | undefined): void {
  if (written) removeWritten(written);
  for (const dir of library.created) {
    try {
      rmdirSync(dir);
    } catch {
      // not empty, or gone already: leave it
    }
  }
}

function launch(userDataDir: string, cuepointHome: string, fixture: string): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: cuepointHome,
    CUEPOINT_BEATPORT_FIXTURE: fixture,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CUEPOINT_SKIP_BEATPORT;
  delete env.BEATPORT_ACCESS_TOKEN;
  const args = [`--user-data-dir=${userDataDir}`, `--force-device-scale-factor=${SCALE}`];
  const packaged = process.env.CUEPOINT_E2E_EXECUTABLE;
  return packaged
    ? electron.launch({ executablePath: packaged, args, env })
    : electron.launch({ cwd: DESKTOP_ROOT, args: [".", ...args], env });
}

async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await window.evaluate(() => {
    localStorage.setItem("cuepoint-onboarding-complete", "1");
    localStorage.setItem("cuepoint-phase14-note-seen", "1");
  });
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
  return window;
}

/** The window's inner size is the app's default; the pictures are taken at it. */
async function sizeWindow(app: ElectronApplication, window: Page) {
  await app.evaluate(({ BrowserWindow }, size) => {
    const win = BrowserWindow.getAllWindows()[0]!;
    win.setContentSize(size.width, size.height);
  }, WINDOW);
  await expect
    .poll(() => window.evaluate(() => [window.innerWidth, window.innerHeight]), { timeout: 10_000 })
    .toEqual([WINDOW.width, WINDOW.height]);
}

async function idle(window: Page) {
  await expect
    .poll(async () => (await window.evaluate(() => (window as never as Bridge).cuepoint.listJobs({ state: "active" }))).active_count, {
      timeout: 120_000,
    })
    .toBe(0);
}

async function finished(window: Page, jobId: string) {
  await expect
    .poll(async () => (await window.evaluate((id) => (window as never as Bridge).cuepoint.getJob(id), jobId)).state, { timeout: 180_000 })
    .toBe("succeeded");
}

/** Nothing moving: fonts in, no spinner or busy region, no progress bar, a frame or two settled. */
async function settled(window: Page) {
  await window.evaluate(() => document.fonts.ready);
  await expect(window.locator('[aria-busy="true"], .cp-spinner, [role="progressbar"]')).toHaveCount(0, { timeout: 60_000 });
  await window.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await window.waitForTimeout(400);
}

async function shoot(window: Page, id: keyof typeof ALT, taken: Record<string, string>) {
  await settled(window);
  const file = path.join(OUT_DIR, `${id}-${THEME}.png`);
  await window.screenshot({ path: file, type: "png", animations: "disabled", caret: "hide" });
  taken[id] = ALT[id]!;
}

function titleCell(window: Page, title: string): Locator {
  return window.locator('.track-table__row [data-column="title"]', { hasText: title }).first();
}

async function openLibrary(window: Page) {
  await window.getByRole("link", { name: "Library", exact: true }).click();
  await expect(window.getByRole("table", { name: "Library tracks" })).toBeVisible({ timeout: 30_000 });
}

test.describe("the website's pictures (SITE-04)", () => {
  test.describe.configure({ timeout: 900_000 });

  let userDataDir: string;
  let cuepointHome: string;
  let library: LibraryRoot;
  let written: Written | undefined;

  test.beforeAll(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-capture-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-capture-home-"));
    library = libraryRoot();
    mkdirSync(OUT_DIR, { recursive: true });
  });

  test.afterAll(() => {
    for (const dir of [userDataDir, cuepointHome]) rmSync(dir, { recursive: true, force: true });
    cleanupLibrary(library, written);
  });

  test("takes every shot in shots.json from the app on the showcase library", async () => {
    test.skip(!hasPlayer, NO_PLAYER);
    const showcase: Showcase = buildShowcase();
    written = writeShowcase(library.root, showcase);
    const played = showcase.tracks[showcase.playedTrackId - 1]!;
    const taken: Record<string, string> = {};

    const app = await launch(userDataDir, cuepointHome, written.beatportFixture);
    try {
      const window = await ready(app);
      await sizeWindow(app, window);
      const scale = await window.evaluate(() => window.devicePixelRatio);
      expect(scale, "the device scale the pictures are taken at").toBe(SCALE);
      await window.emulateMedia({ reducedMotion: "reduce" });

      await test.step("import the library and seed the matches", async () => {
        const started = await window.evaluate((xml) => (window as never as Bridge).cuepoint.startLibraryImport({ xml_path: xml }), written.xml);
        await finished(window, started.job_id);
        await idle(window);
        execFileSync(python(), ["-c", SEED_MATCHES_PY, written.seedPlan], {
          env: { ...process.env, CUEPOINT_HOME: cuepointHome, PYTHONPATH: path.join(REPO_ROOT, "src") },
          stdio: "inherit",
        });
        await window.evaluate(() => (window as never as Bridge).cuepoint.setBeatportToken("showcase-not-a-real-token"));
      });

      await test.step("a folder of Collections and a Set with chapters", async () => {
        await window.evaluate(
          async ({ rooftop, peak, warmup }) => {
            const c = (window as never as Bridge).cuepoint;
            const playlists = (await c.getLibraryPlaylists()).playlists;
            const byName = (name: string) => playlists.find((node: { name: string }) => node.name === name);
            const tracksOf = async (name: string, max: number): Promise<number[]> => {
              const found = await c.browseLibrary({ playlistId: byName(name).id, limit: max, sort: "title", dir: "asc" });
              return found.tracks.map((row: { id: number }) => row.id);
            };
            const gigs = (await c.createCollection({ kind: "folder", name: "Gigs" })).collection.id;
            const saturday = (await c.createCollection({ kind: "collection", name: "Rooftop, Oct 10", parent_id: gigs })).collection.id;
            await c.addTracksToCollection({ collection_id: saturday, track_ids: await tracksOf(rooftop, 14) });
            const club = (await c.createCollection({ kind: "collection", name: "Club night", parent_id: gigs })).collection.id;
            await c.addTracksToCollection({ collection_id: club, track_ids: await tracksOf(peak, 16) });

            const made = await c.sets.createFrom({ source: { kind: "playlist", id: byName(warmup).id } });
            const id = made.value.set.id;
            const plan = (await c.sets.plan({ set_id: id })).value;
            const entries = plan.entries.map((entry: { entry_id: number }) => entry.entry_id);
            await c.sets.splitChapter({ entry_id: entries[11], name: "Build" });
            await c.sets.splitChapter({ entry_id: entries[22], name: "Peak" });
            const first = (await c.sets.plan({ set_id: id })).value.chapters[0].id;
            await c.sets.updateChapter({ chapter_id: first, name: "Warm-up", target: "45:00" });
          },
          { rooftop: "Rooftop", peak: "Peak time", warmup: "Friday warm-up" },
        );
      });

      await test.step("every waveform drawn", async () => {
        const analysis = () => window.evaluate(async () => (await (window as never as Bridge).cuepoint.waveforms.analysis()).value);
        const now = await analysis();
        if (now.paused || (now.state !== "running" && now.remaining > 0)) {
          await window.evaluate(() => (window as never as Bridge).cuepoint.waveforms.resume());
        }
        await untilAnalysed(analysis, (status) => status.remaining === 0 && status.state !== "running");
        await idle(window);
      });

      await window.reload();
      await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
      await waitForEngine(window);

      await test.step("one track playing, paused a third of the way in", async () => {
        await window.evaluate(
          async ({ title, seconds }) => {
            const c = (window as never as Bridge).cuepoint;
            await c.player.setVolume(0);
            const found = await c.browseLibrary({ q: title, limit: 1 });
            const row = found.tracks[0];
            await c.player.playQueue(
              [{ trackId: row.id, filePath: row.file_path, title: row.title, artist: row.artist, key: row.effective_key ?? null, bpm: row.bpm ?? null, durationSeconds: row.duration_seconds ?? null }],
              0,
            );
            await new Promise((resolve) => setTimeout(resolve, 1500));
            await c.player.seek(seconds);
            await c.player.pause();
          },
          { title: played.title, seconds: Math.round(played.durationSeconds / 3) },
        );
        await expect(window.getByTestId("player-waveform")).toHaveClass(/cp-player-bar__wave--drawn/, { timeout: 30_000 });
      });

      // The track the pictures of the Library open: one of the first rows on
      // screen (the table only draws what is visible), with a key from its match.
      let selected = "";
      const sidebar = async (state: "rail" | "expanded") => {
        const button = window.getByRole("button", { name: state === "rail" ? "Collapse sidebar" : "Expand sidebar" });
        if (await button.count()) await button.click();
        await expect(window.getByRole("button", { name: state === "rail" ? "Expand sidebar" : "Collapse sidebar" })).toBeVisible();
      };
      await test.step("library: the table with Track details open", async () => {
        await openLibrary(window);
        // the sidebar as a rail, the way a person with this window keeps it: the table gets its columns
        await sidebar("rail");
        await expect(window.getByTestId("library-track-count")).toContainText(`${showcase.tracks.length} tracks`, { timeout: 30_000 });
        const rows = window.getByRole("table", { name: "Library tracks" }).locator(".track-table__row");
        await expect(rows.nth(5)).toBeVisible({ timeout: 30_000 });
        for (let i = 2; i < 12 && !selected; i += 1) {
          const key = (await rows.nth(i).locator('[data-column="key"]').innerText()).trim();
          if (/^\d{1,2}[AB]$/.test(key)) selected = (await rows.nth(i).locator('[data-column="title"]').innerText()).trim();
        }
        expect(selected, "a visible row with a key").toBeTruthy();
        await titleCell(window, selected).click();
        const details = window.getByRole("complementary", { name: "Track details" });
        await expect(details).toBeVisible();
        await expect(details.locator("[data-testid=inspector-waveform] canvas")).toBeVisible({ timeout: 30_000 });
        await shoot(window, "library", taken);
      });

      await test.step("window: the Camelot wheel open on the selected track's key", async () => {
        // the whole window, with the sidebar's page names on it
        await sidebar("expanded");
        await window.getByRole("button", { name: "Camelot wheel", exact: true }).click();
        const wheel = window.getByRole("dialog", { name: "Camelot wheel" });
        await expect(wheel).toContainText(`Selected: ${selected}`, { timeout: 15_000 });
        await expect(wheel.locator("[data-lit]").first()).toBeVisible();
        await shoot(window, "window", taken);
        // the button closes it too; Escape would also clear the table's selection
        await window.getByRole("button", { name: "Camelot wheel", exact: true }).click();
        await expect(wheel).toBeHidden();
      });

      await sidebar("rail");

      await test.step("waveforms: the player bar and Track details' waveform, loudness and cues", async () => {
        await titleCell(window, selected).click();
        const details = window.getByRole("complementary", { name: "Track details" });
        await expect(details.locator("[data-testid=inspector-waveform] canvas")).toBeVisible({ timeout: 30_000 });
        // fold Yours and Rekordbox's details, so the waveform, its loudness and the cues sit together
        for (const name of [/^Yours/, /^Details from Rekordbox/]) {
          const toggle = details.getByRole("button", { name });
          if ((await toggle.getAttribute("aria-expanded")) === "true") await toggle.click();
        }
        const cues = details.getByRole("button", { name: /^Cue points/ });
        if ((await cues.getAttribute("aria-expanded")) === "false") await cues.click();
        await details.locator("[data-testid=inspector-waveform]").evaluate((el) => el.scrollIntoView({ block: "start" }));
        await expect(cues).toBeInViewport();
        await shoot(window, "waveforms", taken);
      });

      await test.step("keys: one playlist counted, one key opened", async () => {
        await window.getByRole("link", { name: "Keys", exact: true }).click();
        await expect(window.getByRole("heading", { name: "Keys", level: 1 })).toBeVisible();
        const sources = window.getByRole("group", { name: "Sources" });
        for (const name of ["Peak time", "Festival set", "Rooftop"]) await sources.getByRole("checkbox", { name, exact: true }).check();
        await expect(window.getByRole("status").filter({ hasText: "in 3 playlists" })).toBeVisible({ timeout: 30_000 });
        const list = window.getByRole("group", { name: "Keys in these sources" });
        // the key with the most tracks in it
        const counts = await list.locator(".keys-counts__count").allInnerTexts();
        const best = counts.map((text, index) => ({ n: Number(text.replace(/\D/g, "")) || 0, index })).sort((a, b) => b.n - a.n)[0]!;
        await list.getByRole("button").nth(best.index).click();
        await expect(window.locator(".track-table__row").first()).toBeVisible({ timeout: 30_000 });
        // the wheel and the counts at the top, the tracks under them
        await window.getByRole("heading", { name: "Keys", level: 1 }).evaluate((el) => el.scrollIntoView({ block: "start" }));
        await shoot(window, "keys", taken);
      });

      await test.step("statistics: how the whole library spreads", async () => {
        await window.getByRole("link", { name: "Statistics", exact: true }).click();
        await expect(window.getByRole("heading", { name: "Statistics", level: 1 })).toBeVisible();
        await expect(window.getByRole("combobox", { name: "Scope" })).toHaveValue("library", { timeout: 30_000 });
        const plays = window.getByRole("region", { name: "Plays" });
        const library = window.getByRole("region", { name: "Your library" });
        const health = window.getByRole("region", { name: "Health" });
        await expect(plays.getByRole("list", { name: "Most played" })).toBeVisible({ timeout: 30_000 });
        await expect(library.locator('[data-panel="genre"]')).toBeVisible({ timeout: 30_000 });
        await expect(health.locator('[data-panel="files"]')).toBeVisible({ timeout: 30_000 });
        // nothing is selected on this page: the panel away gives the sections their width
        const hide = window.getByRole("button", { name: "Hide track details" });
        if (await hide.count()) await hide.click();
        // the page is taller than the window: the spreads, four charts that show the library at a
        // glance, are the picture (the Plays list above them is a list; the scope sits above that)
        await window.getByRole("heading", { name: "Your library", level: 2 }).evaluate((el) => el.scrollIntoView({ block: "start" }));
        await expect(library.locator('[data-panel="genre"]')).toBeInViewport();
        await expect(library.locator('[data-panel="tempo"]')).toBeInViewport();
        await shoot(window, "statistics", taken);
      });

      await test.step("prepare: the Set in chapters, with the transition strip", async () => {
        await window.getByRole("link", { name: "Prepare", exact: true }).click();
        await expect(window).toHaveURL(/#\/prepare\/\d+$/, { timeout: 30_000 });
        const table = window.getByRole("table", { name: "Set entries" });
        await expect(table).toBeVisible({ timeout: 30_000 });
        await expect(table.locator(".track-table__row").nth(3)).toBeVisible();
        await window.getByRole("button", { name: "View ▾" }).click();
        await window.getByRole("menuitem", { name: "Show transition strip" }).click();
        await expect(window.getByRole("region", { name: "Transition" })).toBeVisible();
        await table.locator('.track-table__row [data-column="title"]').nth(2).click();
        await expect(window.locator(".prepare-transition canvas").first()).toBeVisible({ timeout: 30_000 });
        await shoot(window, "prepare", taken);
      });

      await test.step("export: the preview of the new Rekordbox file", async () => {
        await openLibrary(window);
        await window.locator('[data-slot="library-header"]').getByRole("button", { name: "Export to Rekordbox…" }).click();
        const dialog = window.getByRole("dialog", { name: "Export to Rekordbox" });
        await expect(dialog.getByTestId("export-track-count")).toBeVisible({ timeout: 30_000 });
        await dialog.getByRole("checkbox", { name: /^Rooftop, Oct 10/ }).check();
        await dialog.getByRole("checkbox", { name: /^Club night/ }).check();
        await expect(dialog.getByText(/Working out what the export would write/)).toHaveCount(0, { timeout: 30_000 });
        await expect(dialog.getByRole("list", { name: "Playlists to add" })).toContainText("Club night");
        await shoot(window, "export", taken);
        await window.keyboard.press("Escape");
        await expect(dialog).toHaveCount(0);
      });

      // Discover is held back until the app lays out the runs column at 1280 x 800 and 1.5x: today
      // the run card is squashed under "Delete this search..." (reported to Phase 14). Set
      // CUEPOINT_SHOWCASE_DISCOVER=1 to take it anyway; the site's tests expect no Discover picture.
      if (process.env.CUEPOINT_SHOWCASE_DISCOVER) await test.step("discover: a search's results", async () => {
        await window.getByRole("link", { name: "Discover", exact: true }).click();
        await window.getByRole("tab", { name: "New search" }).click();
        const panel = window.getByRole("region", { name: "New search" });
        await expect(panel).toBeVisible({ timeout: 30_000 });
        await panel.getByRole("checkbox", { name: "House", exact: true }).check();
        await panel.getByRole("button", { name: "Start looking" }).click();
        await expect(window.getByText(/^Found \d+ tracks from 1 chart/)).toBeVisible({ timeout: 90_000 });
        const found = window.getByRole("table", { name: "Tracks this search found" });
        await expect(found.locator(".track-table__row").first()).toBeVisible();
        await idle(window);
        const tip = window.getByRole("note", { name: "Also in Discover" });
        if (await tip.count()) await tip.getByRole("button", { name: "Got it" }).click();
        // Beatport's rows have nothing to inspect: the panel away gives the search its width
        await window.getByRole("button", { name: "Hide track details" }).click();
        await expect(window.locator(".cp-toast")).toHaveCount(0, { timeout: 60_000 });
        await found.evaluate((el) => el.scrollIntoView({ block: "end" }));
        await expect(found.locator(".track-table__row").nth(2)).toBeInViewport();
        await shoot(window, "discover", taken);
      });

      await test.step("clean: the review queue after a playlist is matched", async () => {
        await window.getByRole("link", { name: "Clean", exact: true }).click();
        await expect(window.getByRole("heading", { name: "Clean", level: 1 })).toBeVisible();
        const queue = window.getByRole("table", { name: "Review queue" });
        await expect(queue.locator(".track-table__row").first()).toBeVisible({ timeout: 30_000 });
        await window.getByRole("button", { name: "Match tracks…" }).click();
        const matchWindow = window.getByRole("dialog", { name: "Match tracks" });
        await matchWindow.getByRole("radio", { name: /^Tracks in chosen playlists/ }).click();
        await matchWindow.getByRole("checkbox", { name: showcase.livePlaylist }).check();
        const live = showcase.playlists.find((p) => p.name === showcase.livePlaylist)!;
        await expect(matchWindow).toContainText(`CuePoint will search Beatport for ${live.trackIds.length} tracks.`);
        await matchWindow.getByRole("button", { name: "Start matching" }).click();
        await expect(window.getByText(`Matching ${live.trackIds.length} tracks on Beatport.`, { exact: true })).toBeVisible({ timeout: 30_000 });
        // the job's end, not the toast's: the toast goes on its own
        await idle(window);
        await expect(window.locator(".cp-toast")).toHaveCount(0, { timeout: 60_000 });
        // the page opened afresh, so its counts hold what the match left for a yes or no
        await openLibrary(window);
        await window.getByRole("link", { name: "Clean", exact: true }).click();
        await expect(window.getByRole("heading", { name: "Clean", level: 1 })).toBeVisible();
        await window.getByRole("combobox", { name: "Show" }).selectOption("needs_review");
        // the queue's rows have nothing to inspect yet: the panel away gives the table its tempo and genre columns
        const hide = window.getByRole("button", { name: "Hide track details" });
        if (await hide.count()) await hide.click();
        const genre = queue.locator('.track-table__row [data-column="genre"]').first();
        await expect(genre).not.toBeEmpty({ timeout: 30_000 });
        await expect(genre).toBeInViewport();
        await expect(queue.locator('.track-table__row [data-column="bpm"]').first()).toContainText(/\d/);
        await expect(window.locator(".cp-status")).toContainText("Ready");
        await shoot(window, "clean", taken);
      });

      await test.step("clean-compare: a track that needs review beside its candidates", async () => {
        await expect(window.locator(".cp-toast")).toHaveCount(0, { timeout: 60_000 });
        await window.getByRole("combobox", { name: "Show" }).selectOption("needs_review");
        const queue = window.getByRole("table", { name: "Review queue" });
        const first = queue.locator('.track-table__row [data-column="title"]').first();
        await expect(first).toBeVisible({ timeout: 30_000 });
        await first.click();
        const comparison = window.getByRole("region", { name: "Comparison" });
        await expect(comparison.getByRole("group", { name: "Decide" })).toBeVisible({ timeout: 30_000 });
        await expect(comparison.getByRole("button", { name: /^#1 · / })).toBeVisible();
        // the covers, decoded by the app from the fixture
        await expect
          .poll(() => comparison.locator("img").evaluateAll((imgs) => imgs.every((img) => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0)), {
            timeout: 30_000,
          })
          .toBe(true);
        // the comparison is taller than the window: its top, the track beside its candidates, is the picture
        await comparison.evaluate((el) => {
          el.scrollIntoView({ block: "start" });
          // the queue's selection bar sticks to the top of the scrolling pane: if it covers the
          // comparison's heading, scroll back by the bar's height so the heading sits under it
          let pane: HTMLElement | null = el.parentElement;
          while (pane && !/(auto|scroll)/.test(getComputedStyle(pane).overflowY)) pane = pane.parentElement;
          const top = el.getBoundingClientRect();
          let hit = document.elementFromPoint(top.left + 8, top.top + 2) as HTMLElement | null;
          if (!pane || !hit || el.contains(hit)) return;
          while (hit.parentElement && hit.parentElement !== pane && getComputedStyle(hit).position !== "sticky") hit = hit.parentElement;
          pane.scrollTop -= hit.getBoundingClientRect().bottom - top.top;
        });
        await expect(comparison.getByRole("button", { name: /^#1 · / })).toBeInViewport();
        await shoot(window, "clean-compare", taken);
      });

      await test.step("shots.json", async () => {
        const shots: Record<string, { alt: string; width: number; height: number; scale: number }> = {};
        for (const id of Object.keys(ALT)) {
          if (id === "discover" && !process.env.CUEPOINT_SHOWCASE_DISCOVER) continue;
          expect(taken[id], `${id} was taken`).toBeTruthy();
          shots[id] = { alt: taken[id]!, width: WINDOW.width, height: WINDOW.height, scale };
        }
        writeFileSync(path.join(OUT_DIR, "shots.json"), JSON.stringify({ themes: [THEME], shots }, null, 2) + "\n", "utf-8");
      });
    } finally {
      await app.close();
    }
  });
});
