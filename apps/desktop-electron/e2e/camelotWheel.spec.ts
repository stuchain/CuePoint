/**
 * The Camelot wheel in the running app (PAGES-10, DEC-133, DEC-160).
 *
 * A library whose accepted matches carry keys in two notations ("9A" and "E Minor"),
 * one track the user corrected to 9A, and one whose only 9A is Rekordbox's. Select a
 * track in 8A, open the wheel, click 9A: the Library shows exactly the 9A tracks in
 * both notations and the correction, and never the track whose only 9A is
 * Rekordbox's (DEC-201). The player bar's key opens the wheel on the playing track.
 * The wheel fits at 1.5x, 2x and 3x without a sideways scroll.
 *
 * Nothing here reaches Beatport: the matches are stored the way the matcher would
 * have, through the engine's own database.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";
import { NO_PLAYER, hasPlayer } from "./playerAvailable";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const AUDIO = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio");
const TONE = path.join(AUDIO, "tone.mp3");

function python(): string {
  if (process.env.CUEPOINT_PYTHON) return process.env.CUEPOINT_PYTHON;
  const local =
    process.platform === "win32"
      ? path.join(REPO_ROOT, ".venv", "Scripts", "python.exe")
      : path.join(REPO_ROOT, ".venv", "bin", "python");
  if (existsSync(local)) return local;
  return process.platform === "win32" ? "python" : "python3";
}

/** Track title to the key its accepted Beatport match carries, in Beatport's own spelling. */
const MATCHES: Record<string, string> = {
  "Track 1": "8A",
  "Track 2": "9A",
  "Track 3": "E Minor",
  "Track 5": "5B",
  // Accepted as 3A, then the user corrects it to 9A below.
  "Track 6": "3A",
};

/** Accept a match carrying a key for each title: the rows the matcher would have written. */
const SEED_MATCHES = `
import json, sys
from cuepoint.services import interfaces
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.utils.di_container import get_container

bootstrap_services()
container = get_container()
tracks = container.resolve(interfaces.ITrackRepository)
database = container.resolve(interfaces.IDatabaseService)
matches = json.loads(sys.argv[1])
by_title = {t.title: t.id for t in tracks.list_all()}
for title, key in matches.items():
    track_id = by_title[title]
    with database.transaction(join_existing=True) as conn:
        attempt = conn.execute(
            "INSERT INTO match_attempts (track_id, started_at, finished_at, outcome, input_json)"
            " VALUES (?, 't', 't', 'matched', '{}')", (track_id,)).lastrowid
        candidate = conn.execute(
            "INSERT INTO match_candidates (attempt_id, rank, beatport_track_id, url, key, score,"
            " guard_ok, is_winner) VALUES (?, 0, ?, ?, ?, 96, 1, 1)",
            (attempt, f"bp{track_id}", f"https://www.beatport.com/track/t/{track_id}", key)).lastrowid
        conn.execute(
            "INSERT OR REPLACE INTO track_match (track_id, state, decided_by, attempt_id,"
            " candidate_id, decided_at) VALUES (?, 'accepted', 'auto', ?, ?, 't')",
            (track_id, attempt, candidate))
`;

function seedMatches(cuepointHome: string) {
  execFileSync(python(), ["-c", SEED_MATCHES, JSON.stringify(MATCHES)], {
    env: { ...process.env, CUEPOINT_HOME: cuepointHome, PYTHONPATH: path.join(REPO_ROOT, "src") },
    stdio: "inherit",
  });
}

/**
 * Six real files. Rekordbox says 9A for Track 4 (and for Track 6), which is
 * never used; Track 1 is the one that plays.
 */
function writeExport(dir: string): string {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const tracks = [1, 2, 3, 4, 5, 6].map((id) => {
    const file = path.join(music, `${id}.mp3`);
    copyFileSync(TONE, file);
    const location = "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");
    const tonality = id === 4 || id === 6 ? "9A" : "1B";
    return (
      `<TRACK TrackID="${id}" Name="Track ${id}" Artist="Artist ${id}" Genre="House" ` +
      `Tonality="${tonality}" AverageBpm="124.00" Year="2020" TotalTime="1" Location="${location}"/>`
    );
  });
  const xml = path.join(dir, "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="6">
${tracks.join("\n")}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0"><NODE Name="Warmup" Type="1" Entries="2"><TRACK Key="1"/><TRACK Key="4"/></NODE></NODE></PLAYLISTS>
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
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
  });
  await window.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
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
}

/**
 * Click a key inside its own wedge. A key's box is the whole wheel, cut to its shape, so
 * the box's center is the hole in the middle: the label's place is inside the wedge.
 */
async function clickKey(wheel: ReturnType<Page["getByRole"]>, name: string) {
  const key = wheel.getByRole("button", { name });
  const box = (await key.boundingBox())!;
  const [x, y] = await key.evaluate((el) => [
    parseFloat((el as HTMLElement).style.getPropertyValue("--wheel-x")),
    parseFloat((el as HTMLElement).style.getPropertyValue("--wheel-y")),
  ]);
  await key.click({ position: { x: (box.width * x) / 100, y: (box.height * y) / 100 } });
}

async function visibleTitles(window: Page): Promise<string[]> {
  return window
    .locator('.track-table__row [data-column="title"]')
    .allInnerTexts()
    .then((values) => values.map((value) => value.trim()).filter(Boolean).sort());
}

/** The user's correction: Track 6's key is 9A whatever its match says. */
async function correctTrack6(window: Page) {
  await window.evaluate(async () => {
    const found = await window.cuepoint!.browseLibrary!({ limit: 200 });
    const track = found.tracks.find((row: { title: string }) => row.title === "Track 6")!;
    await window.cuepoint!.setTrackOverrides!({ trackId: track.id, key: "9A" });
  });
}

test.describe("The Camelot wheel (PAGES-10)", () => {
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

  test("a click on 9A shows every 9A track in both notations, never Rekordbox's", async () => {
    test.setTimeout(240_000);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(workspace));
      seedMatches(cuepointHome);
      await correctTrack6(window);
      await window.reload();
      await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });

      // Start in a playlist with a search: the click must replace both (DEC-160).
      await window.getByRole("link", { name: "Library" }).click();
      await expect(window.getByTestId("library-track-count")).toContainText("6 tracks", {
        timeout: 30_000,
      });
      await window
        .getByRole("tree", { name: "Playlists" })
        .getByText("Warmup", { exact: true })
        .click();
      await expect.poll(() => visibleTitles(window), { timeout: 30_000 }).toEqual(["Track 1", "Track 4"]);

      const search = window.locator(".cp-filter-bar").getByRole("textbox", { name: "Search" });
      await search.fill("Track");
      await expect(search).toHaveValue("Track");
      await expect.poll(() => visibleTitles(window), { timeout: 30_000 }).toEqual(["Track 1", "Track 4"]);

      // Select the 8A track, open the wheel from the header.
      await window.locator('.track-table__row [data-column="title"]', { hasText: "Track 1" }).click();
      await window.getByRole("button", { name: "Camelot wheel" }).click();
      const wheel = window.getByRole("dialog", { name: "Camelot wheel" });
      await expect(wheel).toContainText("Selected: Track 1 · 8A", { timeout: 15_000 });
      await expect(wheel.getByRole("button", { name: "9A, E minor, compatible" })).toBeVisible();
      await expect(wheel.getByRole("button", { name: "7A, D minor, compatible" })).toBeVisible();
      await expect(wheel.getByRole("button", { name: "8B, C major, compatible" })).toBeVisible();
      await expect(wheel.getByRole("button", { name: "9B, G major" })).toBeVisible();

      await clickKey(wheel, "9A, E minor, compatible");
      await expect(window.getByRole("dialog", { name: "Camelot wheel" })).toBeHidden();

      // The whole Library, the 9A tracks only: "9A" and "E Minor" matches and the user's
      // correction. Track 4's only 9A is Rekordbox's.
      await expect
        .poll(() => visibleTitles(window), { timeout: 30_000 })
        .toEqual(["Track 2", "Track 3", "Track 6"]);
      await expect(window.getByRole("list", { name: "Active filters" })).toContainText("9A");
      // The search was replaced with the playlist (DEC-160).
      await expect(search).toHaveValue("");
    } finally {
      await app.close();
    }
  });

  test("says what is missing: no track, then a track with no Beatport key", async () => {
    test.setTimeout(240_000);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(workspace));
      await window.reload();
      await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });

      // Nothing matched yet: no track in the library has a key.
      await window.getByRole("button", { name: "Camelot wheel" }).click();
      const wheel = window.getByRole("dialog", { name: "Camelot wheel" });
      await expect(wheel).toContainText("No track in your library has a Beatport key yet.", {
        timeout: 15_000,
      });
      await wheel.getByRole("button", { name: "Match tracks…" }).click();
      await expect(window.getByRole("heading", { name: "Clean", level: 1 })).toBeVisible();

      // A selected track with no key lights nothing and says why.
      await window.getByRole("link", { name: "Library" }).click();
      await window.locator('.track-table__row [data-column="title"]', { hasText: "Track 4" }).click();
      await window.getByRole("button", { name: "Camelot wheel" }).click();
      await expect(window.getByRole("dialog", { name: "Camelot wheel" })).toContainText(
        "This track has no Beatport key yet",
      );
      await expect(window.locator("[data-lit]")).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test("the player bar's key opens the wheel on the playing track", async () => {
    test.skip(!hasPlayer, NO_PLAYER);
    test.setTimeout(240_000);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await window.evaluate(async (file) => {
        await window.cuepoint!.player!.playQueue(
          [{ filePath: file, title: "Tone One", artist: "An Artist", key: "9A", bpm: 124, durationSeconds: 600 }],
          0,
        );
        await window.cuepoint!.player!.pause();
      }, path.join(AUDIO, "tone.flac"));
      const key = window.getByRole("button", { name: "Show 9A on the Camelot wheel" });
      await key.click();
      const wheel = window.getByRole("dialog", { name: "Camelot wheel" });
      await expect(wheel).toContainText("Playing: Tone One · 9A", { timeout: 15_000 });
      await expect(wheel.getByRole("button", { name: "10A, B minor, compatible" })).toBeVisible();
      // Pressing the key again closes it.
      await key.click();
      await expect(wheel).toBeHidden();
    } finally {
      await app.close();
    }
  });

  test("fits without a sideways scroll at 1.5x, 2x and 3x", async () => {
    test.setTimeout(240_000);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(1280, 800);
      });
      await window.getByRole("button", { name: "Camelot wheel" }).click();
      for (const scale of [1.5, 2, 3]) {
        const report = await window.evaluate((s) => {
          document.documentElement.dataset.scale = String(s);
          document.documentElement.style.setProperty("--scale", String(s));
          // The header changes height with the size; the popover fits again as it does on resize.
          window.dispatchEvent(new Event("resize"));
          const box = document.querySelector(".cp-wheel-pop")!.getBoundingClientRect();
          const wheel = document.querySelector(".cp-wheel")!.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            width: window.innerWidth,
            wheelWidth: wheel.width,
            bottom: box.bottom,
            height: window.innerHeight,
            scrollsX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          };
        }, scale);
        expect(report.scrollsX, `no sideways scroll at ${scale}x`).toBe(false);
        expect(report.bottom, `inside the window at the bottom at ${scale}x`).toBeLessThanOrEqual(
          report.height,
        );
        expect(report.left, `inside the window on the left at ${scale}x`).toBeGreaterThanOrEqual(0);
        expect(report.right, `inside the window on the right at ${scale}x`).toBeLessThanOrEqual(
          report.width,
        );
        // 48 cells of 4 x size pixels each: a whole number of CSS pixels per cell.
        expect(report.wheelWidth, `whole-pixel cells at ${scale}x`).toBe(48 * 4 * scale);
        // Taller than the window at 3x: the popover scrolls, and the caption is reachable.
        const caption = window.locator(".cp-wheel-pop__caption");
        await caption.scrollIntoViewIfNeeded();
        const seen = await window.evaluate(() => {
          const c = document.querySelector(".cp-wheel-pop__caption")!.getBoundingClientRect();
          return { top: c.top, bottom: c.bottom, height: window.innerHeight };
        });
        expect(seen.top, `caption on screen at ${scale}x`).toBeGreaterThanOrEqual(0);
        expect(seen.bottom, `caption on screen at ${scale}x`).toBeLessThanOrEqual(seen.height);
      }
    } finally {
      await app.close();
    }
  });
});
