/**
 * Crash injection, end to end (HARDEN-05, with HARDEN-03's unclean exit).
 *
 * Each test kills something with the operating system's own kill while it works, then checks the
 * app came back and that the library passes `PRAGMA integrity_check`:
 *
 *   - the engine during a large import        -> restarted, the import marked interrupted, the library as before
 *   - the engine during an export             -> nothing at the destination, no temp file after the restart
 *   - the engine during a tag write           -> the offer to undo appears, every audio file's frames unchanged
 *   - the engine stalled (the test-only route) -> restarted by the heartbeat within two minutes
 *   - mpv during playback                     -> the player restarts, the queue is kept
 *   - the renderer                            -> the window reloads and says so; twice in a minute -> recovery.html
 *   - the whole app during a refresh          -> the next launch says it did not close properly
 *
 * Kill timing is flaky by nature, so every test waits for a named point in the work (a job's
 * progress count, a marker file) and never for a fixed time. Where that point has passed already,
 * the test fails and says so, rather than going on to check something that did not happen.
 */
import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  FIXTURE_AUDIO,
  alive,
  descendants,
  enginesUnder,
  environOf,
  finished,
  idle,
  importLibrary,
  integrityCheck,
  killAll,
  launchApp,
  libraryFile,
  mainPid,
  plainTracks,
  ready,
  waitForRestart,
  writeExportFile,
  type GeneratedTrack,
} from "./hardenHarness";
import { NO_PLAYER, hasPlayer } from "./playerAvailable";

/** Tracks in the import that is killed: several seconds of work on the machines this runs on. */
const BIG_IMPORT = Number(process.env.CUEPOINT_CRASH_TRACKS ?? "40000");
/** What the library holds before that import. */
const BASE_TRACKS = 20;

type Job = { state: string; progress?: { completed_tracks?: number; total_tracks?: number }; error?: { code?: string } };

async function readJob(window: Page, jobId: string): Promise<Job> {
  return window.evaluate((id) => window.cuepoint!.getJob!(id), jobId);
}

/** A job as the library recorded it: after a restart the engine's memory of it is gone, its record is not. */
async function recorded(window: Page, jobId: string): Promise<Job & { id: string }> {
  const list = await window.evaluate(() => window.cuepoint!.listJobs!({ state: "all", limit: 100 }));
  const job = list.jobs.find((candidate: { id: string }) => candidate.id === jobId);
  expect(job, `no record of job ${jobId}`).toBeTruthy();
  return job;
}

/**
 * Wait until a job is running and has done at least `completed` of its work. A job that ended
 * before that fails the test: the point to kill at never came, so nothing would be proved.
 */
async function waitForProgress(window: Page, jobId: string, completed: number, timeout = 120_000): Promise<Job> {
  let last: Job | null = null;
  await expect
    .poll(
      async () => {
        last = await readJob(window, jobId);
        if (/succeeded|failed|cancelled/.test(last.state)) {
          throw new Error(`the job ended (${last.state}) before ${completed} were done: make the work larger`);
        }
        return last.state === "running" && (last.progress?.completed_tracks ?? 0) >= completed;
      },
      { timeout, message: `the job never reached ${completed} done` },
    )
    .toBe(true);
  return last!;
}

/** The state of a job that is running, whatever it has counted so far. */
async function waitForRunning(window: Page, jobId: string, timeout = 120_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const job = await readJob(window, jobId);
        if (/succeeded|failed|cancelled/.test(job.state)) {
          throw new Error(`the job ended (${job.state}) before it could be killed: make the work larger`);
        }
        return job.state;
      },
      { timeout },
    )
    .toBe("running");
}

/** A process id nothing is using, for a temp file that a dead writer might have left. */
function deadPid(): number {
  for (let pid = 4_000_000; pid > 3_000_000; pid -= 1) if (!alive(pid)) return pid;
  throw new Error("no unused process id");
}

/**
 * A hash of an MP3's audio frames alone: what is left when the ID3v2 tag at the front and the ID3v1
 * tag at the back are taken off, so a rewritten tag is no change but a touched frame is.
 */
function audioFrames(file: string): string {
  const bytes = readFileSync(file);
  let start = 0;
  if (bytes.length > 10 && bytes.toString("latin1", 0, 3) === "ID3") {
    const size = ((bytes[6]! & 0x7f) << 21) | ((bytes[7]! & 0x7f) << 14) | ((bytes[8]! & 0x7f) << 7) | (bytes[9]! & 0x7f);
    start = 10 + size + ((bytes[5]! & 0x10) !== 0 ? 10 : 0);
  }
  let end = bytes.length;
  if (end - start >= 128 && bytes.toString("latin1", end - 128, end - 125) === "TAG") end -= 128;
  return createHash("sha256").update(bytes.subarray(start, end)).digest("hex");
}

/** mpv processes below the app. */
function mpvUnder(main: number): number[] {
  return descendants(main, /(^|[\\/])mpv(\.exe)?(\s|$)/i);
}

async function queueTitles(window: Page): Promise<string[]> {
  const page = await window.evaluate(() => window.cuepoint!.player!.queueWindow!(0, 100));
  return page.items.map((item: { title: string }) => item.title);
}

/** A mono 8 kHz, 16-bit WAV of silence, `seconds` long: real audio mpv plays at its own pace. */
function silentWav(seconds: number): Buffer {
  const rate = 8000;
  const bytes = rate * seconds * 2;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "latin1");
  header.writeUInt32LE(36 + bytes, 4);
  header.write("WAVEfmt ", 8, "latin1");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "latin1");
  header.writeUInt32LE(bytes, 40);
  return Buffer.concat([header, Buffer.alloc(bytes)]);
}

/** The renderer process of the main window dies, as a crash does. */
async function crashRenderer(application: ElectronApplication): Promise<void> {
  await application.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (!win) throw new Error("no window to crash");
    win.webContents.forcefullyCrashRenderer();
  });
}

interface WindowView {
  url: string;
  crashed: boolean;
  text: string;
}

/**
 * Every window's address and the words in it, asked in the main process. The text content, hidden
 * parts too: the strip says one thing at a time and a running job takes the place of a note.
 */
async function windowViews(application: ElectronApplication): Promise<WindowView[]> {
  return application.evaluate(async ({ BrowserWindow }) => {
    const views: Array<{ url: string; crashed: boolean; text: string }> = [];
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (win.isDestroyed()) continue;
        const contents = win.webContents;
        let text = "";
        if (!contents.isCrashed() && !contents.isLoading()) {
          try {
            text = await Promise.race([
              contents.executeJavaScript("document.body ? document.body.textContent : ''") as Promise<string>,
              new Promise<string>((resolve) => setTimeout(() => resolve(""), 3000)),
            ]);
          } catch {
            text = "";
          }
        }
        views.push({ url: contents.getURL(), crashed: contents.isCrashed(), text });
      } catch {
        /* the window was destroyed under us: it is the one being replaced */
      }
    }
    return views;
  });
}

/** Whether a window that `which` accepts, and is not crashed, shows these words. */
async function windowSays(application: ElectronApplication, which: (view: WindowView) => boolean, words: string): Promise<boolean> {
  return (await windowViews(application)).some((view) => !view.crashed && which(view) && view.text.includes(words));
}

/** Run an expression in the window that shows `onlyUrlPart` (the app's, by default) and answer its value. */
async function inWindow(application: ElectronApplication, expression: string, onlyUrlPart?: string): Promise<unknown> {
  return application.evaluate(
    async ({ BrowserWindow }, { code, part }) => {
      const win = BrowserWindow.getAllWindows().find(
        (candidate) =>
          !candidate.isDestroyed() &&
          !candidate.webContents.isCrashed() &&
          (part ? candidate.webContents.getURL().includes(part) : !candidate.webContents.getURL().includes("recovery.html")),
      );
      if (!win) throw new Error("no such window");
      return win.webContents.executeJavaScript(code);
    },
    { code: expression, part: onlyUrlPart ?? "" },
  );
}

test.describe("Crash injection (HARDEN-05)", () => {
  test.describe.configure({ timeout: 300_000 });

  let userDataDir: string;
  let home: string;
  let workspace: string;
  let app: ElectronApplication | null;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    home = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-crash-"));
    app = null;
  });

  test.afterEach(async () => {
    // Never leave an app, or what it started, behind from a failed run.
    if (app) {
      const pid = await mainPid(app).catch(() => 0);
      const children = pid ? descendants(pid, /./) : [];
      await app.close().catch(() => undefined);
      killAll(children);
    }
    for (const dir of [userDataDir, home, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  test("the engine killed during a large import is restarted, the import is marked interrupted, and the library is as before", async () => {
    app = await launchApp({ userDataDir, home });
    const window = await ready(app);
    await importLibrary(window, await writeExportFile(path.join(workspace, "base.xml"), plainTracks(BASE_TRACKS), BASE_TRACKS));
    const before = await window.evaluate(() => window.cuepoint!.getLibrarySummary!());
    expect(before.track_count).toBe(BASE_TRACKS);

    const big = await writeExportFile(path.join(workspace, "big.xml"), plainTracks(BIG_IMPORT), BIG_IMPORT);
    const started = await window.evaluate((file) => window.cuepoint!.startLibraryImport!({ xml_path: file }), big);
    await waitForProgress(window, started.job_id, 1000);

    const main = await mainPid(app);
    const engines = enginesUnder(main);
    expect(engines.length).toBeGreaterThan(0);
    killAll(engines);
    await waitForRestart(window, main, engines);

    // The restarted engine closes out what the last one left running as it opens the library.
    await expect.poll(async () => (await recorded(window, started.job_id)).state, { timeout: 60_000 }).toBe("failed");
    expect((await recorded(window, started.job_id)).error?.code).toBe("JOB_INTERRUPTED");
    await idle(window);
    const after = await window.evaluate(() => window.cuepoint!.getLibrarySummary!());
    expect(after.track_count).toBe(before.track_count);
    expect(integrityCheck(libraryFile(home))).toBe("ok");
  });

  test("the engine killed during an export leaves no partial XML, and the sweep removes the temp file", async () => {
    app = await launchApp({ userDataDir, home });
    const window = await ready(app);
    const tracks = Number(process.env.CUEPOINT_CRASH_EXPORT_TRACKS ?? "30000");
    await importLibrary(window, await writeExportFile(path.join(workspace, "source.xml"), plainTracks(tracks), tracks));

    // Under the app's own folder, which the engine sweeps at every start.
    const folder = path.join(home, "Exports");
    mkdirSync(folder);
    const destination = path.join(folder, "CuePoint Export.xml");
    // What a writer killed in the middle of its write leaves beside the destination: a dead process's temp file.
    const dead = deadPid();
    const leftover = path.join(folder, `.CuePoint Export.xml.cuepoint-tmp-${dead}`);
    writeFileSync(leftover, "<DJ_PLAYLISTS><COLLECTION>");

    const started = await window.evaluate(
      (target) => window.cuepoint!.startRekordboxExport!({ collection_ids: null, destination_path: target }),
      destination,
    );
    expect(started.refusal).toBeNull();
    const jobId = started.started!.job_id;
    await waitForRunning(window, jobId);

    const main = await mainPid(app);
    const engines = enginesUnder(main);
    expect(engines.length).toBeGreaterThan(0);
    killAll(engines);
    await waitForRestart(window, main, engines);

    await expect.poll(async () => (await recorded(window, jobId)).state, { timeout: 60_000 }).toBe("failed");
    expect((await recorded(window, jobId)).error?.code).toBe("JOB_INTERRUPTED");
    expect(existsSync(destination)).toBe(false);
    // The sweep ran as the engine started: no temp file of a dead process is left.
    await expect
      .poll(() => readdirSync(folder).filter((name) => name.includes(".cuepoint-tmp-")), { timeout: 60_000 })
      .toEqual([]);
    expect(readdirSync(folder)).toEqual([]);
    await idle(window);
    expect(integrityCheck(libraryFile(home))).toBe("ok");
  });

  test("the engine killed during a tag write offers to undo it, and no audio file's frames changed", async () => {
    app = await launchApp({ userDataDir, home });
    const window = await ready(app);

    // Small generated audio files: copies of a real, tiny MP3, each a track of its own.
    const files = Number(process.env.CUEPOINT_CRASH_FILES ?? "200");
    const music = path.join(workspace, "music");
    mkdirSync(music);
    const audio: GeneratedTrack[] = [];
    for (let id = 1; id <= files; id += 1) {
      const file = path.join(music, `t${String(id).padStart(4, "0")}.mp3`);
      copyFileSync(path.join(FIXTURE_AUDIO, "tone.mp3"), file);
      audio.push({ id, title: `Tone ${id}`, artist: `Artist ${id}`, file, year: 2001 + (id % 20) });
    }
    await importLibrary(window, await writeExportFile(path.join(workspace, "tones.xml"), audio, files));
    const framesBefore = audio.map((track) => audioFrames(track.file!));

    const preview = await window.evaluate(() => window.cuepoint!.previewTagWrite!({ selection: { query: {} } }));
    // A preview over many files is a job; its id is the preview's.
    const previewId = (preview.preview_id ?? preview.preview?.preview_id) as string;
    if (preview.job_id) expect((await finished(window, preview.job_id)).state).toBe("succeeded");
    await idle(window);

    const started = await window.evaluate((id) => window.cuepoint!.startTagWrite!({ preview_id: id }), previewId);
    await waitForProgress(window, started.job_id, 5);

    const main = await mainPid(app);
    const engines = enginesUnder(main);
    expect(engines.length).toBeGreaterThan(0);
    killAll(engines);
    await waitForRestart(window, main, engines);

    // The offer: Activity says the save stopped and offers to undo it.
    await expect.poll(async () => (await recorded(window, started.job_id)).state, { timeout: 60_000 }).toBe("failed");
    await expect
      .poll(
        async () =>
          (await window.evaluate(() => window.cuepoint!.getRecentActivity!({ limit: 50 }))).events.filter(
            (event: { type: string }) => event.type === "clean.tags.interrupted",
          ).length,
        { timeout: 60_000 },
      )
      .toBe(1);
    await window.getByRole("button", { name: "Activity", exact: true }).click();
    const activity = window.getByRole("dialog").filter({ hasText: "Sync stopped" });
    await expect(activity).toBeVisible({ timeout: 30_000 });
    await expect(activity.getByText(/Saving to files stopped when CuePoint closed/)).toBeVisible();
    await expect(activity.getByRole("button", { name: "Undo", exact: true })).toBeVisible();
    await window.keyboard.press("Escape");

    // Every file is whole, and its audio is the audio it had.
    audio.forEach((track, index) => {
      expect(audioFrames(track.file!), track.file).toBe(framesBefore[index]);
    });
    await idle(window);
    expect(integrityCheck(libraryFile(home))).toBe("ok");
  });

  test("an engine that stops answering is restarted by the heartbeat", async () => {
    // The stall route's address is read from the engine's own environment, which only Linux serves as a file.
    test.skip(process.platform !== "linux", "the engine's port and token are read from /proc");
    test.setTimeout(240_000);
    app = await launchApp({ userDataDir, home });
    const window = await ready(app);
    await importLibrary(window, await writeExportFile(path.join(workspace, "lib.xml"), plainTracks(10), 10));

    const main = await mainPid(app);
    const engines = enginesUnder(main);
    expect(engines.length).toBeGreaterThan(0);
    // The engine is the one that listens: the bootloader of a packaged build has no port of its own.
    const listening = engines.find((pid) => environOf(pid)?.CUEPOINT_PORT);
    expect(listening, "no engine process with a port").toBeTruthy();
    const env = environOf(listening!)!;
    expect(env.CUEPOINT_TEST_HOOKS).toBe("1");

    const asked = await fetch(`http://${env.CUEPOINT_HOST ?? "127.0.0.1"}:${env.CUEPOINT_PORT}/api/v1/test/stall`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.CUEPOINT_TOKEN}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(asked.status).toBe(202);

    // 3 missed beats of 15 seconds; two minutes is the most it may take.
    const stalledAt = Date.now();
    await waitForRestart(window, main, engines, 120_000);
    const seconds = (Date.now() - stalledAt) / 1000;
    expect(seconds).toBeLessThan(120);
    for (const pid of engines) await expect.poll(() => alive(pid), { timeout: 30_000 }).toBe(false);

    // The library is there, and the new engine serves it.
    expect((await window.evaluate(() => window.cuepoint!.getLibrarySummary!())).track_count).toBe(10);
    expect(integrityCheck(libraryFile(home))).toBe("ok");
  });

  test("mpv killed during playback is restarted, and the queue is kept", async () => {
    test.skip(!hasPlayer, NO_PLAYER);
    app = await launchApp({ userDataDir, home });
    const window = await ready(app);

    // Three two-minute tracks, so playback is still going whenever the kill comes.
    const music = path.join(workspace, "music");
    mkdirSync(music);
    const queued: GeneratedTrack[] = [1, 2, 3].map((id) => {
      const file = path.join(music, `long${id}.wav`);
      writeFileSync(file, silentWav(120));
      return { id, title: `Long ${id}`, artist: `Artist ${id}`, file };
    });
    await importLibrary(window, await writeExportFile(path.join(workspace, "long.xml"), queued, queued.length));

    const played = await window.evaluate(() => window.cuepoint!.player!.playView!({ sort: "title", dir: "asc" }, 0));
    expect(played.ok).toBe(true);
    expect(played.queued).toBe(3);
    const titlesBefore = await queueTitles(window);
    expect(titlesBefore).toEqual(["Long 1", "Long 2", "Long 3"]);

    // The named point: mpv has played some of the first track.
    await expect
      .poll(
        async () => {
          const state = await window.evaluate(() => window.cuepoint!.player!.getState!());
          return state.playback.playing && (state.playback.positionSeconds ?? 0) > 0.5;
        },
        { timeout: 60_000, message: "playback never started" },
      )
      .toBe(true);

    const main = await mainPid(app);
    const players = mpvUnder(main);
    expect(players.length).toBeGreaterThan(0);
    killAll(players);

    // A new mpv, answering, and the queue as it was.
    await expect
      .poll(
        async () => {
          const fresh = mpvUnder(main).filter((pid) => !players.includes(pid));
          if (fresh.length === 0) return false;
          const state = await window.evaluate(() => window.cuepoint!.player!.getState!());
          return state.status.running === true;
        },
        { timeout: 60_000, message: "the player was not restarted" },
      )
      .toBe(true);
    expect(await queueTitles(window)).toEqual(titlesBefore);
    const state = await window.evaluate(() => window.cuepoint!.player!.getState!());
    expect(state.queue.length).toBe(3);
    // And it plays again from the queue.
    const again = await window.evaluate(() => window.cuepoint!.player!.playView!({ sort: "title", dir: "asc" }, 1));
    expect(again.ok).toBe(true);
    await expect
      .poll(async () => (await window.evaluate(() => window.cuepoint!.player!.getState!())).playback.playing, {
        timeout: 30_000,
      })
      .toBe(true);
    expect(integrityCheck(libraryFile(home))).toBe("ok");
  });

  test("a renderer that crashes is reloaded and says so; a second crash within a minute shows the recovery page", async () => {
    app = await launchApp({ userDataDir, home });
    const first = await ready(app);
    await importLibrary(first, await writeExportFile(path.join(workspace, "lib.xml"), plainTracks(10), 10));
    const crashedAt = Date.now();

    // Playwright keeps the crashed page's handle as crashed for good, so what follows asks the
    // windows themselves, from the main process.
    await crashRenderer(app);
    await expect
      .poll(() => windowSays(app!, (w) => !w.url.includes("recovery.html"), "window stopped and was reopened"), {
        timeout: 60_000,
        message: "the window did not reload with its note",
      })
      .toBe(true);
    await expect
      .poll(async () => (await inWindow(app!, "window.cuepoint.getLibrarySummary().then((s) => s.track_count)").catch(() => -1)) as number, {
        timeout: 90_000,
      })
      .toBe(10);

    // Again, inside the minute: not a third try, the plain page with its two buttons.
    expect(Date.now() - crashedAt).toBeLessThan(60_000);
    await crashRenderer(app);
    await expect
      .poll(() => windowSays(app!, (w) => w.url.includes("recovery.html"), "CuePoint's window stopped twice"), {
        timeout: 60_000,
        message: "the recovery page did not show",
      })
      .toBe(true);
    const buttons = await inWindow(app, "[...document.querySelectorAll('button')].map((b) => b.textContent)", "recovery.html");
    expect(buttons).toEqual(["Reload", "Report this problem"]);

    // Reload on that page brings the app back, over the same library.
    await inWindow(app, "document.getElementById('reload').click()", "recovery.html");
    await expect
      .poll(async () => (await inWindow(app!, "window.cuepoint.getLibrarySummary().then((s) => s.track_count)").catch(() => -1)) as number, {
        timeout: 90_000,
      })
      .toBe(10);
    expect(integrityCheck(libraryFile(home))).toBe("ok");
  });

  test("the whole app killed during a refresh is told of at the next launch", async () => {
    const tracks = Number(process.env.CUEPOINT_CRASH_REFRESH_TRACKS ?? "25000");
    const first = await launchApp({ userDataDir, home });
    app = first;
    const window = await ready(first);
    const source = await writeExportFile(path.join(workspace, "collection.xml"), plainTracks(tracks), tracks);
    await importLibrary(window, source);

    // The same export with a new label on every track and some new ones: a refresh with a lot to apply.
    const changed = (function* (): Iterable<GeneratedTrack> {
      for (let id = 1; id <= tracks + 2000; id += 1) {
        yield { id, title: `Track ${String(id).padStart(6, "0")}`, artist: `Artist ${String(id).padStart(6, "0")}`, label: "Relabelled" };
      }
    })();
    const edited = await writeExportFile(path.join(workspace, "edited.xml"), changed, tracks + 2000);
    const preview = await window.evaluate((file) => window.cuepoint!.startLibraryRefreshPreview!({ xml_path: file }), edited);
    expect((await finished(window, preview.job_id)).state).toBe("succeeded");
    const diff = (await window.evaluate((id) => window.cuepoint!.getJobResults!(id), preview.job_id)).result as { diff_id: string };
    const apply = await window.evaluate((id) => window.cuepoint!.startLibraryRefreshApply!({ diff_id: id }), diff.diff_id);
    await waitForRunning(window, apply.job_id);

    // The app goes without a word: no quit, no cleanup.
    const main = await mainPid(first);
    const engines = enginesUnder(main);
    process.kill(main, "SIGKILL");
    app = null;
    await first.close().catch(() => undefined);
    // The engine notices its parent has gone and ends itself; never leave one behind either way.
    try {
      await expect.poll(() => engines.filter(alive), { timeout: 30_000 }).toEqual([]);
    } finally {
      killAll(engines.filter(alive));
    }

    // The next launch: told that the last one did not close properly, once the library has been checked.
    app = await launchApp({ userDataDir, home });
    const again = await ready(app);
    // The strip says one thing at a time and a running job (the launch's file check over this many
    // tracks) takes its place, so the note is looked for in the strip's text and not for being on top.
    await expect(again.locator(".cp-status__engine")).toContainText(
      "CuePoint didn't close properly last time. Your library was checked and is fine.",
      { timeout: 120_000 },
    );
    // It was not a damaged library: the screen for that is not up, and the library is whole.
    await expect(again.getByRole("heading", { name: "CuePoint couldn't read your library" })).toHaveCount(0);
    await idle(again);
    expect(integrityCheck(libraryFile(home))).toBe("ok");
    const summary = await again.evaluate(() => window.cuepoint!.getLibrarySummary!());
    // Either the refresh finished before the kill or it did not happen: never half of one.
    expect([tracks, tracks + 2000]).toContain(summary.track_count);
  });
});

