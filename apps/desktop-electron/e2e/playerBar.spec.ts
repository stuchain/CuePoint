/**
 * The player bar in the running app, at every scale (PLAYER-06).
 *
 * Component tests can say what the bar renders; only the real shell can say
 * whether it *fits*. This checks the two things that break silently: the region
 * still occupies no space before the first play (DEC-025, DEC-053), and at 1x,
 * 2x and 3x nothing overflows, nothing is clipped, and the transport meets the
 * hit-target floor the design sign-off measures against.
 *
 * Scale is applied the way the app applies it — the `data-scale` attribute
 * *and* the `--scale` custom property. Setting only the attribute leaves every
 * size unchanged, which makes a scale test that passes without testing
 * anything.
 */
import { test, expect, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AUDIO = path.resolve(ROOT, "../../src/tests/fixtures/audio");

test("the player bar fits the shell at every scale", async () => {
  const env = { ...process.env, NODE_ENV: "production",
    CUEPOINT_HOME: mkdtempSync(path.join(tmpdir(), "cp-home-")) } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ cwd: ROOT,
    args: [".", `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "cp-ud-"))}`], env });
  try {
    const win: Page = await app.firstWindow({ timeout: 60_000 });
    await expect(win).toHaveTitle(/CuePoint/i, { timeout: 30_000 });

    // Before any play: the region must occupy no space at all (DEC-025/053).
    await win.waitForSelector(".app-shell", { timeout: 20_000 });
    const empty = await win.evaluate(() => {
      const shell = document.querySelector(".app-shell");
      const el = document.querySelector(".app-shell__player");
      return { shell: !!shell, exists: !!el,
               height: el ? (el as HTMLElement).getBoundingClientRect().height : -1,
               children: el ? el.children.length : -1,
               bar: !!document.querySelector(".cp-player-bar") };
    });
    // The zero-height promise SHELL-06 made and DEC-053 kept.
    expect(empty.exists, "the region exists").toBe(true);
    expect(empty.height, "and takes no space before the first play").toBe(0);
    expect(empty.children, "and holds nothing").toBe(0);
    expect(empty.bar, "so there is no bar yet").toBe(false);

    // Play something so the bar appears.
    await win.evaluate(async (files) => {
      const w = window as never as Record<string, any>;
      await w.cuepoint.player.playQueue(
        files.map((f: string, i: number) => ({ filePath: f, title: `Some Long Track Title ${i}`,
          artist: "An Artist With A Fairly Long Name", key: "8A", bpm: 128, durationSeconds: 600 })), 0);
      await w.cuepoint.player.pause();
    }, [path.join(AUDIO, "tone.flac"), path.join(AUDIO, "tone.wav")]);
    await win.waitForSelector(".cp-player-bar", { timeout: 10_000 });

    for (const scale of [1, 2, 3]) {
      const report = await win.evaluate((s) => {
        // Scale drives sizes through BOTH the attribute and the CSS variable.
        document.documentElement.dataset.scale = String(s);
        document.documentElement.style.setProperty("--scale", String(s));
        const bar = document.querySelector(".cp-player-bar") as HTMLElement;
        const rect = bar.getBoundingClientRect();
        const buttons = [...bar.querySelectorAll("button")].map((b) => {
          const r = b.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        });
        return {
          scale: s,
          barHeight: Math.round(rect.height),
          overflowsRight: Math.round(rect.right) > Math.round(document.documentElement.clientWidth),
          docScrollsX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          minButton: Math.min(...buttons.map((b) => Math.min(b.w, b.h))),
          clipped: [...bar.querySelectorAll("*")].some((el) => {
            const r = el.getBoundingClientRect();
            return r.right > rect.right + 1 || r.left < rect.left - 1;
          }),
        };
      }, scale);
      expect(report.docScrollsX, `no horizontal scroll at ${scale}x`).toBe(false);
      expect(report.overflowsRight, `bar within viewport at ${scale}x`).toBe(false);
      expect(report.minButton, `hit targets at ${scale}x`).toBeGreaterThanOrEqual(24);
      expect(report.clipped, `nothing clipped at ${scale}x`).toBe(false);
    }
    await win.evaluate(() => {
      document.documentElement.dataset.scale = "2";
      document.documentElement.style.setProperty("--scale", "2");
    });
  } finally { await app.close(); }
});
