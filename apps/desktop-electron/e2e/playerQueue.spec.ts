import { test, expect, type Page } from "@playwright/test";
import { _electron as electron } from "playwright";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * A view becomes a playing queue, through the whole stack (PLAYER-05, DEC-012).
 *
 * This is the one test that crosses every layer the step touches: the Python
 * `fields=queue` projection, `engineClient`, the supervisor's forwarding
 * method, the `player:playView` IPC arm, the runtime preload, and the renderer
 * bridge. Each of those has its own unit tests; none of them can prove the
 * chain is actually joined up, and a missing link there fails only at runtime
 * in the packaged app.
 *
 * It imports a Rekordbox export whose tracks point at the repository's real
 * audio fixtures, so the queue it builds is genuinely playable rather than a
 * list of paths that happen to parse.
 *
 * The assertion that matters is that the queue is **the view, in the view's
 * order**: the same query the table is showing, resolved server-side. A queue
 * that disagreed would play tracks the user cannot see, in an order they did
 * not choose, and nothing on screen would explain why.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const AUDIO = path.resolve(DESKTOP_ROOT, "../../src/tests/fixtures/audio");

// Real audio files, so the queue this builds is actually playable.
const FILES = ["tone.flac", "tone.wav", "tone.aiff", "tone.m4a"];

function toLocation(file: string): string {
  const full = path.join(AUDIO, file).split(path.sep).join("/");
  return "file://localhost/" + full.replace(/^\/+/, "");
}

function writeExport(dir: string): string {
  const entries = FILES.map((file, index) => {
    const genre = index % 2 === 0 ? "Techno" : "House";
    return (
      `<TRACK TrackID="${index + 1}" Name="Track ${index + 1}" ` +
      `Artist="Artist ${String(9 - index)}" Genre="${genre}" ` +
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

test("playing a view queues exactly what the table shows, in its order", async () => {
  const userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-pv-"));
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
    const win: Page = await app.firstWindow({ timeout: 60_000 });
    await expect(win).toHaveTitle(/CuePoint/i, { timeout: 30_000 });

    const started = await win.evaluate(
      (file) => (window as never as Record<string, any>).cuepoint.startLibraryImport({ xml_path: file }),
      writeExport(workspace),
    );
    await expect
      .poll(
        async () =>
          (
            await win.evaluate(
              (id) => (window as never as Record<string, any>).cuepoint.getJob(id),
              started.job_id,
            )
          ).state,
        { timeout: 90_000 },
      )
      .toBe("succeeded");

    const result = await win.evaluate(async () => {
      const w = window as never as Record<string, any>;
      // Play the view sorted by artist descending, starting at its second row.
      const res = await w.cuepoint.player.playView({ sort: "artist", dir: "desc" }, 1);
      // Read immediately: the fixtures are a quarter of a second long, so a
      // wait here would see a queue that has already finished.
      const state = await w.cuepoint.player.getState();
      // The queue's contents are no longer pushed with the snapshot (PLAYER-08),
      // so they are read a window at a time — the same way the panel reads them.
      const page = await w.cuepoint.player.queueWindow(0, 100);
      // What the table itself shows for the same query.
      const browse = await w.cuepoint.browseLibrary({ sort: "artist", dir: "desc", limit: 100 });
      return {
        res,
        queueTitles: page.items.map((item: { title: string }) => item.title),
        tableTitles: browse.tracks.map((track: { title: string }) => track.title),
        current: state.queue.currentItem?.title ?? null,
        running: state.status.running,
      };
    });

    expect(result.res.ok).toBe(true);
    expect(result.res.queued).toBe(FILES.length);
    expect(result.res.truncated).toBe(false);
    // The queue is the view, in the view's order.
    expect(result.queueTitles).toEqual(result.tableTitles);
    // startIndex picked the second row of that order.
    expect(result.current).toBe(result.tableTitles[1]);
    expect(result.running).toBe(true);
  } finally {
    await app.close();
  }
});
