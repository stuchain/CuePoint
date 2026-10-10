/**
 * Waveforms where DEC-114 places them, in the running app (WAVE-06).
 *
 * jsdom has no canvas and lays nothing out, so the component tests prove the
 * decisions and this proves the pixels and the geometry:
 *
 * - every shipped format's waveform lasts what the player says, within one of
 *   the bar's columns, so a picture laid across the player's duration puts each
 *   column at its time;
 * - `bands.flac` is painted in the bar, each section in its band's colour, and
 *   the bar is exactly as tall as it was with the plain slider;
 * - a click at the second section's start seeks to within one column of 2.0 s;
 * - the Inspector draws the fixture's hot cue at 2.0 s, and seeks the playing
 *   track on a click;
 * - with the Library's "Waveform" column shown, scrolling 5,000 rows records no
 *   long task over 50 ms while waveforms paint.
 *
 * Skips where no `mpv` was fetched; desktop CI fetches it on Windows and macOS,
 * and sets `CUEPOINT_MPV_PATH` to the distribution's `mpv` on Linux.
 * `CUEPOINT_E2E_EXECUTABLE` runs it against a packaged build, and
 * `CUEPOINT_MPV_PATH` names the `mpv` a Linux build uses. Each launch gets its
 * own `--user-data-dir` and `CUEPOINT_HOME`.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePlayerBinary } from "../electron/playerLaunch";
import { waitForEngine } from "./engineReady";

/** GitHub's Intel Mac runner, where the scroll check records long tasks instead of failing (DEC-231). */
const INTEL_MAC_RUNNER = Boolean(process.env.CI) && process.platform === "darwin" && process.arch === "x64";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "../..");
const FIXTURES = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio");
const FORMATS = ["bands.flac", "tone.wav", "tone.flac", "tone.aiff", "tone.m4a", "tone.mp3"] as const;

/** The fixture's hot cue: A, at the start of the second section, Rekordbox's red. */
const HOT_CUE_SECONDS = 2;
const HOT_CUE_COLOUR = "#e62828";

/** The analysis's envelope rate (`audio_decode.ENVELOPE_RATE_HZ`): a waveform's own resolution. */
const ENVELOPE_HZ = 150;

const hasDecoder = Boolean(
  resolvePlayerBinary({ packaged: false, repoRoot: REPO_ROOT, env: process.env }),
);

const location = (file: string) => "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");

function link(source: string, dest: string): void {
  try {
    linkSync(source, dest);
  } catch {
    copyFileSync(source, dest);
  }
}

/**
 * Each shipped format once, `bands.flac` first as "Bands" with its hot cue,
 * then `extra` more tracks over the same six files, so a long library costs
 * six analyses.
 */
function writeExport(dir: string, extra = 0): { xml: string; files: string[] } {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const files = FORMATS.map((format) => {
    const file = path.join(music, format);
    link(path.join(FIXTURES, format), file);
    return file;
  });
  const tracks = files.map((file, index) => {
    const name = index === 0 ? "Bands" : `Tone ${FORMATS[index]}`;
    const marks =
      index === 0
        ? `\n      <POSITION_MARK Name="Second" Type="0" Start="${HOT_CUE_SECONDS.toFixed(3)}" Num="0" Red="230" Green="40" Blue="40"/>\n    `
        : "";
    return `    <TRACK TrackID="${index + 1}" Name="${name}" Artist="Fixture" Location="${location(file)}">${marks}</TRACK>`;
  });
  for (let i = 0; i < extra; i += 1) {
    const file = files[i % files.length]!;
    tracks.push(
      `    <TRACK TrackID="${files.length + i + 1}" Name="Row ${String(i).padStart(5, "0")}" Artist="Fixture" Location="${location(file)}"/>`,
    );
  }
  const xml = path.join(dir, "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${tracks.length}">
${tracks.join("\n")}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0"/></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return { xml, files };
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
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

/** Import, and wait for the analysis to finish every file it found. */
async function importAndAnalyse(window: Page, xml: string, files: number): Promise<void> {
  await window.evaluate((xmlPath) => window.cuepoint!.startLibraryImport!({ xml_path: xmlPath }), xml);
  await expect
    .poll(
      async () => {
        const status = (await window.evaluate(() => window.cuepoint!.waveforms!.analysis())).value!;
        return status.remaining === 0 && status.analysed >= files && status.state !== "running";
      },
      { timeout: 120_000 },
    )
    .toBe(true);
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
}

/** The library's id of the track at `file`, by asking the engine for each. */
async function trackIdsByTitle(window: Page): Promise<Map<string, number>> {
  const page = await window.evaluate(() =>
    window.cuepoint!.searchLibrary!({ q: "Fixture", limit: 50, offset: 0 } as never),
  );
  const rows = (page as { tracks: { id: number; title: string }[] }).tracks;
  return new Map(rows.map((row) => [row.title, row.id]));
}

/** Put one track in the player, silent and paused at its start (a seek before it loads is refused). */
/**
 * Loads one file into the player, paused.
 *
 * `playQueue` starts playing, and the tone fixtures last 0.26 s: with a fast
 * audio output the track can end before the pause lands, which leaves the
 * player idle with no duration. Such a load is tried again.
 */
async function load(window: Page, file: string, trackId: number | null, title: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    await window.evaluate(
      async ({ file, trackId, title }) => {
        const player = (window as never as { cuepoint: Record<string, any> }).cuepoint.player;
        await player.setVolume(0);
        await player.playQueue([{ trackId, filePath: file, title, artist: "Fixture" }], 0);
        await player.pause();
      },
      { file, trackId, title },
    );
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (((await playerState(window)).duration ?? 0) > 0) return;
      await window.waitForTimeout(100);
    }
    if (attempt === 3) return;
  }
}

async function playerState(window: Page): Promise<{ duration: number | null; position: number | null }> {
  return window.evaluate(async () => {
    const state = await (window as never as { cuepoint: Record<string, any> }).cuepoint.player.getState();
    return { duration: state.playback.durationSeconds, position: state.playback.positionSeconds };
  });
}

/** The player's duration, once it knows it. */
async function playerDuration(window: Page): Promise<number> {
  let duration = 0;
  await expect
    .poll(async () => {
      duration = (await playerState(window)).duration ?? 0;
      return duration > 0;
    }, { timeout: 20_000 })
    .toBe(true);
  return duration;
}

/** The colour of the topmost painted pixel at each fraction of a canvas's width. */
async function tops(window: Page, selector: string, fractions: readonly number[]) {
  return window.evaluate(
    ({ selector, fractions }) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement | null;
      if (!canvas || canvas.width === 0) return null;
      const context = canvas.getContext("2d")!;
      const { width, height } = canvas;
      const pixels = context.getImageData(0, 0, width, height).data;
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
        columns: Number(canvas.dataset.columns),
      };
    },
    { selector, fractions },
  );
}

const BAR_CANVAS = "[data-testid=player-waveform] canvas";
const INSPECTOR_CANVAS = "[data-testid=inspector-waveform] canvas";

/**
 * The bar canvas's column count, once it has one. The canvas is visible before
 * its ResizeObserver has measured it, and until then it lays out zero columns.
 */
async function barColumns(window: Page): Promise<number> {
  let columns = 0;
  await expect
    .poll(
      async () => {
        columns = Number(await window.locator(BAR_CANVAS).getAttribute("data-columns"));
        return columns;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThan(0);
  return columns;
}

test.describe("Waveforms in the bar, the Inspector and the Library (WAVE-06)", () => {
  test.skip(!hasDecoder, "no mpv: run `python scripts/fetch_player_sidecar.py`");

  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-audio-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the bar draws the playing track and seeks by it; the Inspector draws its hot cue", async () => {
    test.setTimeout(240_000);
    const { xml, files } = writeExport(workspace);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importAndAnalyse(window, xml, FORMATS.length);
      const ids = await trackIdsByTitle(window);
      const bandsId = ids.get("Bands")!;
      expect(bandsId).toBeGreaterThan(0);

      // --- the bar before: a file outside the library has no waveform -------
      await load(window, files[1]!, null, "Outside");
      await expect(window.locator(".cp-player-bar")).toBeVisible({ timeout: 15_000 });
      await playerDuration(window);
      await expect(window.locator("[data-testid=player-waveform] canvas")).toHaveCount(0);
      const before = await window.locator(".cp-player-bar").evaluate((bar) => bar.getBoundingClientRect().height);

      // --- every format lasts what the player says, within one bar column ---
      const durations: Record<string, { player: number; waveform: number; columns: number }> = {};
      for (const [index, format] of FORMATS.entries()) {
        const title = index === 0 ? "Bands" : `Tone ${format}`;
        const trackId = ids.get(title)!;
        await load(window, files[index]!, trackId, title);
        const player = await playerDuration(window);
        await expect(window.locator(BAR_CANVAS)).toBeVisible({ timeout: 20_000 });
        const columns = await barColumns(window);
        const answer = await window.evaluate(
          (track) => window.cuepoint!.waveforms!.get({ track_ids: [track], width: 120 }),
          trackId,
        );
        const waveform = answer.value!.waveforms[0]!.duration_ms! / 1000;
        durations[format] = { player, waveform, columns };
        expect(columns, format).toBeGreaterThan(40);
        // One column, but never finer than the waveform's own sample: the
        // tone fixtures last 0.26 s, where a column is 3 ms and one envelope
        // sample 6.7 ms. For any real track a column is the larger.
        expect(Math.abs(player - waveform), `${format}: ${JSON.stringify(durations[format])}`).toBeLessThanOrEqual(
          Math.max(player / columns, 1 / ENVELOPE_HZ),
        );
      }
      test.info().annotations.push({ type: "durations", description: JSON.stringify(durations) });

      // --- bands.flac in the bar: each section in its band's colour ----------
      await load(window, files[0]!, bandsId, "Bands");
      await playerDuration(window);
      await expect(window.locator(BAR_CANVAS)).toBeVisible({ timeout: 20_000 });
      await expect
        .poll(async () => {
          const painted = await tops(window, BAR_CANVAS, [1 / 6, 3 / 6, 5 / 6]);
          return painted && painted.tops.join(" ") === painted.bands.join(" ") ? "bands" : JSON.stringify(painted);
        }, { timeout: 15_000 })
        .toBe("bands");

      // The bar is exactly as tall as it was with the plain slider.
      const after = await window.locator(".cp-player-bar").evaluate((bar) => bar.getBoundingClientRect().height);
      expect(after).toBe(before);

      // The slider is still the control, over the picture.
      const slider = window.getByRole("slider", { name: "Seek" });
      await expect(slider).toBeEnabled();
      await expect(slider).toHaveAttribute("aria-valuetext", /0:0\d of 0:06/);

      // --- a click at the second section's start seeks there -----------------
      const columns = await barColumns(window);
      const box = (await window.getByTestId("player-waveform").boundingBox())!;
      await window.mouse.click(box.x + (box.width * HOT_CUE_SECONDS) / 6, box.y + box.height / 2);
      // The click lands on the seek slider, which snaps to its 0.5 s step: 2.0 s exactly.
      const column = 6 / columns;
      await expect
        .poll(async () => Math.abs(((await playerState(window)).position ?? -1) - HOT_CUE_SECONDS) <= column, {
          timeout: 10_000,
        })
        .toBe(true);

      // --- the Inspector: the hot cue at its time -----------------------------
      // Back to the start first: the playhead is drawn over everything, and
      // at 2.0 s it would cover the cue's line.
      await window.evaluate(() => (window as never as { cuepoint: Record<string, any> }).cuepoint.player.seek(0));
      await window.getByRole("link", { name: "Library" }).click();
      await window.locator(".track-table__row").filter({ hasText: "Bands" }).first().click();
      const inspector = window.getByTestId("inspector-waveform");
      await expect(inspector.locator("canvas")).toBeVisible({ timeout: 20_000 });
      let cue: { x: number | null; columns: number; unit: number } | null = null;
      await expect
        .poll(async () => {
          cue = await window.evaluate(
            ({ selector, colour }) => {
              const canvas = document.querySelector(selector) as HTMLCanvasElement | null;
              if (!canvas || canvas.width === 0) return null;
              const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
              const hex = (i: number) =>
                "#" + [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!].map((v) => v.toString(16).padStart(2, "0")).join("");
              const columns = Number(canvas.dataset.columns);
              const unit = Math.floor(canvas.width / columns);
              // The cue's line runs the drawing's height: read the middle row.
              const y = Math.floor(canvas.height / 2);
              for (let x = 0; x < canvas.width; x += 1) {
                if (hex((y * canvas.width + x) * 4) === colour) return { x, columns, unit };
              }
              return { x: null, columns, unit };
            },
            { selector: INSPECTOR_CANVAS, colour: HOT_CUE_COLOUR },
          );
          return cue?.x ?? null;
        }, { timeout: 15_000 })
        .not.toBeNull();
      const found = cue as unknown as { x: number; columns: number; unit: number };
      // While it plays, the Inspector lays the track over the player's duration (6.06 s, not 6).
      const length = await playerDuration(window);
      const expected = Math.floor((HOT_CUE_SECONDS / length) * found.columns);
      expect(Math.abs(found.x / found.unit - expected)).toBeLessThanOrEqual(1);

      // The playing track's Inspector waveform seeks on a click.
      await expect(inspector).toHaveAttribute("data-playing", "true");
      // The seek measures from the canvas's own box, so click the canvas, not the bordered holder.
      const canvas = inspector.locator("canvas");
      const area = (await canvas.boundingBox())!;
      await canvas.click({ position: { x: (area.width * 5) / 6, y: area.height / 2 } });
      // No step here: the click's fraction of the width, times the player's duration.
      const inspectorWanted = (5 / 6) * length;
      await expect
        .poll(
          async () => Math.abs(((await playerState(window)).position ?? -1) - inspectorWanted) <= length / found.columns,
          { timeout: 10_000 },
        )
        .toBe(true);
    } finally {
      await app.close();
    }
  });

  test("with the Waveform column shown and every kind of motion on, scrolling 5,000 rows records no long task over 50 ms, at 1× and 1.5×", async () => {
    test.setTimeout(600_000);
    const ROWS = 5_000;
    const { xml } = writeExport(workspace, ROWS - FORMATS.length);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importAndAnalyse(window, xml, FORMATS.length);
      await window.getByRole("link", { name: "Library" }).click();
      await expect(window.locator(".track-table__row").first()).toBeVisible({ timeout: 30_000 });

      await window.getByRole("button", { name: "Columns…" }).click();
      await window.getByRole("dialog").getByRole("checkbox", { name: "Waveform" }).check();
      await window.keyboard.press("Escape");
      await expect(window.locator(".track-table__cell[data-column=waveform] canvas").first()).toBeVisible({
        timeout: 20_000,
      });

      // Every kind of motion on (PAGES-12): no stored overrides, the system not asking for less. Rows at
      // 1× are the smallest (the most rows on screen, the heaviest case); 1.5× is the default.
      await window.emulateMedia({ reducedMotion: "no-preference" });
      for (const scale of [1, 1.5]) {
        await window.evaluate((value) => {
          localStorage.removeItem("cuepoint-motion");
          localStorage.setItem("cuepoint-ui-lab-scale", String(value));
        }, scale);
        await window.reload();
        await window.getByRole("link", { name: "Library" }).click();
        await expect(window.locator(".track-table__cell[data-column=waveform] canvas").first()).toBeVisible({
          timeout: 30_000,
        });
        expect(
          await window.evaluate(() => document.documentElement.getAttributeNames().filter((n) => n.startsWith("data-motion-")).length),
          "every kind is on",
        ).toBe(10);

        const report = await window.evaluate(async (rows) => {
          const scroller = document.querySelector(".track-table__scroll") as HTMLElement;
          const long: { start: number; duration: number }[] = [];
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) long.push({ start: entry.startTime, duration: entry.duration });
          });
          observer.observe({ type: "longtask", buffered: false });
          const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
          const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
          let canvases = 0;
          // Down the whole table a page at a time, stopping long enough on each
          // stretch for its rows to settle and paint, then quickly through the rest.
          const page = scroller.clientHeight;
          let steps = 0;
          while (scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 1) {
            scroller.scrollTop += page;
            steps += 1;
            await frame();
            if (steps % 5 === 0) {
              await wait(250);
              canvases = Math.max(
                canvases,
                document.querySelectorAll(".track-table__cell[data-column=waveform] canvas").length,
              );
            }
          }
          await wait(500);
          // The observer's own check: a task this test makes long on purpose,
          // after the scroll, must be seen, or an empty list proves nothing.
          const probe = performance.now();
          await new Promise((resolve) =>
            setTimeout(() => {
              const until = performance.now() + 80;
              while (performance.now() < until) {
                // busy
              }
              resolve(null);
            }, 0),
          );
          await wait(500);
          observer.disconnect();
          const last = document.querySelector(".track-table__row:last-child")?.getAttribute("aria-rowindex");
          return {
            long: long.filter((entry) => entry.start < probe).map((entry) => entry.duration),
            probeSeen: long.some((entry) => entry.start >= probe && entry.duration >= 80),
            canvases,
            steps,
            last: Number(last),
            rows,
          };
        }, ROWS);

        test.info().annotations.push({ type: `scroll at ${scale}×`, description: JSON.stringify(report) });
        // eslint-disable-next-line no-console
        console.log(`scroll at ${scale}x: ${JSON.stringify({ ...report, long: report.long.length === 0 ? "none" : report.long })}`);
        expect(report.probeSeen, "the long-task observer works here").toBe(true);
        expect(report.last, "scrolled to the last row").toBe(ROWS + 1);
        expect(report.steps).toBeGreaterThan(50);
        expect(report.canvases).toBeGreaterThan(5);
        const over = report.long.filter((duration) => duration > 50);
        if (INTEL_MAC_RUNNER) {
          // GitHub's Intel Mac is a slow virtual machine that runs past 50 ms here with or without
          // any change to the app, even at 1×, so it records the pauses rather than failing on them
          // (Stelios, 2026-10-10). Windows, Linux and the ARM Mac keep the 50 ms limit.
          test.info().annotations.push({ type: `over 50 ms at ${scale}× (Intel Mac, recorded)`, description: JSON.stringify(over) });
        } else {
          expect(over).toEqual([]);
        }
      }
    } finally {
      await app.close();
    }
  });
});
