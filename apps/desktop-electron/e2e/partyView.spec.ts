import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NO_PLAYER, hasPlayer } from "./playerAvailable";
import { launchElectron } from "./support/launchApp";

/**
 * The Party view in the running app: the crowd button on the player bar opens the dancing crowd
 * over the page area, Esc and the button close it, and Settings › Motion › Dancing crowd takes the
 * button away. Plays two short fixtures, so it skips where there is no mpv (see playerAvailable.ts).
 *
 * Set CUEPOINT_PARTY_SHOTS to a folder to also write the three screenshots made for review.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AUDIO = path.resolve(ROOT, "../../src/tests/fixtures/audio");
const SHOTS = process.env.CUEPOINT_PARTY_SHOTS;

function launch(userDataDir: string, home: string): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: home } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  return launchElectron({ cwd: ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

async function shot(win: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await win.screenshot({ path: path.join(SHOTS, name) });
}

test.describe("Party view", () => {
  let userDataDir: string;
  let home: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cp-ud-"));
    home = mkdtempSync(path.join(tmpdir(), "cp-home-"));
  });
  test.afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });

  test("the crowd button opens it over the page, Esc closes it, and the Settings switch hides the button", async () => {
    test.skip(!hasPlayer, NO_PLAYER);
    const app = await launch(userDataDir, home);
    try {
      const win = await app.firstWindow({ timeout: 60_000 });
      await expect(win).toHaveTitle(/CuePoint/i, { timeout: 30_000 });
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 800);
      });
      await win.evaluate(() => {
        localStorage.setItem("cuepoint-onboarding-complete", "1");
        localStorage.setItem("cuepoint-phase14-note-seen", "1");
        localStorage.removeItem("cuepoint-dancing-crowd");
      });
      await win.reload();
      await win.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });

      // A track playing; the bar appears at the first play.
      await win.evaluate(async (files) => {
        const w = window as never as Record<string, any>;
        await w.cuepoint.player.playQueue(
          files.map((f: string, i: number) => ({
            filePath: f, title: `Dance Track ${i}`, artist: "An Artist", key: "8A", bpm: 128, durationSeconds: 600,
          })),
          0,
        );
        // The fixtures are a second or two long: repeat keeps something playing under the crowd.
        await w.cuepoint.player.setRepeat("all");
      }, [path.join(AUDIO, "tone.flac"), path.join(AUDIO, "tone.wav")]);
      const bar = win.locator(".cp-player-bar");
      await expect(bar).toContainText(/Dance Track/, { timeout: 15_000 });

      const open = bar.getByRole("button", { name: "Party view" });
      await expect(open).toBeVisible();
      await expect(open).toHaveAttribute("aria-pressed", "false");
      await shot(win, "1-player-bar-crowd-button.png");

      await open.click();
      const dialog = win.getByRole("dialog", { name: "Party view" });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("canvas")).toBeVisible();
      // It covers the page area only: the player bar is still on screen and usable.
      await expect(bar).toBeVisible();
      const box = await dialog.boundingBox();
      const barBox = await bar.boundingBox();
      expect(box!.y + box!.height).toBeLessThanOrEqual(barBox!.y + 1);
      await expect(bar.getByRole("button", { name: "Close party view" })).toHaveAttribute("aria-pressed", "true");
      // The club fills the stage: no bars either way (within one logical pixel of the stage).
      const fit = await win.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>(".cp-party canvas")!;
        const stage = document.querySelector<HTMLElement>(".cp-party__stage")!;
        const c = canvas.getBoundingClientRect();
        const st = stage.getBoundingClientRect();
        const unit = c.width / canvas.width;
        return { cw: c.width, ch: c.height, sw: st.width, sh: st.height, unit };
      });
      expect(fit.cw).toBeGreaterThanOrEqual(fit.sw - fit.unit - 0.01);
      expect(fit.ch).toBeGreaterThanOrEqual(fit.sh - fit.unit - 0.01);
      // Let the crowd draw a few frames while the track plays.
      await win.waitForTimeout(1500);
      await shot(win, "2-party-view-open.png");
      await win.waitForTimeout(1500);
      await shot(win, "2b-party-view-playing.png");

      // Full screen: the view's own element fills the screen, the first Esc leaves it and keeps the view, the next closes it.
      const fullScreen = dialog.getByRole("button", { name: "Full screen" });
      await fullScreen.click();
      await expect
        .poll(() => win.evaluate(() => document.fullscreenElement?.classList.contains("cp-party") ?? false))
        .toBe(true);
      await expect(dialog.getByRole("button", { name: "Full screen" })).toHaveAttribute("aria-pressed", "true");
      await win.keyboard.press("Escape");
      await expect.poll(() => win.evaluate(() => document.fullscreenElement === null)).toBe(true);
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Full screen" })).toHaveAttribute("aria-pressed", "false");
      // An Escape within 150 ms of leaving full screen counts as the same key (the view's own guard).
      await win.waitForTimeout(300);

      await win.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(bar.getByRole("button", { name: "Party view" })).toHaveAttribute("aria-pressed", "false");

      // The button again closes it.
      await bar.getByRole("button", { name: "Party view" }).click();
      await expect(dialog).toBeVisible();
      await bar.getByRole("button", { name: "Close party view" }).click();
      await expect(dialog).toHaveCount(0);

      // The page behind it is inert while it is open, and going to another page (the sidebar stays live) closes it.
      await bar.getByRole("button", { name: "Party view" }).click();
      await expect(dialog).toBeVisible();
      await expect(win.locator("main.app-main")).toHaveAttribute("inert", "");
      await win.getByRole("navigation", { name: /main navigation/i }).getByRole("link", { name: "Settings" }).click();
      await expect(dialog).toHaveCount(0);
      await expect(win.locator("main.app-main")).not.toHaveAttribute("inert", "");

      // Settings › Motion › Dancing crowd off hides the button, and on brings it back.
      const section = win.getByRole("region", { name: "Motion" });
      const crowd = section.getByRole("checkbox", { name: "Dancing crowd" });
      await expect(crowd).toBeChecked({ timeout: 15_000 });
      await crowd.scrollIntoViewIfNeeded();
      await shot(win, "3-settings-motion-dancing-crowd.png");
      await crowd.uncheck();
      await expect(bar.getByRole("button", { name: /party view/i })).toHaveCount(0);
      await crowd.check();
      await expect(bar.getByRole("button", { name: "Party view" })).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
