/**
 * A waveform painted in the running app (WAVE-05).
 *
 * jsdom has no canvas, so the layout's tests prove every decision and this
 * proves the pixels: `bands.flac`, three sections of two seconds each loud in
 * one band, is imported, analysed by the bundled `mpv`, put in the player, and
 * drawn by Settings → Waveforms' preview. In each section the topmost painted
 * pixel of a column is the tallest band's, so it must be that band's colour:
 * low, then mid, then high, in two themes. With "One color" it is the mono
 * colour everywhere, and the choice survives a relaunch.
 *
 * Skips where no `mpv` was fetched; desktop CI fetches it on Windows and macOS.
 * Each launch gets its own `--user-data-dir` and `CUEPOINT_HOME`.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePlayerBinary } from "../electron/playerLaunch";
import { untilAnalysed } from "./analysisProgress";
import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "../..");
const BANDS = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio", "bands.flac");

const hasDecoder = Boolean(
  resolvePlayerBinary({ packaged: false, repoRoot: REPO_ROOT, env: process.env }),
);

/** An export of `copies` copies of `bands.flac`; the first is "Bands" by "Fixture". */
function writeExport(dir: string, copies = 1): { xml: string; file: string } {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const tracks: string[] = [];
  let first = "";
  for (let i = 0; i < copies; i += 1) {
    const file = path.join(music, `${String(i).padStart(3, "0")}-bands.flac`);
    try {
      linkSync(BANDS, file);
    } catch {
      copyFileSync(BANDS, file);
    }
    if (i === 0) first = file;
    const location = "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");
    const name = i === 0 ? "Bands" : `Bands ${i}`;
    tracks.push(`<TRACK TrackID="${i + 1}" Name="${name}" Artist="Fixture" Location="${location}"/>`);
  }
  const xml = path.join(dir, "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${copies}">
${tracks.join("\n")}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0"/></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return { xml, file: first };
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
  await window.evaluate(() => (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
  return window;
}

/** Put the track in the player, silent and paused at its start. */
async function load(window: Page, file: string, trackId: number): Promise<void> {
  await window.evaluate(
    async ({ file, trackId }) => {
      const player = (window as never as { cuepoint: Record<string, any> }).cuepoint.player;
      await player.setVolume(0);
      await player.playQueue(
        [{ trackId, filePath: file, title: "Bands", artist: "Fixture", durationSeconds: 6 }],
        0,
      );
      await player.pause();
      await player.seek?.(0);
    },
    { file, trackId },
  );
}

/**
 * For each sample point along the preview, the colour of the topmost painted
 * pixel of that column, and the tokens it is compared with.
 */
async function sample(window: Page, at: readonly number[]) {
  return window.evaluate((fractions) => {
    const canvas = document.querySelector("[data-testid=waveform-preview] canvas") as HTMLCanvasElement;
    const context = canvas.getContext("2d")!;
    const { width, height } = canvas;
    const pixels = context.getImageData(0, 0, width, height).data;
    const hex = (i: number) =>
      "#" + [pixels[i]!, pixels[i + 1]!, pixels[i + 2]!].map((v) => v.toString(16).padStart(2, "0")).join("");
    const tops = fractions.map((fraction) => {
      const x = Math.floor(width * fraction);
      for (let y = 0; y < height / 2; y += 1) {
        const i = (y * width + x) * 4;
        if (pixels[i + 3]! > 0) return hex(i);
      }
      return null;
    });
    const style = getComputedStyle(document.documentElement);
    const token = (name: string) => style.getPropertyValue(name).trim().toLowerCase();
    return {
      tops,
      columns: Number(canvas.dataset.columns),
      mode: canvas.dataset.mode,
      low: token("--waveform-low"),
      mid: token("--waveform-mid"),
      high: token("--waveform-high"),
      mono: token("--waveform-mono"),
    };
  }, at);
}

/** One point in the middle of each two-second section of the six. */
const SECTIONS = [1 / 6, 3 / 6, 5 / 6] as const;

test.describe("A waveform painted (WAVE-05)", () => {
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

  test("bands.flac paints each section in its band's colour, in two themes and in one colour", async () => {
    test.setTimeout(180_000);
    const { xml, file } = writeExport(workspace);

    let app = await launch(userDataDir, cuepointHome);
    let trackId = 0;
    try {
      const window = await ready(app);
      await window.evaluate((xmlPath) => window.cuepoint!.startLibraryImport!({ xml_path: xmlPath }), xml);

      // The import, the file check and the analysis follow without a click.
      await expect
        .poll(
          async () => {
            const status = (await window.evaluate(() => window.cuepoint!.waveforms!.analysis())).value!;
            return `${status.present} ${status.analysed}`;
          },
          { timeout: 90_000 },
        )
        .toBe("1 1");
      const summary = await window.evaluate(() => window.cuepoint!.getLibrarySummary!());
      expect(summary.track_count).toBe(1);
      for (let id = 1; id <= 5 && trackId === 0; id += 1) {
        const answer = await window.evaluate(
          (track) => window.cuepoint!.waveforms!.get({ track_ids: [track], width: 120 }),
          id,
        );
        if (answer.value?.waveforms[0]?.state === "ready") trackId = id;
      }
      expect(trackId).toBeGreaterThan(0);

      await load(window, file, trackId);
      await window.getByRole("link", { name: "Settings" }).click();
      const preview = window.getByTestId("waveform-preview");
      await preview.scrollIntoViewIfNeeded();
      await expect(preview.locator("canvas")).toBeVisible({ timeout: 20_000 });
      await expect(window.getByText(/Fixture – Bands/)).toBeVisible();
      await expect(window.getByTestId("waveform-analysis-state")).toHaveText("All 1 analyzed");

      for (const theme of ["neoDark", "retro16"]) {
        await window.evaluate((name) => {
          document.documentElement.dataset.theme = name;
        }, theme);
        await expect
          .poll(async () => {
            const s = await sample(window, SECTIONS);
            return s.tops.join(" ") === [s.low, s.mid, s.high].join(" ") ? "bands" : JSON.stringify(s);
          }, { timeout: 10_000 })
          .toBe("bands");
        const s = await sample(window, SECTIONS);
        expect(s.mode).toBe("bands");
        expect(s.columns).toBeGreaterThan(100);
        expect(new Set([s.low, s.mid, s.high]).size, theme).toBe(3);
      }

      await window.getByRole("radio", { name: "One color" }).check();
      await expect
        .poll(async () => {
          const s = await sample(window, SECTIONS);
          return s.tops.every((top) => top === s.mono) ? "mono" : JSON.stringify(s);
        }, { timeout: 10_000 })
        .toBe("mono");
    } finally {
      await app.close();
    }

    // The choice is a display preference, remembered across a relaunch.
    app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await load(window, file, trackId);
      await window.getByRole("link", { name: "Settings" }).click();
      await expect(window.getByRole("radio", { name: "One color" })).toBeChecked();
      const preview = window.getByTestId("waveform-preview");
      await preview.scrollIntoViewIfNeeded();
      await expect(preview.locator("canvas")).toBeVisible({ timeout: 20_000 });
      await expect
        .poll(async () => {
          const s = await sample(window, SECTIONS);
          return s.mode === "single" && s.tops.every((top) => top === s.mono) ? "mono" : JSON.stringify(s);
        }, { timeout: 10_000 })
        .toBe("mono");
    } finally {
      await app.close();
    }
  });

  test("Delete waveform data says what it costs, empties the store, and the analysis makes it again", async () => {
    test.setTimeout(180_000);
    const { xml } = writeExport(workspace);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await window.evaluate((xmlPath) => window.cuepoint!.startLibraryImport!({ xml_path: xmlPath }), xml);
      const analysed = async () => {
        const status = (await window.evaluate(() => window.cuepoint!.waveforms!.analysis())).value!;
        return `${status.state} ${status.analysed}`;
      };
      await expect.poll(analysed, { timeout: 90_000 }).toBe("idle 1");

      await window.getByRole("link", { name: "Settings" }).click();
      await window.getByText("Disk space").click();
      await window.getByRole("button", { name: "Delete waveform data…" }).click();
      const dialog = window.getByRole("dialog", { name: "Delete waveform data?" });
      await expect(dialog).toContainText(/ on disk\./);
      await expect(dialog).toContainText("The whole library will be analyzed again");
      await dialog.getByRole("button", { name: "Delete waveform data" }).click();

      await expect(window.getByText(/^Deleted 1 waveform, freeing /)).toBeVisible({ timeout: 30_000 });
      // Not paused, so the analysis makes it again on its own.
      await expect.poll(analysed, { timeout: 90_000 }).toBe("idle 1");
      const feed = await window.evaluate(() =>
        window.cuepoint!.getRecentActivity!({ type: "waveforms.data_deleted", limit: 5 }),
      );
      expect(feed.events.map((event) => event.summary)).toEqual([
        "Deleted 1 waveform; the library will be analysed again.",
      ]);
    } finally {
      await app.close();
    }
  });

  test("Pause and Resume in Settings hold across a relaunch", async () => {
    // The run is limited on a stall (analysisProgress.ts), not on a deadline: an
    // arm64 Mac moved steadily to 248 of 250 in the three minutes this once had.
    test.setTimeout(600_000);
    const copies = 250;
    const { xml } = writeExport(workspace, copies);
    const state = (window: Page) => window.getByTestId("waveform-analysis-state");
    const paused = /^Paused · [\d,]+ to go$/;

    let app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await window.getByRole("link", { name: "Settings" }).click();
      await window.evaluate((xmlPath) => window.cuepoint!.startLibraryImport!({ xml_path: xmlPath }), xml);

      // Settings follows the run as it goes, without being asked.
      await expect(state(window)).toHaveText(/^Analyzing · [\d,]+ of 250/, { timeout: 90_000 });
      await window.getByRole("button", { name: "Pause", exact: true }).click();
      await expect(state(window)).toHaveText(paused, { timeout: 30_000 });
      await expect(window.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
    } finally {
      await app.close();
    }

    app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await window.getByRole("link", { name: "Settings" }).click();
      await expect(state(window)).toHaveText(paused, { timeout: 30_000 });

      await window.getByRole("button", { name: "Resume", exact: true }).click();
      await untilAnalysed(
        () => window.evaluate(async () => (await window.cuepoint!.waveforms!.analysis()).value!),
        (now) => now.state === "idle" && now.remaining === 0,
      );
      await expect(state(window)).toHaveText(`All ${copies} analyzed`, { timeout: 15_000 });
      await expect(window.getByRole("button", { name: "Analyze waveforms" })).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
