import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";
import { NO_PLAYER, hasPlayer } from "./playerAvailable";

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

  const app = await electron.launch({
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
      localStorage.setItem("cuepoint-onboarding-complete", "1");
      localStorage.setItem("cuepoint-phase14-note-seen", "1");
    });
    await win.reload();
    await win.locator("main.app-main .screen").waitFor({ timeout: 30_000 });

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
    await win.locator("main.app-main .screen").waitFor({ timeout: 30_000 });

    await win.getByRole("link", { name: "Keys" }).click();
    await expect(win.getByRole("heading", { name: "Keys", level: 1 })).toBeVisible();

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
    await expect(win.getByRole("status").filter({ hasText: "in 2 playlists" })).toHaveText(
      "4 tracks in 2 playlists",
    );
    await expect(countOf("8A")).toHaveText("3");
    await expect(countOf("9A")).toHaveText("1");
    await expect(list.getByText("No Beatport key: 0")).toBeVisible();

    // Warmup alone is 8A x2 and 9A x1 (3 tracks).
    await sources.getByRole("checkbox", { name: "Peak" }).uncheck();
    await expect(win.getByRole("status").filter({ hasText: "in 1 playlist" })).toHaveText(
      "3 tracks in 1 playlist",
    );
    await expect(countOf("8A")).toHaveText("2");
    await expect(countOf("9A")).toHaveText("1");
    await sources.getByRole("checkbox", { name: "Peak" }).check();
    await expect(countOf("8A")).toHaveText("3");

    // Click a key: its tracks fill the table.
    await list.getByRole("button", { name: /^8A/ }).click();
    const rows = win.locator(".track-table__row");
    await expect(rows).toHaveCount(3, { timeout: 30_000 });
    const titles = await win
      .locator('.track-table__row [data-column="title"]')
      .allInnerTexts();
    expect(titles.map((t) => t.trim()).sort()).toEqual(["Track 1", "Track 2", "Track 4"]);

    // Play one from the list.
    await rows.nth(1).dblclick();
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
