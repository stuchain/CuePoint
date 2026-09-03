/**
 * Starting and following a Rekordbox import from the renderer (LIBRARY-06).
 *
 * This is the one check that exercises the whole six-file desktop contract in
 * the packaged app — preload, IPC channel, main-process handler, supervisor
 * forward, engine client, HTTP endpoint — and the only kind that would have
 * caught the failure that motivated `desktopContract.test.ts`: a supervisor
 * method nobody declared, which type-checks everywhere and fails at runtime as
 * "engine.X is not a function".
 *
 * The contract test reads the five files and compares them; this one calls
 * through them. Both are worth having: the contract test is fast and precise
 * about *which* file is wrong, this one proves the chain actually carries a
 * request end to end.
 *
 * Each launch gets its own `--user-data-dir` and its own `CUEPOINT_HOME`, so a
 * run never reads or writes the real CuePoint library.
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

const TRACK_ATTRS =
  'Genre="House" Tonality="8A" AverageBpm="124.00" Year="2024" ' +
  'TotalTime="360" BitRate="320" Rating="204" PlayCount="3"';

/** Write a Rekordbox-shaped export with `count` tracks. */
function writeExport(dir: string, count: number, name = "collection.xml"): string {
  const entries = Array.from(
    { length: count },
    (_unused, i) =>
      `<TRACK TrackID="${i}" Name="Track ${i}" Artist="Artist ${i}" ${TRACK_ATTRS} ` +
      `Location="file://localhost/m/${i}.mp3"/>`,
  ).join("\n");
  const file = path.join(dir, name);
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${count}">
${entries}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0">
    <NODE Name="set" Type="1" Entries="1"><TRACK Key="0"/></NODE>
  </NODE></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return file;
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    // Keeps the engine's config, library database and backups inside the
    // temporary directory this test owns.
    CUEPOINT_HOME: cuepointHome,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;

  return electron.launch({
    cwd: DESKTOP_ROOT,
    args: [".", `--user-data-dir=${userDataDir}`],
    env,
  });
}

async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await window.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  // The engine is a spawned sidecar; nothing below works until it answers.
  await expect(window.locator(".cp-status")).toContainText(/Engine connected/i, {
    timeout: 60_000,
  });
  return window;
}

test.describe("Library import from the renderer (LIBRARY-06)", () => {
  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-xml-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the summary reports an empty library honestly before any import", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);

      const summary = await window.evaluate(() => window.cuepoint!.getLibrarySummary!());

      expect(summary.track_count).toBe(0);
      expect(summary.playlist_count).toBe(0);
      expect(summary.library_empty).toBe(true);
      // Null, not a record with zeroes: "nothing imported yet" and "imported an
      // empty collection" are different situations.
      expect(summary.source).toBeNull();
    } finally {
      await app.close();
    }
  });

  test("an import can be started and followed to completion", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      const xmlPath = writeExport(workspace, 40);

      const started = await window.evaluate(
        (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
        xmlPath,
      );
      expect(started.job_id).toBeTruthy();

      // Followed through the existing job endpoint, which is the whole point of
      // not adding a second progress mechanism.
      await expect
        .poll(
          async () =>
            (await window.evaluate(
              (id) => window.cuepoint!.getJob!(id),
              started.job_id,
            ))!.state,
          { timeout: 60_000 },
        )
        .toBe("succeeded");

      const summary = await window.evaluate(() => window.cuepoint!.getLibrarySummary!());
      expect(summary.track_count).toBe(40);
      expect(summary.playlist_count).toBe(2);
      expect(summary.library_empty).toBe(false);
      expect(summary.source).not.toBeNull();
      expect(summary.source!.exists).toBe(true);
      expect(summary.source!.changed).toBe(false);
    } finally {
      await app.close();
    }
  });

  test("a running import appears in the status strip as an import", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      // Large enough that the strip's two-second discovery poll finds it while
      // it is still running.
      const xmlPath = writeExport(workspace, 60_000, "big.xml");

      await window.evaluate(
        (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
        xmlPath,
      );

      // "Importing", not "Matching" — the verb the strip used for every job
      // until DEC-033 gave it a second one.
      await expect(window.locator(".cp-status__job-label")).toContainText(/^Importing/, {
        timeout: 30_000,
      });
      await expect(window.locator("progress.cp-status__progress")).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("a file that is not there is refused with a message", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);

      const outcome = await window.evaluate(async (file) => {
        try {
          await window.cuepoint!.startLibraryImport!({ xml_path: file });
          return { ok: true, message: "" };
        } catch (error) {
          return { ok: false, message: String(error) };
        }
      }, path.join(workspace, "not-here.xml"));

      expect(outcome.ok).toBe(false);
      expect(outcome.message).toContain("No such file");

      // And it left nothing behind.
      const summary = await window.evaluate(() => window.cuepoint!.getLibrarySummary!());
      expect(summary.library_empty).toBe(true);
    } finally {
      await app.close();
    }
  });
});
