/**
 * The README's pictures and moving pictures, taken from the running app.
 *
 * `npm run capture:readme` opens the development app on the same made-up library as the website's
 * pictures (`e2e/fixtures/showcase/`, see `showcase.spec.ts` for how it is built and taken away),
 * in Neo Dark at 1280 x 800 and a device scale of 2. It takes still PNGs and records short clips of
 * the window with ffmpeg's X11 grabber, so it runs only under X (Linux, or `xvfb-run` with a screen
 * of at least 2600 x 1700). `scripts/readme-gifs.sh` at the repository root turns the clips into the
 * GIFs in `.github/readme/`.
 *
 * Skipped unless `CUEPOINT_CAPTURE_README=1`, so `npm run capture:showcase` does not take it.
 * A pointer drawn in the page follows Playwright's mouse, so a viewer sees what is pressed.
 */
import { test, expect, type ElectronApplication, type Locator, type Page } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir, userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { untilAnalysed } from "../analysisProgress";
import { waitForEngine } from "../engineReady";
import { hasPlayer } from "../playerAvailable";
import { SEED_MATCHES_PY, buildShowcase, removeWritten, writeShowcase, type Showcase, type Written } from "../fixtures/showcase/showcase";
import { launchElectron } from "../support/launchApp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..", "..");
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "..", "..");
const OUT_DIR = process.env.CUEPOINT_README_OUT ?? path.join(REPO_ROOT, ".github", "readme", "raw");

const WINDOW = { width: 1280, height: 800 } as const;
const SCALE = 2;

type Bridge = Record<string, any>;

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
  return launchElectron({ cwd: DESKTOP_ROOT, args: [".", ...args], env });
}

async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await window.evaluate(() => {
    (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.getItem("cuepoint-ui-lab-scale") === "1.25" && localStorage.removeItem("cuepoint-ui-lab-scale"));
    localStorage.setItem("cuepoint-phase14-note-seen", "1");
  });
  await window.reload();
  await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
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

function titleCell(window: Page, title: string): Locator {
  return window.locator('.track-table__row [data-column="title"]', { hasText: title }).first();
}

async function openLibrary(window: Page) {
  await window.getByRole("link", { name: "Library", exact: true }).click();
  await expect(window.getByRole("grid", { name: "Library tracks" })).toBeVisible({ timeout: 30_000 });
}

/** Closes every toast showing; info toasts would go by themselves, errors and warnings would not. */
async function closeToasts(window: Page): Promise<void> {
  for (const close of await window.locator(".cp-toast__close").all()) {
    await close.click().catch(() => undefined);
  }
}

let at = { x: 640, y: 400 };

/** A still of the window, as `<id>.png`. */
async function still(window: Page, id: string) {
  // the pointer away, onto the window's top edge where nothing shows a hint, and not drawn
  await window.mouse.move(640, 2);
  at = { x: 640, y: 2 };
  await window.evaluate(() => document.getElementById("readme-pointer")?.style.setProperty("display", "none"));
  await settled(window);
  await window.screenshot({ path: path.join(OUT_DIR, `${id}.png`), type: "png", animations: "disabled", caret: "hide" });
  await window.evaluate(() => document.getElementById("readme-pointer")?.style.removeProperty("display"));
}

/** A pointer the viewer can follow: drawn in the page, moved by Playwright's mouse, pressed on a click. */
async function addPointer(window: Page) {
  await window.evaluate(() => {
    if (document.getElementById("readme-pointer")) return;
    const pointer = document.createElement("div");
    pointer.id = "readme-pointer";
    pointer.innerHTML =
      '<svg width="22" height="30" viewBox="0 0 11 15" shape-rendering="crispEdges"><path d="M0 0v13l3-3 2 5 2-1-2-5h4z" fill="#fff" stroke="#000" stroke-width="1"/></svg>';
    Object.assign(pointer.style, {
      position: "fixed",
      left: "0",
      top: "0",
      zIndex: "2147483647",
      pointerEvents: "none",
      transformOrigin: "0 0",
      transition: "scale 80ms",
    });
    document.documentElement.appendChild(pointer);
    document.addEventListener("mousemove", (e: MouseEvent) => (pointer.style.translate = `${e.clientX}px ${e.clientY}px`), true);
    document.addEventListener("mousedown", () => (pointer.style.scale = "0.8"), true);
    document.addEventListener("mouseup", () => (pointer.style.scale = "1"), true);
  });
}


/** Move the pointer to the middle of `target` the way a hand would, then rest a moment. */
async function glide(window: Page, target: Locator, steps = 18) {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  const to = { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    await window.mouse.move(at.x + (to.x - at.x) * ease, at.y + (to.y - at.y) * ease);
    await window.waitForTimeout(16);
  }
  at = to;
  await window.waitForTimeout(180);
}

async function press(window: Page, target: Locator) {
  await glide(window, target);
  await window.mouse.down();
  await window.waitForTimeout(90);
  await window.mouse.up();
  await window.waitForTimeout(250);
}

let recording: (() => Promise<void>) | undefined;

/** Record the window's screen area with ffmpeg until `stop` is called. */
async function record(app: ElectronApplication, id: string): Promise<() => Promise<void>> {
  const bounds = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.getContentBounds());
  const display = process.env.DISPLAY ?? ":0";
  const file = path.join(OUT_DIR, `${id}.mkv`);
  const ffmpeg: ChildProcess = spawn(
    "ffmpeg",
    [
      "-loglevel", "error", "-y",
      "-f", "x11grab", "-draw_mouse", "0", "-framerate", "24",
      "-video_size", `${bounds.width * SCALE}x${bounds.height * SCALE}`,
      "-i", `${display}+${bounds.x * SCALE},${bounds.y * SCALE}`,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "8", "-pix_fmt", "yuv444p",
      file,
    ],
    { stdio: ["pipe", "inherit", "inherit"] },
  );
  await new Promise((resolve) => setTimeout(resolve, 600));
  const stop = async () => {
    if (recording !== stop) return;
    recording = undefined;
    await new Promise((resolve) => setTimeout(resolve, 500));
    const done = new Promise((resolve) => ffmpeg.once("exit", resolve));
    ffmpeg.stdin!.write("q");
    await done;
  };
  recording = stop;
  return stop;
}

/** A page's link in the sidebar; its name carries a count when something needs you ("Clean, 23 to review"). */
/**
 * One picture's steps. A picture that fails is reported and the rest are still taken, so one changed
 * label costs one picture, not the run; the test fails at the end.
 */
const failures: string[] = [];
async function picture(window: Page, name: string, body: () => Promise<void>) {
  // CUEPOINT_README_ONLY=clean,keys retakes only the pictures whose step names those words
  const only = process.env.CUEPOINT_README_ONLY?.split(",").filter(Boolean);
  if (only && !only.some((word) => name.toLowerCase().includes(word.toLowerCase()))) return;
  await test.step(name, async () => {
    try {
      await body();
    } catch (error) {
      await recording?.();
      failures.push(`${name}: ${String(error).split("\n")[0]}`);
      await window.screenshot({ path: path.join(OUT_DIR, `failed-${failures.length}.png`) }).catch(() => undefined);
      await window.keyboard.press("Escape").catch(() => undefined);
    }
  });
}

const nav = (window: Page, name: string) =>
  window.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: new RegExp(`^${name}(,|$)`) });

test.describe("the README's pictures", () => {
  test.describe.configure({ timeout: 1_500_000 });
  test.skip(process.env.CUEPOINT_CAPTURE_README !== "1", "set CUEPOINT_CAPTURE_README=1 to take the README's pictures");

  let userDataDir: string;
  let cuepointHome: string;
  let library: LibraryRoot;
  let written: Written | undefined;

  test.beforeAll(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-readme-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-readme-home-"));
    library = libraryRoot();
    mkdirSync(OUT_DIR, { recursive: true });
  });

  test.afterAll(() => {
    for (const dir of [userDataDir, cuepointHome]) rmSync(dir, { recursive: true, force: true });
    cleanupLibrary(library, written);
  });

  test("takes the README's stills and clips", async () => {
    const showcase: Showcase = buildShowcase();
    written = writeShowcase(library.root, showcase);
    const played = showcase.tracks[showcase.playedTrackId - 1]!;

    const app = await launch(userDataDir, cuepointHome, written.beatportFixture);
    try {
      const window = await ready(app);
      await sizeWindow(app, window);

      await test.step("import the library and seed the matches", async () => {
        const started = await window.evaluate((xml) => (window as never as Bridge).cuepoint.startLibraryImport({ xml_path: xml }), written!.xml);
        await finished(window, started.job_id);
        await idle(window);
        execFileSync(python(), ["-c", SEED_MATCHES_PY, written!.seedPlan], {
          env: { ...process.env, CUEPOINT_HOME: cuepointHome, PYTHONPATH: path.join(REPO_ROOT, "src") },
          stdio: "inherit",
        });
        await window.evaluate(() => (window as never as Bridge).cuepoint.saveBeatportPastedToken("showcase-not-a-real-token"));
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
      await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
      await waitForEngine(window);

      if (hasPlayer) {
        await test.step("one track in the player, paused", async () => {
          await window
            .evaluate(
              async ({ title, seconds }) => {
                const c = (window as never as Bridge).cuepoint;
                await c.player.setVolume(0);
                const row = (await c.browseLibrary({ q: title, limit: 1 })).tracks[0];
                await c.player.playQueue(
                  [{ trackId: row.id, filePath: row.file_path, title: row.title, artist: row.artist, key: row.effective_key ?? null, bpm: row.bpm ?? null, durationSeconds: row.duration_seconds ?? null }],
                  0,
                );
                for (let attempt = 0; attempt < 10; attempt++) {
                  await new Promise((resolve) => setTimeout(resolve, 1500));
                  try {
                    await c.player.seek(seconds);
                    break;
                  } catch {
                    // not loaded yet
                  }
                }
                await c.player.pause();
              },
              { title: played.title, seconds: Math.round(played.durationSeconds / 3) },
            )
            .catch(() => undefined);
        });
      }

      await addPointer(window);
      const sidebar = async (state: "rail" | "expanded") => {
        const button = window.getByRole("button", { name: state === "rail" ? "Collapse sidebar" : "Expand sidebar" });
        if (await button.count()) await button.click();
        await expect(window.getByRole("button", { name: state === "rail" ? "Expand sidebar" : "Collapse sidebar" })).toBeVisible();
      };
      const grid = window.getByRole("grid", { name: "Library tracks" });
      const rows = grid.locator(".track-table__row");
      const details = window.getByRole("complementary", { name: "Track details" });

      await picture(window, "clip: a tour of the pages", async () => {
        await sidebar("expanded");
        await nav(window, "Library").click();
        await expect(rows.nth(5)).toBeVisible({ timeout: 30_000 });
        await settled(window);
        const stop = await record(app, "tour");
        for (const page of ["Clean", "Keys", "Discover", "Prepare", "Statistics", "Library"]) {
          await press(window, nav(window, page));
          // off the link, so its hint does not open over the page
          await glide(window, window.locator("main.app-main"), 14);
          await window.waitForTimeout(1300);
        }
        await stop();
      });

      let selected = "";
      await picture(window, "clip + still: the library, a search, a track and the wheel", async () => {
        await sidebar("rail");
        await expect(rows.nth(5)).toBeVisible({ timeout: 30_000 });
        for (let i = 2; i < 12 && !selected; i += 1) {
          const key = (await rows.nth(i).locator('[data-column="key"]').innerText()).trim();
          if (/^\d{1,2}[AB]$/.test(key)) selected = (await rows.nth(i).locator('[data-column="title"]').innerText()).trim();
        }
        const search = window.getByPlaceholder(/^Search these tracks/).filter({ visible: true }).first();
        const word = selected.split(" ")[0]!;
        const stop = await record(app, "library");
        await press(window, search);
        await search.pressSequentially(word, { delay: 110 });
        await window.waitForTimeout(900);
        await press(window, titleCell(window, selected));
        if (!(await details.isVisible())) await press(window, window.getByRole("button", { name: /^Details/ }).first());
        await expect(details.locator("[data-testid=inspector-waveform] canvas")).toBeVisible({ timeout: 30_000 });
        await window.waitForTimeout(1200);
        const wheelButton = details.getByRole("button", { name: /^(Camelot wheel|Show .+ on the Camelot wheel)$/ }).first();
        await press(window, wheelButton);
        await expect(window.getByRole("dialog", { name: "Camelot wheel" })).toContainText(`Selected: ${selected}`, { timeout: 15_000 });
        await window.waitForTimeout(2600);
        await stop();
        await still(window, "wheel");
        await window.keyboard.press("Escape");
        await expect(window.getByRole("dialog", { name: "Camelot wheel" })).toBeHidden();
        await titleCell(window, selected).click();
        await expect(details.locator("[data-testid=inspector-waveform] canvas")).toBeVisible({ timeout: 30_000 });
        await still(window, "library");
      });

      await picture(window, "clip + still: Clean matches a playlist on Beatport and a match is checked", async () => {
        await nav(window, "Clean").click();
        await expect(window.getByRole("heading", { name: "Clean", level: 1 })).toBeVisible();
        await settled(window);
        await glide(window, window.locator("main.app-main"), 1);
        await window.waitForTimeout(600);
        const stop = await record(app, "clean");
        await press(window, window.getByRole("tab", { name: "Playlists", exact: true }));
        await press(window, window.getByRole("checkbox", { name: `Match ${showcase.livePlaylist}`, exact: true }));
        await press(window, window.getByRole("button", { name: "Match ticked playlists" }));
        await window.waitForTimeout(1500);
        await idle(window);
        await window.waitForTimeout(1800);
        await closeToasts(window);
        // then a playlist with tracks to check: the next one beside its Beatport candidates, and Correct
        await press(window, window.getByRole("tab", { name: "Playlists", exact: true }));
        await press(window, window.getByRole("button", { name: /^Review Peak time: \d+ to check$/ }));
        await window.waitForTimeout(1000);
        await press(window, window.getByRole("checkbox", { name: /^To check only/ }));
        await window.waitForTimeout(700);
        const toCheck = window.getByRole("region", { name: /^Review / }).getByRole("row").filter({ hasText: "To check" }).first();
        await press(window, toCheck.getByRole("cell").nth(2));
        // Check the match: the track beside its Beatport candidates; Use this match, and on to the next
        const use = window.getByRole("button", { name: "Use this match" });
        await expect(use).toBeVisible({ timeout: 30_000 });
        await window.waitForTimeout(2400);
        await press(window, use);
        await window.waitForTimeout(2000);
        await press(window, use);
        await window.waitForTimeout(1800);
        await stop();
        await still(window, "clean");
      });

      await picture(window, "still: Keys", async () => {
        await nav(window, "Keys").click();
        await expect(window.getByRole("heading", { name: "Keys", level: 1 })).toBeVisible();
        const sources = window.getByRole("group", { name: "Sources" });
        for (const name of ["Peak time", "Festival set", "Rooftop"]) await sources.getByRole("checkbox", { name, exact: true }).check();
        await expect(window.getByText(/\b3 playlists\b/).first()).toBeVisible({ timeout: 30_000 });
        await window.waitForTimeout(800);
        await still(window, "keys");
      });

      await picture(window, "clip + still: Discover digs a Beatport chart", async () => {
        await nav(window, "Discover").click();
        await settled(window);
        await glide(window, window.locator("main.app-main"), 1);
        await window.waitForTimeout(600);
        const stop = await record(app, "discover");
        await press(window, window.getByRole("tab", { name: "New dig" }));
        const panel = window.getByRole("region", { name: "New dig" });
        await expect(panel).toBeVisible({ timeout: 30_000 });
        await press(window, panel.getByRole("checkbox", { name: "House", exact: true }));
        await press(window, panel.getByRole("checkbox", { name: "Deep House", exact: true }));
        await press(window, panel.getByRole("button", { name: "Start dig" }));
        await expect(window.getByText(/found \d+ tracks? from \d+ charts?/i)).toBeVisible({ timeout: 90_000 });
        await window.waitForTimeout(1800);
        await press(window, window.getByRole("button", { name: /^Everything · / }));
        await window.waitForTimeout(2200);
        await stop();
        await closeToasts(window);
        await still(window, "discover");
      });

      await picture(window, "clip + still: Prepare a set", async () => {
        await nav(window, "Prepare").click();
        await expect(window).toHaveURL(/#\/prepare\/\d+$/, { timeout: 30_000 });
        const table = window.getByRole("grid", { name: "Set entries" });
        await expect(table.locator(".track-table__row").nth(3)).toBeVisible({ timeout: 30_000 });
        await window.getByRole("button", { name: "View", exact: true }).click();
        await window.getByRole("menuitemcheckbox", { name: "Transition strip" }).click();
        await window.keyboard.press("Escape");
        await settled(window);
        await glide(window, window.locator("main.app-main"), 1);
        await window.waitForTimeout(600);
        const stop = await record(app, "prepare");
        for (const n of [1, 2, 3, 4]) {
          await press(window, table.locator('.track-table__row [data-column="title"]').nth(n));
          await window.waitForTimeout(1100);
        }
        await stop();
        await still(window, "prepare");
      });

      await picture(window, "still: Statistics", async () => {
        await nav(window, "Statistics").click();
        await expect(window.getByRole("heading", { name: "Statistics", level: 1 })).toBeVisible();
        await expect(window.getByText("Genres", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
        await still(window, "statistics");
      });

      await picture(window, "still: Export to Rekordbox", async () => {
        await nav(window, "Library").click();
        await window.locator('[data-slot="library-header"]').getByRole("button", { name: "Export to Rekordbox…" }).click();
        const dialog = window.getByRole("dialog", { name: "Export to Rekordbox" });
        await expect(dialog.getByText(/\d+ tracks/).first()).toBeVisible({ timeout: 30_000 });
        await expect(dialog.getByText(/Working out what the export would write/)).toHaveCount(0, { timeout: 30_000 });
        await still(window, "export");
        await window.keyboard.press("Escape");
      });

      expect(failures, "pictures that could not be taken").toEqual([]);
      writeFileSync(path.join(OUT_DIR, "README.txt"), "Raw captures from e2e/capture/readme.spec.ts; scripts/readme-gifs.sh makes the GIFs.\n");
    } finally {
      await app.close();
    }
  });
});
