import { test, expect, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Playing from the Library table, by hand (PLAYER-09, DEC-012, DEC-013).
 *
 * The renderer tests drive the page against a faked bridge: they prove the
 * wiring and the wording. `playerQueue.spec.ts` proves a view resolves into a
 * playable queue. Neither proves the gesture — that a double-click on the
 * second row of the table a user is actually looking at plays *that* track,
 * with the queue in the order they can see.
 *
 * That distinction is the whole of DEC-012 and it is exactly the thing a fake
 * cannot check: the index the page sends is the row's position in the view, and
 * the view here is sorted by artist while the fixtures were imported in a
 * different order. A page that sent the row's id, or its position in the loaded
 * window, would pass every unit test and play the wrong track here.
 *
 * Repeat-one is turned on before anything plays. The fixtures are a quarter of
 * a second long, so without it the queue would advance underneath every
 * assertion about what is currently playing; with it the current entry stays
 * put and "Add to queue did not interrupt" becomes a thing that can be
 * checked at all. The volume is taken to zero because a test should not make
 * noise on the machine running it.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const AUDIO = path.resolve(DESKTOP_ROOT, "../../src/tests/fixtures/audio");

const FILES = ["tone.flac", "tone.wav", "tone.aiff", "tone.m4a"];

function toLocation(file: string): string {
  const full = path.join(AUDIO, file).split(path.sep).join("/");
  return "file://localhost/" + full.replace(/^\/+/, "");
}

/**
 * Four playable tracks whose artists run backwards against their ids, so
 * "sorted by artist" and "in the order they were imported" cannot be mistaken
 * for one another.
 */
function writeExport(dir: string): string {
  const entries = FILES.map((file, index) => {
    return (
      `<TRACK TrackID="${index + 1}" Name="Track ${index + 1}" ` +
      `Artist="Artist ${String(9 - index)}" Genre="Techno" Tonality="8A" ` +
      `AverageBpm="12${index}.00" TotalTime="1" Location="${toLocation(file)}"/>`
    );
  }).join("\n");

  const target = path.join(dir, "collection.xml");
  writeFileSync(
    target,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0"><COLLECTION Entries="${FILES.length}">
${entries}
</COLLECTION><PLAYLISTS><NODE Name="ROOT" Type="0"></NODE></PLAYLISTS></DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return target;
}

type Bridge = Record<string, any>;

/** The queue main is actually holding, read the way the panel reads it. */
async function queueTitles(win: Page): Promise<string[]> {
  return win.evaluate(async () => {
    const w = window as never as Bridge;
    const page = await w.cuepoint.player.queueWindow(0, 200);
    return page.items.map((item: { title: string }) => item.title);
  });
}

async function currentTitle(win: Page): Promise<string | null> {
  return win.evaluate(async () => {
    const w = window as never as Bridge;
    const state = await w.cuepoint.player.getState();
    return state.queue.currentItem?.title ?? null;
  });
}

/** The selection strip. The Inspector says the same words, so this is scoped. */
function selectionStrip(win: Page) {
  return win.locator(".cp-selection-actions__count");
}

/** The titles the table is showing, top to bottom. */
async function tableTitles(win: Page): Promise<string[]> {
  return win
    .locator('.track-table__row [data-column="title"]')
    .allInnerTexts()
    .then((values) => values.map((value) => value.trim()).filter(Boolean));
}

test("plays and queues from the Library table", async () => {
  test.setTimeout(240_000);
  const userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-lp-"));
  const cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
  const workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-xml-"));
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: cuepointHome,
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
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
    });
    await win.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
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

    await win.getByRole("link", { name: "Library" }).click();
    const table = win.getByRole("table", { name: "Library tracks" });
    await expect(table).toBeVisible({ timeout: 30_000 });
    await expect(win.locator(".track-table__row").first()).toBeVisible({ timeout: 30_000 });

    // See the note at the top: the fixtures are shorter than the assertions.
    await win.evaluate(async () => {
      const w = window as never as Bridge;
      await w.cuepoint.player.setVolume(0);
      await w.cuepoint.player.setRepeat("one");
    });

    const shown = await tableTitles(win);
    // Sorted by artist, which the fixtures deliberately import against.
    expect(shown).toEqual(["Track 4", "Track 3", "Track 2", "Track 1"]);

    // --- double-click plays that row, with the view as the queue (DEC-012) ---
    const rows = win.locator(".track-table__row");
    await rows.nth(1).dblclick();

    await expect.poll(() => currentTitle(win), { timeout: 30_000 }).toBe(shown[1]);
    expect(await queueTitles(win)).toEqual(shown);
    // The bar appears on first play and never before it (DEC-025, DEC-053).
    await expect(win.locator(".cp-player-bar")).toBeVisible({ timeout: 15_000 });

    // --- the menu on a row outside the selection acts on that row ---------
    await rows.nth(3).click({ button: "right" });
    const menu = win.getByRole("menu");
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "Add to queue" }).click();

    await expect(win.getByText("1 track added to the queue")).toBeVisible({ timeout: 15_000 });
    await expect.poll(() => queueTitles(win)).toEqual([...shown, shown[3]!]);
    // DEC-013's promise: appending never interrupts.
    expect(await currentTitle(win)).toBe(shown[1]);

    // --- Escape closes the menu and keeps the selection --------------------
    await rows.nth(0).click();
    await rows.nth(0).click({ button: "right" });
    await expect(win.getByRole("menu")).toBeVisible();
    await win.keyboard.press("Escape");
    await expect(win.getByRole("menu")).toBeHidden();
    await expect(selectionStrip(win)).toContainText("1 track selected");

    // --- a multi-row selection acts as one, in the view's order ------------
    await rows.nth(2).click({ modifiers: ["Shift"] });
    await expect(selectionStrip(win)).toContainText("3 tracks selected");
    await rows.nth(1).click({ button: "right" });
    await win.getByRole("menu").getByRole("menuitem", { name: "Play next" }).click();

    await expect(win.getByText("3 tracks queued to play next")).toBeVisible({ timeout: 15_000 });
    // Inserted straight after whatever is playing, still without interrupting.
    expect(await currentTitle(win)).toBe(shown[1]);
    const after = await queueTitles(win);
    const at = after.indexOf(shown[1]!);
    expect(after.slice(at + 1, at + 4)).toEqual([shown[0], shown[1], shown[2]]);

    // --- and none of it is mouse-only -------------------------------------
    await rows.nth(3).click();
    await win.locator(".track-table__scroll").focus();
    await win.keyboard.press("Enter");
    await expect.poll(() => currentTitle(win), { timeout: 15_000 }).toBe(shown[3]);
  } finally {
    await app.close();
  }
});
