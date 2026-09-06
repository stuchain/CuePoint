import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Phase 5 end to end, in the running app (PLAYER-12).
 *
 * The shape LIBUI-10 set for Phase 4: one session of the real app walking the
 * whole phase, rather than another test of a part that already has one.
 *
 *   import → double-click → the bar appears → the queue is the view →
 *   next → previous → reorder the queue → Space → quit → relaunch
 *
 * Two of those steps are the ones worth the launch. **Nothing resumes**
 * (DEC-014) can only be shown by quitting and starting again, and a player that
 * remembered its position would look completely correct until that moment. And
 * **the app must still work with no player at all** (cross-cutting fact 4) —
 * a promise that is only ever true in the run where mpv is missing, which no
 * other test creates.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const AUDIO = path.resolve(DESKTOP_ROOT, "../../src/tests/fixtures/audio");

type Bridge = Record<string, any>;

/** Real audio, so the queue is genuinely playable and gapless is real. */
const FILES = ["tone.flac", "tone.wav", "tone.aiff", "tone.m4a"];

function toLocation(file: string): string {
  const full = path.join(AUDIO, file).split(path.sep).join("/");
  return "file://localhost/" + full.replace(/^\/+/, "");
}

/** Artists run backwards against ids, so a sorted view is not the import order. */
function writeExport(dir: string): string {
  const entries = FILES.map(
    (file, index) =>
      `<TRACK TrackID="${index + 1}" Name="Track ${index + 1}" ` +
      `Artist="Artist ${9 - index}" Genre="Techno" Tonality="8A" ` +
      `AverageBpm="12${index}.00" TotalTime="1" Location="${toLocation(file)}"/>`,
  ).join("\n");
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

function launch(
  userDataDir: string,
  home: string,
  extraEnv: Record<string, string> = {},
): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: home,
    ...extraEnv,
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

async function importCollection(win: Page, xmlPath: string): Promise<void> {
  const started = await win.evaluate(
    (file) => (window as never as Bridge).cuepoint.startLibraryImport({ xml_path: file }),
    xmlPath,
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
}

async function openLibrary(win: Page) {
  await win.getByRole("link", { name: "Library" }).click();
  const table = win.getByRole("table", { name: "Library tracks" });
  await expect(table).toBeVisible({ timeout: 30_000 });
  await win.locator(".track-table__row").first().waitFor({ timeout: 30_000 });
  return table;
}

async function currentTitle(win: Page): Promise<string | null> {
  return win.evaluate(async () => {
    const state = await (window as never as Bridge).cuepoint.player.getState();
    return state.queue.currentItem?.title ?? null;
  });
}

async function isPaused(win: Page): Promise<boolean> {
  return win.evaluate(async () => {
    const state = await (window as never as Bridge).cuepoint.player.getState();
    return state.playback.paused;
  });
}

async function queueTitles(win: Page): Promise<string[]> {
  return win.evaluate(async () => {
    const page = await (window as never as Bridge).cuepoint.player.queueWindow(0, 200);
    return page.items.map((item: { title: string }) => item.title);
  });
}

test.describe("Phase 5 end to end", () => {
  let userDataDir: string;
  let home: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-p5-"));
    home = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-xml-"));
  });

  test("plays, queues, reorders, takes the keyboard — and remembers nothing", async () => {
    test.setTimeout(240_000);
    let app = await launch(userDataDir, home);
    try {
      let win = await ready(app);
      await importCollection(win, writeExport(workspace));
      await openLibrary(win);
      // Quiet: this walks a real player through real files.
      await win.evaluate(() => (window as never as Bridge).cuepoint.player.setVolume(0));

      // --- the region is empty until the first play (DEC-025, DEC-053) ------
      expect(await win.locator(".cp-player-bar").count()).toBe(0);

      // --- double-click plays that row, with the view as the queue (DEC-012)
      const rows = win.locator(".track-table__row");
      const shown = await win
        .locator('.track-table__row [data-column="title"]')
        .allInnerTexts()
        .then((values) => values.map((value) => value.trim()).filter(Boolean));
      // Sorted by artist, which the fixtures deliberately import against.
      expect(shown).toEqual(["Track 4", "Track 3", "Track 2", "Track 1"]);

      // Repeat-one so the current track stays put: the fixtures are a quarter
      // of a second long and would otherwise run out from under the assertions.
      await win.evaluate(() => (window as never as Bridge).cuepoint.player.setRepeat("one"));
      await rows.nth(1).dblclick();

      await expect(win.locator(".cp-player-bar")).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => currentTitle(win), { timeout: 30_000 }).toBe(shown[1]);
      expect(await queueTitles(win)).toEqual(shown);

      // --- next and previous, from the bar's own buttons --------------------
      await win.getByRole("button", { name: "Next track" }).click();
      await expect.poll(() => currentTitle(win), { timeout: 15_000 }).toBe(shown[2]);
      await win.getByRole("button", { name: "Previous track" }).click();
      await expect.poll(() => currentTitle(win), { timeout: 15_000 }).toBe(shown[1]);

      // --- the queue panel, reordered without a mouse (PLAYER-08) -----------
      await win.getByRole("button", { name: /Show queue/ }).click();
      const panel = win.getByRole("complementary", { name: "Playback queue" });
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("option")).toHaveCount(FILES.length);
      await panel.getByRole("option").nth(3).focus();
      await win.keyboard.press("Alt+ArrowUp");
      await expect
        .poll(() => queueTitles(win), { timeout: 15_000 })
        .toEqual([shown[0], shown[1], shown[3], shown[2]]);
      await panel.getByRole("button", { name: "Close queue" }).click();

      // --- Space is play/pause, and only where it should be (PLAYER-12) -----
      // Repeat-one comes off first, and the state is *set* before each press
      // rather than inherited. Both matter, and the second only became visible
      // on a re-run: the fixtures are a quarter of a second long, so under
      // repeat-one mpv restarts the file several times a second — and every
      // restart clears `pause`. A pause assertion in that environment is a
      // race with the loop, which is exactly how this step failed.
      await win.evaluate(() => (window as never as Bridge).cuepoint.player.setRepeat("off"));
      await win.evaluate(() => (window as never as Bridge).cuepoint.player.stop());
      await expect
        .poll(
          async () =>
            win.evaluate(async () => {
              const state = await (window as never as Bridge).cuepoint.player.getState();
              return state.playback.playing;
            }),
          { timeout: 15_000 },
        )
        .toBe(false);
      await win.locator("main.app-main").click({ position: { x: 5, y: 5 } });
      await win.evaluate(() => (window as never as Bridge).cuepoint.player.pause());
      await expect.poll(() => isPaused(win), { timeout: 15_000 }).toBe(true);

      await win.keyboard.press("Space");
      await expect.poll(() => isPaused(win), { timeout: 15_000 }).toBe(false);

      // Typing in the library's search box must not touch playback.
      await win.evaluate(() => (window as never as Bridge).cuepoint.player.pause());
      await expect.poll(() => isPaused(win), { timeout: 15_000 }).toBe(true);
      const search = win.locator(".cp-filter-bar").getByRole("textbox", { name: "Search" });
      await search.click();
      await search.fill("drum and bass");
      await expect(search).toHaveValue("drum and bass");
      // Still paused: every one of those spaces went into the box.
      expect(await isPaused(win)).toBe(true);

      // --- the machine's media keys, held while CuePoint is in front --------
      // The release on blur is unit-tested (`mediaKeys.test.ts`); focus cannot
      // be given away reliably from a test harness, but that the wiring from
      // main to the binding is real can only be seen here.
      //
      // macOS gates these behind the Accessibility permission, which a test
      // harness does not have and cannot grant itself, so `register` refuses
      // all three. Asserting they are held would assert that the harness has a
      // permission it will never be given — which is what this test did, and
      // why it failed on the first macOS run of the phase. What is actually
      // required is that the keys are held *when the OS allows it*, and that
      // CuePoint knows the difference rather than silently holding nothing.
      const keys = await app.evaluate(({ globalShortcut, systemPreferences }) => ({
        held: {
          playPause: globalShortcut.isRegistered("MediaPlayPause"),
          next: globalShortcut.isRegistered("MediaNextTrack"),
          previous: globalShortcut.isRegistered("MediaPreviousTrack"),
        },
        // `false` on the platforms that gate nothing, so the branch below reads
        // the same way everywhere.
        gated:
          process.platform === "darwin" &&
          !systemPreferences.isTrustedAccessibilityClient(false),
      }));

      const status = await win.evaluate(() =>
        window.cuepoint!.player!.mediaKeyStatus!(),
      );

      if (keys.gated) {
        // The permission is missing: nothing may be held, and the app must know
        // that this is a refusal rather than another application owning the
        // keys — the distinction it used to lose, leaving the feature silently
        // dead. Asserted through the status rather than the toast, which is
        // raised during startup and would be a race to catch.
        expect(keys.held).toEqual({ playPause: false, next: false, previous: false });
        expect(status).toBe("unavailable");
      } else {
        expect(keys.held).toEqual({ playPause: true, next: true, previous: true });
        expect(status).toBe("held");
      }

      // --- quit, relaunch: nothing resumes and nothing is remembered --------
      // DEC-014, and the only way to show it is to actually leave and return.
      await app.close();
      app = await launch(userDataDir, home);
      win = await ready(app);

      const after = await win.evaluate(async () => {
        const bridge = (window as never as Bridge).cuepoint;
        const state = await bridge.player.getState();
        const page = await bridge.player.queueWindow(0, 10);
        return {
          queueLength: state.queue.length,
          current: state.queue.currentItem,
          playing: state.playback.playing,
          position: state.playback.positionSeconds,
          items: page.items.length,
        };
      });
      expect(after).toMatchObject({
        queueLength: 0,
        current: null,
        playing: false,
        items: 0,
      });
      expect(after.position).toBeNull();
      // And the bar is gone with it: this session has played nothing.
      expect(await win.locator(".cp-player-bar").count()).toBe(0);
    } finally {
      await app.close();
    }
  });

  test("still runs, and says so, with no player at all", async () => {
    // Cross-cutting fact 4: mpv missing must degrade, not break. The library is
    // the app's main job and it does not need a player to do it.
    test.setTimeout(240_000);
    const app = await launch(userDataDir, home, {
      CUEPOINT_MPV_PATH: path.join(workspace, "no-such-mpv"),
    });
    try {
      const win = await ready(app);
      await importCollection(win, writeExport(workspace));
      const table = await openLibrary(win);

      // The library works: browsing, sorting and selecting are all unaffected.
      await expect(table).toBeVisible();
      await win.locator(".track-table__row").first().click();
      await expect(win.locator(".cp-selection-actions__count")).toContainText("1 track selected");

      // Playing is refused with something a person can act on, rather than
      // hanging or throwing into the void.
      const result = await win.evaluate(async (file) => {
        const bridge = (window as never as Bridge).cuepoint;
        return bridge.player.playQueue([{ filePath: file, title: "nope" }], 0);
      }, path.join(AUDIO, "tone.flac"));
      expect(result.ok).toBe(false);
      expect(String(result.error)).not.toBe("");

      // The bar never appears, because nothing ever played (DEC-053).
      expect(await win.locator(".cp-player-bar").count()).toBe(0);
      // And the app is still there afterwards: no crash, no white screen.
      await expect(win.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
