import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Shuffle and repeat, pressed and remembered (PLAYER-07, DEC-052).
 *
 * The component tests prove the buttons send the right intents and reflect what
 * main reports. Only the running app can prove the two halves are actually
 * joined: that pressing the control changes the *queue's* order settings in the
 * main process, and that the preference is still there — and applied — after
 * the app is closed and opened again on the same profile.
 *
 * That second half is the one worth the launch cost. Restoration happens at the
 * shell rather than in the bar (the bar does not exist until the first play), so
 * nothing in a single session exercises it.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const AUDIO = path.resolve(DESKTOP_ROOT, "../../src/tests/fixtures/audio");

/**
 * A fresh profile shows the onboarding dialog, whose backdrop swallows clicks —
 * the same reason `shell.spec.ts` dismisses it through storage.
 */
async function dismissOnboarding(window: Page): Promise<void> {
  await window.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
  await window.reload();
  await window.locator("main.app-main").waitFor({ timeout: 30_000 });
}

async function launch(userDataDir: string, home: string): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: home,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({
    cwd: DESKTOP_ROOT,
    args: [".", `--user-data-dir=${userDataDir}`],
    env,
  });
}

/** Queue two real fixtures, paused, so the bar exists and nothing plays on. */
async function queueSomething(window: Page): Promise<void> {
  await window.evaluate(async (files) => {
    const bridge = (window as never as Record<string, any>).cuepoint;
    await bridge.player.playQueue(
      files.map((file: string, index: number) => ({ filePath: file, title: `T${index}` })),
      0,
    );
    await bridge.player.pause();
  }, [path.join(AUDIO, "tone.flac"), path.join(AUDIO, "tone.wav")]);
  await window.waitForSelector(".cp-player-bar", { timeout: 15_000 });
}

async function orderState(window: Page): Promise<{ shuffle: boolean; repeat: string }> {
  return window.evaluate(async () => {
    const state = await (window as never as Record<string, any>).cuepoint.player.getState();
    return { shuffle: state.queue.shuffle, repeat: state.queue.repeat };
  });
}

test("shuffle and repeat reach the queue and survive a restart", async () => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-order-"));
  const home = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));

  let app = await launch(userDataDir, home);
  try {
    const window = await app.firstWindow({ timeout: 60_000 });
    await expect(window).toHaveTitle(/CuePoint/i, { timeout: 30_000 });
    await dismissOnboarding(window);
    await queueSomething(window);

    await window.getByRole("button", { name: "Shuffle off" }).click();
    await window.getByRole("button", { name: "Repeat off" }).click();

    // The button says what main says, not what the click implied.
    await expect(window.getByRole("button", { name: "Shuffle on" })).toBeVisible();
    await expect(window.getByRole("button", { name: "Repeat all" })).toBeVisible();
    expect(await orderState(window)).toEqual({ shuffle: true, repeat: "all" });

    // Repeat cycles to "one" and shows its own glyph rather than a badge.
    await window.getByRole("button", { name: "Repeat all" }).click();
    await expect(window.getByRole("button", { name: "Repeat one" })).toBeVisible();
    await expect(window.locator('.cp-player-bar [data-icon="repeat-one"]')).toHaveCount(1);
    expect((await orderState(window)).repeat).toBe("one");

    // Back to "all" so the restart has something non-default to restore.
    await window.getByRole("button", { name: "Repeat one" }).click();
    await window.getByRole("button", { name: "Repeat off" }).click();
    expect((await orderState(window)).repeat).toBe("all");
  } finally {
    await app.close();
  }

  app = await launch(userDataDir, home);
  try {
    const window = await app.firstWindow({ timeout: 60_000 });
    await expect(window).toHaveTitle(/CuePoint/i, { timeout: 30_000 });

    // Applied at the shell, before anything is queued — which is the point:
    // restoring after the first play would reorder a queue already running.
    await expect
      .poll(async () => orderState(window), { timeout: 20_000 })
      .toEqual({ shuffle: true, repeat: "all" });
  } finally {
    await app.close();
  }
});
