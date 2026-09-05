import { test, expect, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Files that will not play, in the running app (PLAYER-10, DEC-054).
 *
 * The unit tests prove the coalescing and the controller tests prove the queue
 * keeps moving. Neither can prove the thing this step is actually judged on:
 * that a user who unplugs a drive and presses play sees **one** message rather
 * than one per track. That claim spans the queue in main, the notice channel,
 * the preload bridge, the renderer's subscription and the toast stack, and a
 * break anywhere along it looks fine in every unit test.
 *
 * Toasts are counted with a `MutationObserver` rather than by looking at the
 * screen, because they clear themselves after four seconds — a test that
 * sampled the DOM afterwards could see one toast and call it a success while
 * five hundred had come and gone.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const AUDIO = path.resolve(DESKTOP_ROOT, "../../src/tests/fixtures/audio");

type Bridge = Record<string, any>;

declare global {
  interface Window {
    __toasts?: Array<{ text: string; variant: string }>;
  }
}

/** Record every toast the app raises, including ones that clear themselves. */
async function watchToasts(win: Page): Promise<void> {
  await win.evaluate(() => {
    const seen: Array<{ text: string; variant: string }> = [];
    window.__toasts = seen;
    const stack = document.querySelector(".cp-toast-stack");
    if (!stack) throw new Error("no toast stack to watch");
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.classList.contains("cp-toast")) {
            seen.push({ text: node.textContent ?? "", variant: node.className });
          }
        }
      }
    }).observe(stack, { childList: true });
  });
}

async function toasts(win: Page): Promise<Array<{ text: string; variant: string }>> {
  return win.evaluate(() => window.__toasts ?? []);
}

async function clearToasts(win: Page): Promise<void> {
  await win.evaluate(() => {
    if (window.__toasts) window.__toasts.length = 0;
  });
}

test("a queue of files that are not there says one thing and stops", async () => {
  test.setTimeout(180_000);
  const userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-pf-"));
  const home = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: home,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await electron.launch({
    cwd: DESKTOP_ROOT,
    args: [".", `--user-data-dir=${userDataDir}`],
    env,
  });
  try {
    const win = await app.firstWindow({ timeout: 60_000 });
    await expect(win).toHaveTitle(/CuePoint/i, { timeout: 30_000 });
    await win.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
    await win.reload();
    await win.locator("main.app-main").waitFor({ timeout: 30_000 });
    await watchToasts(win);
    await win.evaluate(() => (window as never as Bridge).cuepoint.player.setVolume(0));

    // --- a whole queue on a drive that is not there -----------------------
    await win.evaluate(async () => {
      const bridge = (window as never as Bridge).cuepoint;
      await bridge.player.playQueue(
        Array.from({ length: 8 }, (_, index) => ({
          filePath: `/definitely/not/here/${index}.flac`,
          title: `Gone ${index}`,
          artist: "Nowhere",
        })),
        0,
      );
    });

    await expect.poll(async () => (await toasts(win)).length, { timeout: 30_000 }).toBeGreaterThan(
      0,
    );
    // Long enough that a per-track message would have arrived by now — eight
    // files that do not exist are opened and refused in well under a second.
    await win.waitForTimeout(2_000);

    const raised = await toasts(win);
    expect(raised).toHaveLength(1);
    expect(raised[0]!.text).toMatch(/^\d+ tracks could not be played — playback stopped$/);
    // Playback stopped rather than spinning, and every item carries the mark.
    const state = await win.evaluate(async () => {
      const bridge = (window as never as Bridge).cuepoint;
      const page = await bridge.player.queueWindow(0, 100);
      const snapshot = await bridge.player.getState();
      return {
        statuses: page.items.map((item: { status: string }) => item.status),
        playing: snapshot.playback.playing,
      };
    });
    expect(state.playing).toBe(false);
    expect(state.statuses.every((status: string) => status === "failed")).toBe(true);

    // --- one bad file among good ones is named, and skipped ---------------
    await clearToasts(win);
    await win.evaluate(async (good) => {
      const bridge = (window as never as Bridge).cuepoint;
      await bridge.player.playQueue(
        [
          { filePath: "/definitely/not/here/one.flac", title: "Missing One" },
          { filePath: good, title: "Real Track" },
        ],
        0,
      );
    }, path.join(AUDIO, "tone.flac"));

    await expect.poll(async () => (await toasts(win)).length, { timeout: 30_000 }).toBe(1);
    const single = (await toasts(win))[0]!;
    expect(single.text).toContain("Could not play “Missing One”");
    // It carried on: a skipped track is a warning, not the end of playback.
    expect(single.text).not.toContain("playback stopped");
    expect(single.variant).toContain("cp-toast--warning");

    // --- and the same item plays once it points at a real file ------------
    await clearToasts(win);
    await win.evaluate(async (good) => {
      const bridge = (window as never as Bridge).cuepoint;
      await bridge.player.playQueue([{ filePath: good, title: "Retried" }], 0);
      await bridge.player.pause();
    }, path.join(AUDIO, "tone.flac"));

    await expect
      .poll(
        async () =>
          win.evaluate(async () => {
            const page = await (window as never as Bridge).cuepoint.player.queueWindow(0, 10);
            return page.items[0]?.status ?? null;
          }),
        { timeout: 15_000 },
      )
      .toBe("playing");
    expect(await toasts(win)).toHaveLength(0);
  } finally {
    await app.close();
  }
});
