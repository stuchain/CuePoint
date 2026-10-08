/**
 * Phase 11's journey, end to end in the running app (WAVE-07).
 *
 * The nine steps a DJ takes with waveforms, one after another in one library,
 * each read back from what the app shows:
 *
 * 1. a library with real audio and Rekordbox cues is imported;
 * 2. the analysis follows without a click, the status strip counts it, and it
 *    runs until Clean → Health says every file is analysed (once step 6 is
 *    done: Pause is what a running analysis offers, so it is paused while it
 *    runs, and resumed after the relaunch);
 * 3. the Library's "Waveform" column draws each row's waveform;
 * 4. the Inspector draws the hot cue at its time, and says the loudness under
 *    it (WAVE-08);
 * 5. a track plays, and a click on the bar's waveform seeks;
 * 6. Settings' Pause holds across a relaunch, and Resume resumes;
 * 7. a file changed on disk and a refresh: the check, then that one file
 *    analysed again, and Activity says one;
 * 8. Prepare's transition strip reads the planned times and each track's
 *    loudness, says how far apart the two sit, shades the picture outside the
 *    times, and a click on the next half selects it;
 * 9. "Delete waveform data", and the library analysed again.
 *
 * The acceptance runs it three times in a row (`--repeat-each=3`). Skips where
 * no `mpv` was fetched; `CUEPOINT_E2E_EXECUTABLE` runs it against a packaged
 * build, and `CUEPOINT_MPV_PATH` names the `mpv` a Linux build uses. Each
 * launch gets its own `--user-data-dir` and `CUEPOINT_HOME`.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePlayerBinary } from "../electron/playerLaunch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "../..");
const FIXTURES = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio");
const FORMATS = ["bands.flac", "tone.flac", "tone.wav", "tone.aiff", "tone.m4a", "tone.mp3"] as const;

/** Copies of the fixtures, so the run lasts long enough for the strip to count it. */
const COPIES = 300;
const TOTAL = FORMATS.length + COPIES;

/** `bands.flac`: six one-second sections, and its hot cue A at the second's start. */
const BANDS_SECONDS = 6;
const HOT_CUE_SECONDS = 2;
const HOT_CUE_COLOUR = "#e62828";

const hasDecoder = Boolean(resolvePlayerBinary({ packaged: false, repoRoot: REPO_ROOT, env: process.env }));

const location = (file: string) => "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");

type Bridge = Record<string, any>;

/** The fixtures as named tracks in a playlist "Friday", then the copies. */
function writeExport(dir: string, edited = false): { xml: string; files: string[] } {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const files = FORMATS.map((format) => path.join(music, format));
  const tracks = files.map((file, index) => {
    const title = index === 0 ? "Bands" : `Tone ${FORMATS[index]}${edited && index === 1 ? ", edited" : ""}`;
    const marks =
      index === 0
        ? `<TEMPO Inizio="0.000" Bpm="120.00" Metro="4/4" Battito="1"/>` +
          `<POSITION_MARK Name="Second" Type="0" Start="${HOT_CUE_SECONDS.toFixed(3)}" Num="0" Red="230" Green="40" Blue="40"/>`
        : "";
    return `<TRACK TrackID="${index + 1}" Name="${title}" Artist="Fixture" Location="${location(file)}">${marks}</TRACK>`;
  });
  for (let i = 0; i < COPIES; i += 1) {
    const file = path.join(music, `copy-${String(i).padStart(3, "0")}-${FORMATS[i % FORMATS.length]}`);
    tracks.push(`<TRACK TrackID="${FORMATS.length + i + 1}" Name="Copy ${i}" Artist="Copy" Location="${location(file)}"/>`);
  }
  const keys = files.map((_, index) => `<TRACK Key="${index + 1}"/>`).join("");
  const xml = path.join(dir, edited ? "edited.xml" : "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.8.5" Company="AlphaTheta"/>
  <COLLECTION Entries="${tracks.length}">
${tracks.join("\n")}
  </COLLECTION>
  <PLAYLISTS><NODE Type="0" Name="ROOT" Count="1"><NODE Name="Friday" Type="1" KeyType="0" Entries="${files.length}">${keys}</NODE></NODE></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return { xml, files };
}

/** Copies, never links: step 7 rewrites a file. */
function writeMusic(dir: string): void {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  for (const format of FORMATS) copyFileSync(path.join(FIXTURES, format), path.join(music, format));
  for (let i = 0; i < COPIES; i += 1) {
    const format = FORMATS[i % FORMATS.length]!;
    copyFileSync(path.join(FIXTURES, format), path.join(music, `copy-${String(i).padStart(3, "0")}-${format}`));
  }
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.env.CUEPOINT_E2E_EXECUTABLE;
  return packaged
    ? electron.launch({ executablePath: packaged, args: [`--user-data-dir=${userDataDir}`], env })
    : electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await window.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  await expect(window.locator(".cp-status")).toContainText(/Engine connected/i, { timeout: 60_000 });
  return window;
}

function analysis(window: Page) {
  return window.evaluate(async () => (await window.cuepoint!.waveforms!.analysis()).value!);
}

async function analysedAll(window: Page, timeout = 180_000) {
  await expect
    .poll(async () => {
      const now = await analysis(window);
      return `${now.state} ${now.analysed} ${now.remaining}`;
    }, { timeout })
    .toBe(`idle ${TOTAL} 0`);
}

async function trackIds(window: Page): Promise<Map<string, number>> {
  const page = await window.evaluate(() =>
    window.cuepoint!.searchLibrary!({ q: "Fixture", limit: 50, offset: 0 } as never),
  );
  return new Map((page as { tracks: { id: number; title: string }[] }).tracks.map((row) => [row.title, row.id]));
}

async function playerPosition(window: Page): Promise<number | null> {
  return window.evaluate(async () => {
    const state = await (window as never as { cuepoint: Bridge }).cuepoint.player.getState();
    return state.playback.positionSeconds;
  });
}

/** The x of the first pixel of `colour` along the middle row of a canvas, in columns. */
async function columnOf(window: Page, selector: string, colour: string) {
  return window.evaluate(
    ({ selector, colour }) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement | null;
      if (!canvas || canvas.width === 0) return null;
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
      const hex = (i: number) =>
        "#" + [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!].map((v) => v.toString(16).padStart(2, "0")).join("");
      const columns = Number(canvas.dataset.columns);
      const unit = Math.floor(canvas.width / columns);
      const y = Math.floor(canvas.height / 2);
      for (let x = 0; x < canvas.width; x += 1) {
        if (hex((y * canvas.width + x) * 4) === colour) return { column: x / unit, columns };
      }
      return { column: null, columns };
    },
    { selector, colour },
  );
}

/** The topmost painted pixel at each fraction of a canvas's width, and the theme's band colours. */
async function tops(window: Page, selector: string, fractions: readonly number[]) {
  return window.evaluate(
    ({ selector, fractions }) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement | null;
      if (!canvas || canvas.width === 0) return null;
      const { width, height } = canvas;
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, width, height).data;
      const hex = (i: number) =>
        "#" + [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!].map((v) => v.toString(16).padStart(2, "0")).join("");
      const style = getComputedStyle(document.documentElement);
      const token = (name: string) => style.getPropertyValue(name).trim().toLowerCase();
      return {
        tops: fractions.map((fraction) => {
          const x = Math.floor(width * fraction);
          for (let y = 0; y < height / 2; y += 1) {
            const i = (y * width + x) * 4;
            if (pixels[i + 3]! > 0) return hex(i);
          }
          return null;
        }),
        bands: [token("--waveform-low"), token("--waveform-mid"), token("--waveform-high")],
      };
    },
    { selector, fractions },
  );
}

test.describe("Phase 11's journey (WAVE-07)", () => {
  test.skip(!hasDecoder, "no mpv: run `python scripts/fetch_player_sidecar.py`");

  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-journey-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  test("import, analysis, the four places, pause, a changed file, the strip and a deletion", async () => {
    test.setTimeout(600_000);
    writeMusic(workspace);
    const { xml, files } = writeExport(workspace);

    let app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await window.getByRole("link", { name: "Settings" }).click();

      // --- 1. import a library with real audio and cues ---------------------
      await window.evaluate((file) => window.cuepoint!.startLibraryImport!({ xml_path: file }), xml);

      // --- 2. the analysis follows without a click ... ----------------------
      // Settings offers Pause once it runs; an idle analysis offers to start.
      // --- 6. ... and is paused there while it runs -------------------------
      // Once it has analysed something, so the relaunch has work kept to show.
      await expect(window.getByTestId("waveform-analysis-state")).toHaveText(
        new RegExp(`^Analyzing · [1-9][\\d,]* of ${TOTAL}`),
        { timeout: 90_000 },
      );
      await window.getByRole("button", { name: "Pause", exact: true }).click();
      await expect(window.getByRole("button", { name: "Resume", exact: true })).toBeVisible({ timeout: 30_000 });
      const paused = await analysis(window);
      expect(paused.paused).toBe(true);
      expect(paused.remaining).toBeGreaterThan(0);
    } finally {
      await app.close();
    }

    app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      // ... still paused after a relaunch, keeping what it did; resumed.
      const relaunched = await analysis(window);
      expect([relaunched.state, relaunched.paused]).toEqual(["paused", true]);
      expect(relaunched.analysed).toBeGreaterThan(0);
      expect(relaunched.remaining).toBeGreaterThan(0);
      await window.getByRole("link", { name: "Settings" }).click();
      await window.getByRole("button", { name: "Resume", exact: true }).click();
      await expect.poll(async () => (await analysis(window)).paused, { timeout: 15_000 }).toBe(false);

      // --- 2, continued: the strip counts it, and it runs to the end --------
      await expect(window.locator(".cp-status__job-label")).toContainText(
        new RegExp(`Analyzing waveforms · [\\d,]+ of ${TOTAL}`),
        { timeout: 60_000 },
      );
      await analysedAll(window);
      await window.getByRole("link", { name: "Clean" }).click();
      await window.getByRole("tab", { name: "Health" }).click();
      const health = window.getByRole("list", { name: "Checks" }).getByRole("listitem").filter({
        hasText: "Waveforms analysed",
      });
      await expect(health.getByText(new RegExp(`^All ${TOTAL} analyzed`))).toBeVisible({ timeout: 15_000 });
      const ids = await trackIds(window);
      expect(ids.size).toBe(FORMATS.length);

      // --- 3. the Library column draws each row's waveform ------------------
      await window.getByRole("link", { name: "Library" }).click();
      await expect(window.locator(".track-table__row").first()).toBeVisible({ timeout: 30_000 });
      await window.getByRole("button", { name: "Columns…" }).click();
      await window.getByRole("dialog").getByRole("checkbox", { name: "Waveform" }).check();
      await window.keyboard.press("Escape");
      const cells = window.locator(".track-table__cell[data-column=waveform]");
      await expect(cells.first().locator("canvas")).toBeVisible({ timeout: 20_000 });
      await expect
        .poll(async () => {
          const counts = await cells.evaluateAll((all) => ({
            cells: all.length,
            drawn: all.filter((cell) => cell.querySelector("canvas")).length,
          }));
          return counts.cells > 3 && counts.cells === counts.drawn;
        }, { timeout: 20_000 })
        .toBe(true);

      // --- 4. the Inspector: the hot cue at its time ------------------------
      await window.locator(".cp-filter-bar").getByRole("textbox", { name: "Search" }).fill("Bands");
      await window.locator(".track-table__row").filter({ hasText: "Bands" }).first().click();
      const inspector = "[data-testid=inspector-waveform] canvas";
      await expect(window.locator(inspector)).toBeVisible({ timeout: 20_000 });
      let cue: Awaited<ReturnType<typeof columnOf>> = null;
      await expect
        .poll(async () => {
          cue = await columnOf(window, inspector, HOT_CUE_COLOUR);
          return cue?.column ?? null;
        }, { timeout: 15_000 })
        .not.toBeNull();
      const found = cue as unknown as { column: number; columns: number };
      expect(Math.abs(found.column - Math.floor((HOT_CUE_SECONDS / BANDS_SECONDS) * found.columns))).toBeLessThanOrEqual(1);
      // Its loudness under it, as the pinned decoder measures bands.flac (WAVE-08).
      await expect(window.getByTestId("inspector-loudness")).toHaveText("Loudness −3.5 LUFS · Peak −4.3 dBFS");

      // --- 5. play a track, and seek by clicking the bar's waveform ---------
      await window.evaluate(
        async ({ file, trackId }) => {
          const player = (window as never as { cuepoint: Bridge }).cuepoint.player;
          await player.setVolume(0);
          await player.playQueue([{ trackId, filePath: file, title: "Bands", artist: "Fixture" }], 0);
          await player.pause();
        },
        { file: files[0]!, trackId: ids.get("Bands")! },
      );
      const bar = window.getByTestId("player-waveform");
      await expect(bar.locator("canvas")).toBeVisible({ timeout: 20_000 });
      const box = (await bar.boundingBox())!;
      const columns = Number(await bar.locator("canvas").getAttribute("data-columns"));
      await window.mouse.click(box.x + (box.width * 4) / BANDS_SECONDS, box.y + box.height / 2);
      await expect
        .poll(async () => Math.abs(((await playerPosition(window)) ?? -1) - 4) <= BANDS_SECONDS / columns, {
          timeout: 10_000,
        })
        .toBe(true);

      // --- 7. a file changed on disk, a refresh, that file analysed again ----
      copyFileSync(path.join(FIXTURES, "bands.flac"), files[1]!);
      const edited = writeExport(workspace, true).xml;
      const preview = await window.evaluate(
        (file) => window.cuepoint!.startLibraryRefreshPreview!({ xml_path: file }),
        edited,
      );
      await expect
        .poll(async () => (await window.evaluate((id) => window.cuepoint!.getJob!(id), preview.job_id)).state, {
          timeout: 60_000,
        })
        .toBe("succeeded");
      const diff = await window.evaluate((id) => window.cuepoint!.getJobResults!(id), preview.job_id);
      const diffId = (diff as { result: { diff_id: string } }).result.diff_id;
      await window.evaluate((id) => window.cuepoint!.startLibraryRefreshApply!({ diff_id: id }), diffId);
      const changedId = ids.get("Tone tone.flac")!;
      // Its waveform is the new file's: six seconds, where the tone lasts a quarter of one.
      await expect
        .poll(async () => {
          const answer = await window.evaluate(
            (track) => window.cuepoint!.waveforms!.get({ track_ids: [track], width: 120 }),
            changedId,
          );
          return answer.value!.waveforms[0]!.duration_ms ?? 0;
        }, { timeout: 120_000 })
        .toBeGreaterThan(5_000);
      await analysedAll(window);
      const feed = await window.evaluate(() =>
        window.cuepoint!.getRecentActivity!({ type: "waveforms.analysed", limit: 1 }),
      );
      expect(feed.events[0]!.summary).toMatch(/^Analysed 1 waveform\b/);

      // --- 8. a Set's transition in Prepare ----------------------------------
      const setId = await window.evaluate(async () => {
        const c = (window as never as { cuepoint: Bridge }).cuepoint;
        const friday = (await c.getLibraryPlaylists()).playlists.find((node: { name: string }) => node.name === "Friday");
        const made = await c.sets.createFrom({ source: { kind: "playlist", id: friday.id } });
        const id = made.value.set.id;
        const plan = (await c.sets.plan({ set_id: id })).value;
        await c.sets.setEntryTimes({ entry_id: plan.entries[0].entry_id, in_time: "0:01", out_time: "0:05" });
        await c.sets.setEntryTimes({ entry_id: plan.entries[1].entry_id, in_time: "0:00", out_time: null });
        return id;
      });
      await window.getByRole("link", { name: "Prepare", exact: true }).click();
      await expect(window).toHaveURL(new RegExp(`#/prepare/${setId}$`), { timeout: 30_000 });
      await window.getByRole("button", { name: "View ▾" }).click();
      await window.getByRole("menuitem", { name: "Show transition strip" }).click();
      const strip = window.getByRole("region", { name: "Transition" });
      await expect(strip).toContainText("Select an entry to see its transition");
      const setTable = window.getByRole("table", { name: "Set entries" });
      await setTable.locator(".track-table__row").first().click({ position: { x: 60, y: 10 } });
      // Step 7 made the second track a copy of bands.flac: the two sit level.
      await expect(window.getByTestId("transition-words")).toHaveText("Out 0:05 → In 0:00 · 0.0 LU");
      await expect(strip).toContainText("In 0:01 · Out 0:05 · −3.5 LUFS");
      await expect(strip).toContainText("In 0:00 · untimed · −3.5 LUFS");
      const from = "[data-testid=transition-from] canvas";
      await expect(window.locator(from)).toBeVisible({ timeout: 20_000 });
      await expect(window.locator("[data-testid=transition-to] canvas")).toBeVisible({ timeout: 20_000 });
      // Bands, in 0:01 and out 0:05: the picture outside them is shaded, inside is not.
      await expect
        .poll(async () => {
          const painted = await tops(window, from, [0.5 / BANDS_SECONDS, 2.6 / BANDS_SECONDS, 5.5 / BANDS_SECONDS]);
          if (!painted) return "not painted";
          const [before, inside, after] = painted.tops;
          return [
            painted.bands.includes(before ?? "") ? "unshaded" : "shaded",
            painted.bands.includes(inside ?? "") ? "unshaded" : "shaded",
            painted.bands.includes(after ?? "") ? "unshaded" : "shaded",
          ].join(" ");
        }, { timeout: 15_000 })
        .toBe("shaded unshaded shaded");
      // The hot cue is on it too.
      await expect.poll(async () => (await columnOf(window, from, HOT_CUE_COLOUR))?.column ?? null).not.toBeNull();
      // A click on the next half selects that entry.
      await window.getByTestId("transition-to").click();
      await expect(setTable.locator(".track-table__row").nth(1)).toHaveAttribute("aria-selected", "true");
      await expect(window.getByTestId("transition-words")).toHaveText(/^Untimed → /);

      // --- 9. delete waveform data, and the library analysed again ----------
      await window.getByRole("link", { name: "Settings" }).click();
      await window.getByText("Disk space").click();
      await window.getByRole("button", { name: "Delete waveform data…" }).click();
      const dialog = window.getByRole("dialog", { name: "Delete waveform data?" });
      await dialog.getByRole("button", { name: "Delete waveform data" }).click();
      await expect(window.getByText(new RegExp(`^Deleted ${TOTAL} waveforms, freeing `))).toBeVisible({
        timeout: 30_000,
      });
      await expect
        .poll(async () => (await analysis(window)).analysed, { timeout: 30_000 })
        .toBeLessThan(TOTAL);
      await analysedAll(window);
    } finally {
      await app.close();
    }
  });
});
