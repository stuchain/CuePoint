/**
 * The zoomed waveform above the player (T4), in the running app.
 *
 * `bands.flac` with a Rekordbox TEMPO marker is imported (one track, no
 * copies), analysed, and played silently. The strip (`.cp-detail-strip`) shows
 * above the bar as its sibling, reaches `data-detail="ready"`, and its canvas
 * holds painted pixels. The wheel over it changes its span (`data-span-ms`) and
 * the hint's tip stands above it. Settings > Waveforms' "Zoomed waveform above the
 * player" removes it and brings it back.
 *
 * Skips where no `mpv` was fetched. Each launch gets its own
 * `--user-data-dir` and `CUEPOINT_HOME`.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePlayerBinary } from "../electron/playerLaunch";
import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "../..");
const BANDS = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio", "bands.flac");

const hasDecoder = Boolean(
  resolvePlayerBinary({ packaged: false, repoRoot: REPO_ROOT, env: process.env }),
);


const location = (file: string) => "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");

function writeExport(dir: string): { xml: string; file: string } {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const file = path.join(music, "bands.flac");
  copyFileSync(BANDS, file);
  const xml = path.join(dir, "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.8.5" Company="AlphaTheta"/>
  <COLLECTION Entries="1">
<TRACK TrackID="1" Name="Bands" Artist="Fixture" Location="${location(file)}"><TEMPO Inizio="0.000" Bpm="120.00" Metro="4/4" Battito="1"/></TRACK>
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0"/></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return { xml, file };
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
  await window.evaluate(() => ((localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.getItem("cuepoint-ui-lab-scale") === "1.25" && localStorage.removeItem("cuepoint-ui-lab-scale")), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
  await window.reload();
  await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
  return window;
}


/** How many pixels of the strip's canvas are not transparent. */
function painted(window: Page): Promise<number> {
  return window.evaluate(() => {
    const canvas = document.querySelector(".cp-detail-strip__canvas") as HTMLCanvasElement | null;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return 0;
    const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 0) count += 1;
    return count;
  });
}

test.describe("The zoomed waveform above the player (T4)", () => {
  test.skip(!hasDecoder, "no mpv: run `python scripts/fetch_player_sidecar.py`");

  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-detail-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  test("the strip shows above the bar, fills, and the setting removes and restores it", async () => {
    test.setTimeout(180_000);
    const { xml, file } = writeExport(workspace);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1400, 900));
      await window.evaluate((xmlPath) => window.cuepoint!.startLibraryImport!({ xml_path: xmlPath }), xml);
      await expect
        .poll(
          async () => {
            const status = (await window.evaluate(() => window.cuepoint!.waveforms!.analysis())).value!;
            return `${status.present} ${status.analysed}`;
          },
          { timeout: 90_000 },
        )
        .toBe("1 1");
      let trackId = 0;
      for (let id = 1; id <= 5 && trackId === 0; id += 1) {
        const answer = await window.evaluate(
          (track) => window.cuepoint!.waveforms!.get({ track_ids: [track], width: 120 }),
          id,
        );
        if (answer.value?.waveforms[0]?.state === "ready") trackId = id;
      }
      expect(trackId).toBeGreaterThan(0);

      // Nothing before the first play.
      await expect(window.locator(".cp-detail-strip")).toHaveCount(0);

      await window.evaluate(
        async ({ file, trackId }) => {
          const player = (window as never as { cuepoint: Record<string, any> }).cuepoint.player;
          await player.setVolume(0);
          await player.playQueue(
            [{ trackId, filePath: file, title: "Bands", artist: "Fixture", durationSeconds: 6 }],
            0,
          );
        },
        { file, trackId },
      );

      const strip = window.locator(".cp-detail-strip");
      await expect(strip).toBeVisible({ timeout: 20_000 });
      await expect(strip).toHaveAttribute("data-detail", "ready", { timeout: 60_000 });
      await expect(strip.locator(".cp-detail-strip__canvas")).toBeVisible();
      await expect.poll(() => painted(window), { timeout: 15_000 }).toBeGreaterThan(0);

      // The bar is untouched: the strip is its sibling, just before it.
      const placement = await window.evaluate(() => {
        const stripEl = document.querySelector(".cp-detail-strip")!;
        const bar = document.querySelector(".cp-player-bar")!;
        return {
          insideBar: bar.contains(stripEl),
          barInsideStrip: stripEl.contains(bar),
          // The strip sits in its Hint's wrapper, which is the bar's sibling.
          sameParent: stripEl.parentElement?.parentElement === bar.parentElement,
          before: Boolean(stripEl.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING),
          next: stripEl.parentElement?.nextElementSibling === bar,
        };
      });
      expect(placement).toEqual({
        insideBar: false,
        barInsideStrip: false,
        sameParent: true,
        before: true,
        next: true,
      });
      await expect(window.locator(".cp-player-bar .cp-detail-strip")).toHaveCount(0);

      // The wheel zooms, and the tip stands above the strip, never over it.
      await expect(strip).toHaveAttribute("data-span-ms", "16000");
      const box0 = (await strip.boundingBox())!;
      await window.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
      await window.mouse.wheel(0, -100);
      await expect(strip).toHaveAttribute("data-span-ms", "12000");
      // One notch is one stop, whatever its size (664e86be): two notches, a gesture apart.
      await window.mouse.wheel(0, 100);
      await expect(strip).toHaveAttribute("data-span-ms", "16000");
      await window.waitForTimeout(250); // longer than WHEEL_IDLE_MS, so the next notch starts a gesture
      await window.mouse.wheel(0, 100);
      await expect(strip).toHaveAttribute("data-span-ms", "24000");
      const tip = window.getByRole("tooltip");
      await expect(tip).toContainText("Scroll to zoom · 24 s", { timeout: 5_000 });
      const stripBox = (await strip.boundingBox())!;
      const tipBox = (await tip.boundingBox())!;
      expect(tipBox.y + tipBox.height).toBeLessThanOrEqual(stripBox.y + 0.5);

      // Off in Settings > Waveforms: gone. On again: back.
      await window.getByRole("link", { name: "Settings" }).click();
      const box = window.getByRole("checkbox", { name: "Zoomed waveform above the player" });
      await box.scrollIntoViewIfNeeded();
      await expect(box).toBeChecked();
      await box.uncheck();
      await expect(window.locator(".cp-detail-strip")).toHaveCount(0);
      await expect(window.locator(".cp-player-bar")).toBeVisible();

      await box.check();
      await expect(window.locator(".cp-detail-strip")).toBeVisible({ timeout: 20_000 });
      await expect(window.locator(".cp-detail-strip")).toHaveAttribute("data-detail", "ready", { timeout: 60_000 });
      await expect.poll(() => painted(window), { timeout: 15_000 }).toBeGreaterThan(0);

      // The bar's own button does the same (C30): lit while the strip shows.
      const barButton = window.getByRole("button", { name: "Hide the zoomed waveform" });
      await expect(barButton).toHaveAttribute("aria-pressed", "true");
      await barButton.click();
      await expect(window.locator(".cp-detail-strip")).toHaveCount(0);
      const showButton = window.getByRole("button", { name: "Show the zoomed waveform" });
      await expect(showButton).toHaveAttribute("aria-pressed", "false");
      await showButton.click();
      await expect(window.locator(".cp-detail-strip")).toBeVisible({ timeout: 20_000 });
      await expect(window.getByRole("button", { name: "Hide the zoomed waveform" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    } finally {
      await app.close();
    }
  });

  /** Import the fixture, wait for its waveform, and start it playing silently. */
  async function importAndPlay(page: Page, xml: string, file: string): Promise<void> {
    await page.evaluate((xmlPath) => window.cuepoint!.startLibraryImport!({ xml_path: xmlPath }), xml);
    await expect
      .poll(
        async () => {
          const status = (await page.evaluate(() => window.cuepoint!.waveforms!.analysis())).value!;
          return `${status.present} ${status.analysed}`;
        },
        { timeout: 90_000 },
      )
      .toBe("1 1");
    let trackId = 0;
    for (let id = 1; id <= 5 && trackId === 0; id += 1) {
      const answer = await page.evaluate(
        (track) => window.cuepoint!.waveforms!.get({ track_ids: [track], width: 120 }),
        id,
      );
      if (answer.value?.waveforms[0]?.state === "ready") trackId = id;
    }
    expect(trackId).toBeGreaterThan(0);
    await page.evaluate(
      async ({ file, trackId }) => {
        const player = (window as never as { cuepoint: Record<string, any> }).cuepoint.player;
        await player.setVolume(0);
        await player.playQueue(
          [{ trackId, filePath: file, title: "Bands", artist: "Fixture", durationSeconds: 6 }],
          0,
        );
      },
      { file, trackId },
    );
  }

  test("a short window starts without the strip, and the bar button shows it (R2-2)", async () => {
    test.setTimeout(180_000);
    const { xml, file } = writeExport(workspace);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const page = await ready(app);
      // Fresh profile, nothing chosen; 660 of content is under the 700 px threshold.
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 660));
      await importAndPlay(page, xml, file);

      // Playing, and still no strip; the bar's button offers it.
      const showButton = page.getByRole("button", { name: "Show the zoomed waveform" });
      await expect(showButton).toBeVisible({ timeout: 20_000 });
      await expect(showButton).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator(".cp-detail-strip")).toHaveCount(0);

      await showButton.click();
      await expect(page.locator(".cp-detail-strip")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("button", { name: "Hide the zoomed waveform" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    } finally {
      await app.close();
    }
  });

  test("the default window keeps the strip on a fresh profile (R2-2)", async () => {
    test.setTimeout(180_000);
    const { xml, file } = writeExport(workspace);
    const app = await launch(userDataDir, cuepointHome);
    try {
      // No resize: the default 1280x800 window is over the 700 px content threshold.
      const page = await ready(app);
      await importAndPlay(page, xml, file);

      await expect(page.locator(".cp-detail-strip")).toBeVisible({ timeout: 20_000 });
      await expect(page.getByRole("button", { name: "Hide the zoomed waveform" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    } finally {
      await app.close();
    }
  });
});
