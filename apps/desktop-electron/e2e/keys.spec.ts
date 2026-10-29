import { test, expect } from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";
import { clickRowAt } from "./rowClick";
import { NO_PLAYER, hasPlayer } from "./playerAvailable";
import { probeScrollbar } from "./scrollbarProbe";
import { launchElectron } from "./support/launchApp";

/**
 * The Keys page (PAGES-16, FLW-21): tick two playlists, read the counts, click
 * a key, play a track from the list.
 *
 * Four playable tracks. Warmup holds 1, 2, 3 and Peak holds 3, 4, so track 3 is
 * in both and must count once. Keys are the user's own (the resolved key, never
 * Rekordbox's imported one): 8A on tracks 1, 2 and 4, 9A on track 3.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const AUDIO = path.resolve(DESKTOP_ROOT, "../../src/tests/fixtures/audio");
const FILES = ["tone.flac", "tone.wav", "tone.aiff", "tone.m4a"];

function toLocation(file: string): string {
  const full = path.join(AUDIO, file).split(path.sep).join("/");
  return "file://localhost/" + full.replace(/^\/+/, "");
}

function writeExport(dir: string): string {
  const entries = FILES.map(
    (file, index) =>
      `<TRACK TrackID="${index + 1}" Name="Track ${index + 1}" Artist="Artist ${index + 1}" ` +
      `Genre="Techno" Tonality="1A" AverageBpm="12${index}.00" TotalTime="1" ` +
      `Location="${toLocation(file)}"/>`,
  ).join("\n");
  const members = (ids: number[]) => ids.map((id) => `<TRACK Key="${id}"/>`).join("");
  const target = path.join(dir, "collection.xml");
  writeFileSync(
    target,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0"><COLLECTION Entries="${FILES.length}">
${entries}
</COLLECTION><PLAYLISTS><NODE Name="ROOT" Type="0">
<NODE Name="Warmup" Type="1" Entries="3">${members([1, 2, 3])}</NODE>
<NODE Name="Peak" Type="1" Entries="2">${members([3, 4])}</NODE>
</NODE></PLAYLISTS></DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return target;
}

type Bridge = Record<string, any>;

test("counts the keys of two playlists, opens one key, and plays from it", async () => {
  test.skip(!hasPlayer, NO_PLAYER);
  test.setTimeout(240_000);
  const userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-keys-"));
  const cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
  const workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-xml-"));
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;

  const app = await launchElectron({
    cwd: DESKTOP_ROOT,
    args: [".", `--user-data-dir=${userDataDir}`],
    env,
  });
  try {
    const win = await app.firstWindow({ timeout: 60_000 });
    await waitForEngine(win);
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
    });
    await win.evaluate(() => {
      (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.getItem("cuepoint-ui-lab-scale") === "1.25" && localStorage.removeItem("cuepoint-ui-lab-scale"));
      localStorage.setItem("cuepoint-phase14-note-seen", "1");
    });
    await win.reload();
    await win.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });

    const started = await win.evaluate(
      (file) => (window as never as Bridge).cuepoint.startLibraryImport({ xml_path: file }),
      writeExport(workspace),
    );
    await expect
      .poll(
        async () =>
          (
            await win.evaluate(
              (id) => (window as never as Bridge).cuepoint.getJob(id),
              started.job_id,
            )
          ).state,
        { timeout: 90_000 },
      )
      .toBe("succeeded");
    await win.evaluate(async () => {
      const c = (window as never as Bridge).cuepoint;
      for (const [trackId, key] of [
        [1, "8A"],
        [2, "8A"],
        [3, "9A"],
        [4, "8A"],
      ] as const) {
        await c.setTrackOverrides({ trackId, key });
      }
      await c.player.setVolume(0);
      await c.player.setRepeat("one");
    });
    await win.reload();
    await win.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });

    await win.getByRole("link", { name: "Keys" }).click();
    await expect(win.getByRole("heading", { name: "Keys", level: 1 })).toBeVisible();

    // The page opens on the wheel (K15); these steps read the list. The Wheel | List switch is in
    // the Keys pane's own head (D19), a radio pair above the wheel.
    const trackBar = win.getByRole("toolbar", { name: "Track list" });
    await expect(trackBar.getByRole("button", { name: "Open in Library" })).toBeVisible();
    // The decision's size: 1264 x 735 at text size 1.25.
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1264, 735);
    });
    await win.evaluate(() => localStorage.setItem("cuepoint-ui-lab-scale", "1.25"));
    await win.reload();
    await expect(win.getByRole("group", { name: "Keys" })).toBeVisible({ timeout: 30_000 });
    // Two panes (D12): the list's toolbar sits to the right of the wheel, on the wheel's top line.
    // P7: the wheel sits in its own padded pane, so the pane (not the SVG) shares the toolbar's top.
    const wheelBox = await win.locator(".keys-page__view").boundingBox();
    const barBox = await trackBar.boundingBox();
    expect(barBox!.x, "toolbar is right of the wheel").toBeGreaterThanOrEqual(wheelBox!.x + wheelBox!.width);
    expect(Math.abs(barBox!.y - wheelBox!.y), "toolbar and wheel share their top").toBeLessThanOrEqual(1);
    await win.getByRole("radio", { name: "List" }).click();
    const list = win.getByRole("group", { name: "Keys in these sources" });
    // The exact count on a key's row (its count cell, not a substring of the row).
    const countOf = (code: string) =>
      list.getByRole("button", { name: new RegExp(`^${code},`) }).locator(".keys-counts__count");

    // The whole library to start: 3 tracks in 8A, 1 in 9A.
    await expect(countOf("8A")).toHaveText("3", { timeout: 30_000 });
    await expect(countOf("9A")).toHaveText("1");

    // Two playlists ticked. Warmup holds 1, 2, 3 and Peak holds 3, 4, so track 3 (9A) is in
    // both: counted once the page says 4 tracks, 8A x3 and 9A x1; counted twice it would say
    // 5 tracks and 9A x2.
    const sources = win.getByRole("group", { name: "Sources" });
    await sources.getByRole("checkbox", { name: "Warmup" }).check();
    await sources.getByRole("checkbox", { name: "Peak" }).check();
    const facts = win.locator(".cp-screen-header__summary");
    await expect(facts).toHaveText("4 tracks · 2 playlists");
    await expect(countOf("8A")).toHaveText("3");
    await expect(countOf("9A")).toHaveText("1");
    // "— no key" is one more row of the list (C258).
    // M399: one no-key wording, "No key".
    await expect(list.getByRole("button", { name: "No key: 0" })).toBeVisible();

    // Warmup alone is 8A x2 and 9A x1 (3 tracks).
    await sources.getByRole("checkbox", { name: "Peak" }).uncheck();
    await expect(facts).toHaveText("3 tracks · 1 playlist");
    await expect(countOf("8A")).toHaveText("2");
    await expect(countOf("9A")).toHaveText("1");
    await sources.getByRole("checkbox", { name: "Peak" }).check();
    await expect(countOf("8A")).toHaveText("3");

    // With no key picked the table beside the wheel already lists every track in the sources
    // (D12); clicking a key narrows it at once.
    await expect(win.locator("main.app-main .screen:visible .track-table__row")).toHaveCount(4, {
      timeout: 30_000,
    });
    await list.getByRole("button", { name: /^8A/ }).click();

    // The pressed key's row is lit by the selected-row background, a gradient from the accent.
    const pressed = list.getByRole("button", { name: /^8A/ });
    await expect(pressed).toHaveAttribute("aria-pressed", "true");
    const lit = await pressed.evaluate((el) => {
      const probe = document.createElement("i");
      probe.style.color = "var(--accent-primary)";
      document.body.appendChild(probe);
      const accent = getComputedStyle(probe).color;
      probe.remove();
      return { image: getComputedStyle(el).backgroundImage, accent };
    });
    expect(lit.image, "the pressed row paints a gradient").toContain("linear-gradient");
    expect(lit.image, "from the accent colour").toContain(lit.accent);

    // The key list scrolls inside its own box with the themed bar, never the page.
    // A pointer resting over a scroller reads back the thumb's hover colour; park it away.
    await win.mouse.move(0, 0);
    const counts = await probeScrollbar(win, ".keys-counts");
    expect(counts.overflowY, "the key list scrolls inside its own box").toMatch(/auto|scroll/);
    expect(counts.pageScrolls, "the page itself does not scroll").toBe(false);
    expect(counts.scrollbarColor).toBe("auto");
    expect(counts.scrollbarWidth).toBe("auto");
    expect(counts.thumb).toBe(counts.expectedThumb);
    expect(counts.track).toBe(counts.expectedTrack);
    // Two playlists give a few keys, which fit; only colours and overflow-y are checked unless it overflows.
    if (counts.overflows) expect(counts.barWidth).toBeCloseTo(counts.expectedWidth, 0);
    const rows = win.locator("main.app-main .screen:visible .track-table__row");
    await expect(rows).toHaveCount(3, { timeout: 30_000 });
    const titles = await win
      .locator('main.app-main .screen:visible .track-table__row [data-column="title"]')
      .allInnerTexts();
    expect(titles.map((t) => t.trim()).sort()).toEqual(["Track 1", "Track 2", "Track 4"]);

    // Play one from the list.
    // An unselected row, double-clicked where it is: the selection bar the first click brings is
    // drawn over the table's bottom rows, so the second click lands on the same row (option 1A).
    await expect(win.getByRole("toolbar", { name: "Selection" })).toHaveCount(0);
    await clickRowAt(win, rows.nth(1), { clickCount: 2 });
    await expect
      .poll(
        () =>
          win.evaluate(async () => {
            const state = await (window as never as Bridge).cuepoint.player.getState();
            return state.queue.currentItem?.title ?? null;
          }),
        { timeout: 30_000 },
      )
      .toBe(titles[1]!.trim());
    await expect(win.locator(".cp-player-bar")).toBeVisible({ timeout: 15_000 });
  } finally {
    await app.close();
  }
});
