import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Audio output settings in the running app (PLAYER-11, DEC-055).
 *
 * DEC-055's own risk note says this step needs real hardware on two operating
 * systems and cannot be fully validated in CI. That is true of *which speaker
 * the sound comes out of* — and it is not true of the parts that break: the
 * device list crossing five layers, the choice surviving a restart, and the
 * runtime fallback when the chosen device is not there.
 *
 * The fallback is the one worth having here. It is the part DEC-055 called
 * "most likely to be under-built", and it can be provoked on any machine
 * without unplugging anything: mpv accepts a device name it has never heard of
 * without complaint and finds out at the next `loadfile`, which is exactly what
 * an unplugged interface looks like from inside the app.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const AUDIO = path.resolve(DESKTOP_ROOT, "../../src/tests/fixtures/audio");

type Bridge = Record<string, any>;

declare global {
  interface Window {
    __audioToasts?: string[];
  }
}

function launch(userDataDir: string, home: string): Promise<ElectronApplication> {
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

async function ready(app: ElectronApplication): Promise<Page> {
  const win = await app.firstWindow({ timeout: 60_000 });
  await expect(win).toHaveTitle(/CuePoint/i, { timeout: 30_000 });
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
  });
  await win.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
  await win.reload();
  await win.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  return win;
}

/** Record every toast, including ones that clear themselves after four seconds. */
async function watchToasts(win: Page): Promise<void> {
  await win.evaluate(() => {
    const seen: string[] = [];
    window.__audioToasts = seen;
    const stack = document.querySelector(".cp-toast-stack");
    if (!stack) throw new Error("no toast stack to watch");
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains("cp-toast")) {
            seen.push(node.textContent ?? "");
          }
        }
      }
    }).observe(stack, { childList: true });
  });
}

async function openAudioSettings(win: Page) {
  await win.evaluate(() => {
    window.location.hash = "#/settings";
  });
  const panel = win.locator(".cp-audio-settings");
  await panel.waitFor({ timeout: 30_000 });
  return panel;
}

async function audioState(win: Page) {
  return win.evaluate(async () => {
    const state = await (window as never as Bridge).cuepoint.player.getState();
    return state.audio;
  });
}

test("choosing an output device, keeping it, and surviving it going away", async () => {
  test.setTimeout(240_000);
  const userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-pa-"));
  const home = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));

  let app = await launch(userDataDir, home);
  try {
    let win = await ready(app);
    await watchToasts(win);

    // The renderer must keep running while the window is in the background.
    // Chromium throttles background renderers by default, which for a music
    // player means the position stops moving and replies from main sit
    // undelivered until the window is touched — found by this very test, which
    // hung for four minutes on an answer main had already sent.
    expect(
      await app.evaluate(
        ({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.backgroundThrottling,
      ),
    ).toBe(false);

    const panel = await openAudioSettings(win);

    // --- the list is real, and comes from mpv ------------------------------
    const picker = panel.getByRole("combobox", { name: /Output device/i });
    await expect(picker).toBeEnabled({ timeout: 30_000 });
    // "System default" is mpv's `auto` in the app's own words and is always
    // there; anything else depends on the machine.
    await expect(panel.getByRole("option", { name: "System default" })).toHaveCount(1);
    const options = await panel.getByRole("option").count();
    expect(options).toBeGreaterThan(0);

    const supported = (await audioState(win)).exclusiveSupported;
    const exclusive = panel.getByRole("checkbox", { name: /Exclusive output/i });

    if (supported) {
      // --- the toggle reaches the player ----------------------------------
      await exclusive.check();
      await expect.poll(async () => (await audioState(win)).exclusive).toBe(true);
    } else {
      // DEC-055: disabled with a reason rather than a control that lies.
      await expect(exclusive).toBeDisabled();
      await expect(panel.getByText(/Windows and macOS feature/i)).toBeVisible();
    }

    // --- it survives a restart, and is in force before the first track -----
    await app.close();
    app = await launch(userDataDir, home);
    win = await ready(app);
    await watchToasts(win);

    if (supported) {
      await expect.poll(async () => (await audioState(win)).exclusive, { timeout: 30_000 }).toBe(
        true,
      );
      const restored = await openAudioSettings(win);
      await expect(
        restored.getByRole("checkbox", { name: /Exclusive output/i }),
      ).toBeChecked();
    }

    // --- a device that is not there falls back, and the music keeps going --
    // What an unplugged interface looks like from inside the app: mpv takes
    // the name without complaint and finds out at the next file.
    await win.evaluate(async () => {
      const bridge = (window as never as Bridge).cuepoint;
      await bridge.player.setVolume(0);
      await bridge.player.setAudioSettings({
        device: "cuepoint/not-a-real-device",
        exclusive: false,
      });
    });
    await expect.poll(async () => (await audioState(win)).device).toBe(
      "cuepoint/not-a-real-device",
    );

    await win.evaluate(async (file) => {
      const bridge = (window as never as Bridge).cuepoint;
      await bridge.player.playQueue([{ filePath: file, title: "Fallback Test" }], 0);
    }, path.join(AUDIO, "tone.flac"));

    // Said out loud, non-fatally, exactly as DEC-055 requires.
    await expect
      .poll(async () => win.evaluate(() => window.__audioToasts ?? []), { timeout: 30_000 })
      .toContainEqual(
        "The selected audio device is not available — playing through the system default.",
      );

    // The choice is kept — the interface may be back in a minute — while what
    // is actually playing has moved to something that works.
    const after = await audioState(win);
    expect(after.device).toBe("cuepoint/not-a-real-device");
    expect(after.activeDevice).toBe("auto");

    // And the panel says so rather than showing a picker that claims otherwise.
    const fellBack = await openAudioSettings(win);
    await expect(fellBack.getByText(/the selected device was not available/i)).toBeVisible();

    // The track was retried rather than skipped: it was never the problem.
    const queue = await win.evaluate(async () => {
      const page = await (window as never as Bridge).cuepoint.player.queueWindow(0, 10);
      return page.items.map((item: { status: string }) => item.status);
    });
    expect(queue).not.toContain("failed");
  } finally {
    await app.close();
  }
});
