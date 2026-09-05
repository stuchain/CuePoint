import { test, expect, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The queue panel in the running app (PLAYER-08, DEC-013).
 *
 * The component tests drive the panel against a fake bridge. This drives the
 * real one: the window comes from the queue main is actually holding, and the
 * edits go back to it. Those are the two halves that a fake cannot prove are
 * joined, and a mismatch there would show a queue that disagrees with what is
 * about to play — which is exactly the thing DEC-013 wanted the panel for.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const AUDIO = path.resolve(DESKTOP_ROOT, "../../src/tests/fixtures/audio");

const FIXTURES = ["tone.flac", "tone.wav", "tone.aiff", "tone.m4a"];

async function dismissOnboarding(window: Page): Promise<void> {
  await window.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
  await window.reload();
  await window.locator("main.app-main").waitFor({ timeout: 30_000 });
}

test("the queue panel shows the real queue and edits it", async () => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-qp-"));
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
    const window = await app.firstWindow({ timeout: 60_000 });
    await expect(window).toHaveTitle(/CuePoint/i, { timeout: 30_000 });
    await dismissOnboarding(window);

    // Queue four real fixtures, paused, so nothing runs on underneath the test.
    await window.evaluate(async (files) => {
      const bridge = (window as never as Record<string, any>).cuepoint;
      await bridge.player.playQueue(
        files.map((file: string, index: number) => ({
          filePath: file,
          title: `Queued ${index}`,
          artist: "Fixture",
        })),
        0,
      );
      await bridge.player.pause();
    }, FIXTURES.map((file) => path.join(AUDIO, file)));
    await window.waitForSelector(".cp-player-bar", { timeout: 15_000 });

    // The bar's toggle opens it, and it lists what main is actually holding.
    await window.getByRole("button", { name: /Show queue/ }).click();
    const panel = window.getByRole("complementary", { name: "Playback queue" });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("option")).toHaveCount(FIXTURES.length);
    await expect(panel.getByText("Queued 0")).toBeVisible();
    await expect(panel.getByRole("option").first()).toHaveAttribute("aria-selected", "true");

    // Reorder without a mouse, and check main agrees.
    await panel.getByRole("option").nth(3).focus();
    await window.keyboard.press("Alt+ArrowUp");
    await expect
      .poll(async () =>
        window.evaluate(async () => {
          const page = await (window as never as Record<string, any>).cuepoint.player.queueWindow(0, 10);
          return page.items.map((entry: { title: string }) => entry.title);
        }),
      )
      .toEqual(["Queued 0", "Queued 1", "Queued 3", "Queued 2"]);

    // Remove one, and check both the panel and main lost it.
    await panel.getByRole("button", { name: /Remove Queued 1 from queue/ }).click();
    await expect(panel.getByRole("option")).toHaveCount(3);
    expect(
      await window.evaluate(async () => {
        const page = await (window as never as Record<string, any>).cuepoint.player.queueWindow(0, 10);
        return page.total;
      }),
    ).toBe(3);

    // Jump to a track by pressing Enter on its row.
    await panel.getByRole("option").nth(2).focus();
    await window.keyboard.press("Enter");
    await expect
      .poll(async () =>
        window.evaluate(async () => {
          const state = await (window as never as Record<string, any>).cuepoint.player.getState();
          return state.queue.currentItem?.title ?? null;
        }),
      )
      .toBe("Queued 2");

    // And it closes again.
    await panel.getByRole("button", { name: "Close queue" }).click();
    await expect(panel).toBeHidden();
  } finally {
    await app.close();
  }
});
