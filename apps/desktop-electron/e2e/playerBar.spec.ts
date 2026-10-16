/**
 * The player bar in the running app, at every scale (PLAYER-06).
 *
 * Component tests can say what the bar renders; only the real shell can say
 * whether it *fits*. This checks the two things that break silently: the region
 * still occupies no space before the first play (DEC-025, DEC-053), and at 1x,
 * 1.5x, 2x and 3x nothing overflows, nothing is clipped, and the transport meets the
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
import { NO_PLAYER, hasPlayer } from "./playerAvailable";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const AUDIO = path.resolve(ROOT, "../../src/tests/fixtures/audio");

test("the player bar fits the shell at every scale", async () => {
  test.skip(!hasPlayer, NO_PLAYER);
  const env = { ...process.env, NODE_ENV: "production",
    CUEPOINT_HOME: mkdtempSync(path.join(tmpdir(), "cp-home-")) } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ cwd: ROOT,
    args: [".", `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "cp-ud-"))}`], env });
  try {
    const win: Page = await app.firstWindow({ timeout: 60_000 });
    await expect(win).toHaveTitle(/CuePoint/i, { timeout: 30_000 });

    // Before any play the bar is drawn all the same and says "Nothing playing" (area 83), so the
    // page does not jump by its height when something starts.
    await win.waitForSelector(".app-shell", { timeout: 20_000 });
    const empty = await win.evaluate(() => {
      const shell = document.querySelector(".app-shell");
      const el = document.querySelector(".app-shell__player");
      return { shell: !!shell, exists: !!el,
               height: el ? (el as HTMLElement).getBoundingClientRect().height : -1,
               children: el ? el.children.length : -1,
               bar: !!document.querySelector(".cp-player-bar") };
    });
    expect(empty.exists, "the region exists").toBe(true);
    expect(empty.height, "and holds the bar before the first play").toBeGreaterThan(0);
    expect(empty.bar, "so the bar is there, idle").toBe(true);
    await expect(win.locator(".cp-player-bar")).toContainText("Nothing playing");

    // Play something so the bar appears.
    await win.evaluate(async (files) => {
      const w = window as never as Record<string, any>;
      await w.cuepoint.player.playQueue(
        files.map((f: string, i: number) => ({ filePath: f, title: `Some Long Track Title ${i}`,
          artist: "An Artist With A Fairly Long Name", key: "8A", bpm: 128, durationSeconds: 600 })), 0);
      await w.cuepoint.player.pause();
    }, [path.join(AUDIO, "tone.flac"), path.join(AUDIO, "tone.wav")]);
    // 800px tall: a shorter window draws the compact bar, which has no facts line (area 90).
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 800);
    });
    await expect(win.locator(".cp-player-bar")).toContainText("Some Long Track Title 0", { timeout: 10_000 });
    // The first-run guide sits over the bar and takes the point the click-area check lands on.
    await win.getByRole("dialog", { name: "Getting started" }).getByRole("button", { name: "Skip" }).click();
    await expect(win.getByRole("dialog")).toHaveCount(0);

    for (const scale of [1, 1.5, 2, 3]) {
      const report = await win.evaluate((s) => {
        // Scale drives sizes through BOTH the attribute and the CSS variable.
        document.documentElement.dataset.scale = String(s);
        document.documentElement.style.setProperty("--scale", String(s));
        const bar = document.querySelector(".cp-player-bar") as HTMLElement;
        const rect = bar.getBoundingClientRect();
        // The title and artist links in the track line are words, not transport. The key chip
        // is a button inside the facts line (K8): its box is the chip's, and its hit area is a
        // layer round it, so it is checked below instead of here.
        const buttons = [...bar.querySelectorAll("button:not(.cp-player-bar__link):not([data-wheel-opener])")].map((b) => {
          const r = b.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) };
        });
        // The Wheel button (BAR-5) sits whole inside the bar, beside the track text.
        const key = bar.querySelector<HTMLElement>("[data-wheel-opener]");
        const kr = key?.getBoundingClientRect();
        // The chip's click area reaches --hit-min: a point just above and just below the chip still
        // lands on it (the chip's own box is smaller than that).
        const reach = (dy: number) =>
          kr !== undefined &&
          document.elementFromPoint(kr.left + kr.width / 2, kr.top + kr.height / 2 + dy) === key;
        // The chip is always on screen: a long artist name shrinks to an ellipsis, not the chip.
        const keyShown = reach(0);
        const keyArea = keyShown && reach(-(kr!.height / 2 + 1)) && reach(kr!.height / 2 + 1);
        const keyHit =
          kr !== undefined &&
          kr.top >= rect.top - 1 &&
          kr.bottom <= rect.bottom + 1 &&
          kr.right <= rect.right + 1 &&
          kr.width > 0;
        return {
          scale: s,
          keyHit,
          keyArea,
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
      expect(report.keyHit, `the key chip is not clipped at ${scale}x`).toBe(true);
      expect(report.keyArea, `the key chip's click area is taller than the chip at ${scale}x`).toBe(true);
      expect(report.minButton, `hit targets at ${scale}x`).toBeGreaterThanOrEqual(24);
      expect(report.clipped, `nothing clipped at ${scale}x`).toBe(false);
    }
    // A very long artist and label shrink to an ellipsis; the key chip, BPM and year stay whole.
    await win.evaluate(async (file) => {
      const w = window as never as Record<string, any>;
      await w.cuepoint.player.playQueue(
        [{ filePath: file, title: "T", artist: "An Extremely Long Artist Name ".repeat(12), label: "A Label ".repeat(10),
           key: "8A", bpm: 128, durationSeconds: 600 }], 0);
      await w.cuepoint.player.pause();
    }, path.join(AUDIO, "tone.flac"));
    for (const scale of [1, 3]) {
      const shown = await win.evaluate((s) => {
        document.documentElement.dataset.scale = String(s);
        document.documentElement.style.setProperty("--scale", String(s));
        const bar = document.querySelector(".cp-player-bar") as HTMLElement;
        const chip = bar.querySelector<HTMLElement>("[data-wheel-opener]");
        const r = chip?.getBoundingClientRect();
        const b = bar.getBoundingClientRect();
        return (
          r !== undefined && r.width > 0 && r.right <= b.right + 1 && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === chip
        );
      }, scale);
      expect(shown, `the key chip stays visible beside a very long artist at ${scale}x`).toBe(true);
    }
    // The transport buttons keep the heavy border and the hit target (C16c): the border is
    // --border-width, nothing casts a shadow, and the box is at least --hit-min tall.
    for (const scale of [1, 2]) {
      const button = await win.evaluate((s) => {
        document.documentElement.dataset.scale = String(s);
        document.documentElement.style.setProperty("--scale", String(s));
        const resolve = (token: string, property: "borderTopWidth" | "height") => {
          const probe = document.createElement("i");
          probe.style.cssText = `display:block;position:absolute;visibility:hidden;${
            property === "height" ? "height" : "border-top-width"
          }:var(${token});${property === "borderTopWidth" ? "border-top-style:solid;" : ""}`;
          document.body.appendChild(probe);
          const value = parseFloat(getComputedStyle(probe)[property]);
          probe.remove();
          return value;
        };
        const el = document.querySelector<HTMLElement>(".cp-player-bar__button")!;
        const style = getComputedStyle(el);
        return {
          borderTop: parseFloat(style.borderTopWidth),
          boxShadow: style.boxShadow,
          height: el.getBoundingClientRect().height,
          expectedBorder: resolve("--border-width", "borderTopWidth"),
          hitMin: resolve("--hit-min", "height"),
        };
      }, scale);
      expect(button.borderTop, `button border is --border-width at ${scale}x`).toBeCloseTo(button.expectedBorder, 1);
      expect(button.boxShadow, `button has no shadow at ${scale}x`).toBe("none");
      expect(button.height, `button is at least --hit-min tall at ${scale}x`).toBeGreaterThanOrEqual(button.hitMin - 0.5);
    }
    await win.evaluate(() => {
      document.documentElement.dataset.scale = "1.5";
      document.documentElement.style.setProperty("--scale", "1.5");
    });
  } finally { await app.close(); }
});

/**
 * C7: the waveform is centred between the left and right groups. BAR-5: the Wheel
 * button fits the bar.
 *
 * Both are layout, which jsdom cannot measure. Text is measured with a `Range`
 * (the box of the track section is wider than its words).
 */
test("the waveform is centred and the key chip fits", async () => {
  test.skip(!hasPlayer, NO_PLAYER);
  const env = { ...process.env, NODE_ENV: "production",
    CUEPOINT_HOME: mkdtempSync(path.join(tmpdir(), "cp-home-")) } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ cwd: ROOT,
    args: [".", `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "cp-ud-"))}`], env });
  try {
    const win: Page = await app.firstWindow({ timeout: 60_000 });
    await expect(win).toHaveTitle(/CuePoint/i, { timeout: 30_000 });
    await win.waitForSelector(".app-shell", { timeout: 20_000 });
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 800);
    });

    const files = [path.join(AUDIO, "tone.flac"), path.join(AUDIO, "tone.wav")];
    const titles = [
      ["short title", "Tone One"],
      ["long title", "Some Long Track Title That Keeps Going And Going"],
    ];
    for (const [label, trackTitle] of titles) {
      await win.evaluate(async ([fs, name]) => {
        const w = window as never as Record<string, any>;
        await w.cuepoint.player.playQueue(
          (fs as string[]).map((f) => ({ filePath: f, title: name, artist: "An Artist",
            key: "8A", bpm: 128, durationSeconds: 600 })), 0);
        await w.cuepoint.player.pause();
      }, [files, trackTitle] as const);
      await expect(win.locator(".cp-player-bar")).toContainText(trackTitle as string, { timeout: 10_000 });

      for (const scale of [1, 1.5, 2]) {
        const r = await win.evaluate((s) => {
          document.documentElement.dataset.scale = String(s);
          document.documentElement.style.setProperty("--scale", String(s));
          const bar = document.querySelector(".cp-player-bar") as HTMLElement;
          const rect = (el: Element) => el.getBoundingClientRect();
          const seek = rect(bar.querySelector(".cp-player-bar__seek")!);
          const controls = rect(bar.querySelector(".cp-player-bar__controls")!);
          // The words, not the box: the right edge of the widest line of text,
          // or the box's edge where a line is cut short with an ellipsis (a
          // Range measures the whole text, overflow included).
          const trackRight = rect(bar.querySelector(".cp-player-bar__track")!).right;
          const textRight = Math.min(trackRight, Math.max(
            ...[".cp-player-bar__title", ".cp-player-bar__meta"].map((sel) => {
              const range = document.createRange();
              range.selectNodeContents(bar.querySelector(sel)!);
              return range.getBoundingClientRect().right;
            }),
          ));
          const sameRow = Math.abs(seek.top - controls.top) < seek.height;

          // BAR-5: the Wheel button is whole inside the bar, and the line keeps the key as words.
          const key = bar.querySelector<HTMLElement>("[data-wheel-opener]")!;
          const kr = rect(key);
          const br = rect(bar);
          const wheelWhole = kr.width > 0 && kr.top >= br.top - 1 && kr.bottom <= br.bottom + 1 &&
            kr.right <= br.right + 1;
          const metaHasKey = (bar.querySelector(".cp-player-bar__meta")!.textContent ?? "").includes("8A");
          return {
            sameRow,
            // The left group ends at the track's words (the key chip is one of them).
            gapLeft: seek.left - textRight,
            gapRight: controls.left - seek.right,
            wheelWhole,
            metaHasKey,
          };
        }, scale);
        const at = `${label} at ${scale}x`;
        // The track takes up to 40% of the bar first (area 83), so a long title may push the seek to a
        // second row from 2x; a short one never does until 3x.
        if (scale !== 3 && !(scale === 2 && label === "long title")) expect(r.sameRow, `seek and controls share a row, ${at}`).toBe(true);
        if (r.sameRow) {
          expect(Math.abs(r.gapLeft - r.gapRight), `waveform centred, ${at} (left gap ${r.gapLeft}, right gap ${r.gapRight})`).toBeLessThanOrEqual(2);
        }
        expect(r.wheelWhole, `the key chip fits the bar, ${at}`).toBe(true);
        expect(r.metaHasKey, `the line keeps the key as words, ${at}`).toBe(true);
      }
    }
  } finally { await app.close(); }
});

/**
 * A disabled control's reason, with a real mouse. A disabled control swallows
 * pointer events, so the themed tip hangs on the wrapper; component tests can
 * only fire synthetic events at it. With no known duration the Seek slider is
 * disabled, and a track the library does not know gives it a reason.
 */
test("a disabled player-bar control shows the themed tip on a real hover", async () => {
  test.skip(!hasPlayer, NO_PLAYER);
  const env = { ...process.env, NODE_ENV: "production",
    CUEPOINT_HOME: mkdtempSync(path.join(tmpdir(), "cp-home-")) } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ cwd: ROOT,
    args: [".", `--user-data-dir=${mkdtempSync(path.join(tmpdir(), "cp-ud-"))}`], env });
  try {
    const win: Page = await app.firstWindow({ timeout: 60_000 });
    await expect(win).toHaveTitle(/CuePoint/i, { timeout: 30_000 });
    await win.waitForSelector(".app-shell", { timeout: 20_000 });
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1280, 800);
    });

    // The first-run guide sits over the bar and would take a real mouse.
    await win.getByRole("dialog", { name: "Getting started" })
      .getByRole("button", { name: "Skip" }).click();
    await expect(win.getByRole("dialog")).toHaveCount(0);

    await win.evaluate(async (file) => {
      const w = window as never as Record<string, any>;
      await w.cuepoint.player.playQueue(
        [{ filePath: file, trackId: 987654, title: "Not In The Library", artist: "Nobody",
           key: "8A", bpm: 128, durationSeconds: null }], 0);
    }, path.join(tmpdir(), "cp-no-such-file.flac"));
    await win.waitForSelector(".cp-player-bar", { timeout: 10_000 });

    const slider = win.getByRole("slider", { name: "Seek" });
    await expect(slider).toBeDisabled({ timeout: 10_000 });
    // Its reason arrives once the library has answered; the Hint then wraps it.
    await expect(slider).toHaveAttribute("title", /.+/, { timeout: 10_000 });
    const reason = await slider.getAttribute("title");

    // Away first so the move below is a fresh entry, then rest on it.
    await win.mouse.move(5, 5);
    await slider.hover({ force: true });
    await win.waitForTimeout(500);
    const tip = win.locator(".cp-hint__tip");
    await expect(tip).toBeVisible();
    await expect(tip).toHaveText(reason as string);
    // The browser's own tip would double the themed one.
    await expect(slider).not.toHaveAttribute("title", /.*/);

    await win.mouse.move(5, 5);
    await expect(tip).toHaveCount(0);
    await expect(slider).toHaveAttribute("title", reason as string);
  } finally { await app.close(); }
});
