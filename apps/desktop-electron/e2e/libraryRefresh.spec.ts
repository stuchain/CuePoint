/**
 * Previewing and applying a refresh from the renderer (LIBRARY-10).
 *
 * The acceptance criterion this covers is "both flows are reachable from the
 * renderer" — so it calls them the way the renderer will, through
 * `window.cuepoint`, in the packaged app. `desktopContract.test.ts` compares
 * the six files against each other and says precisely which one is wrong; this
 * proves the chain actually carries a request, which is the failure that
 * motivated the contract rule in the first place.
 *
 * The two properties worth proving end to end are the ones a user's data
 * depends on: a preview writes nothing, and a stale diff is refused rather than
 * applied.
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
import { mkdtempSync, rmSync, utimesSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

const TRACK_ATTRS =
  'Genre="House" Tonality="8A" AverageBpm="124.00" Year="2024" ' +
  'TotalTime="360" BitRate="320" Rating="204" PlayCount="3"';

/** Write an export holding exactly the given TrackIDs. */
function writeExport(dir: string, ids: number[], name = "collection.xml"): string {
  const entries = ids
    .map(
      (i) =>
        `<TRACK TrackID="${i}" Name="Track ${i}" Artist="Artist ${i}" ${TRACK_ATTRS} ` +
        `Location="file://localhost/m/${i}.mp3"/>`,
    )
    .join("\n");
  const file = path.join(dir, name);
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${ids.length}">
${entries}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0">
    <NODE Name="set" Type="1" Entries="1"><TRACK Key="${ids[0] ?? 0}"/></NODE>
  </NODE></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return file;
}

/**
 * Rewrite an export and force its modified time forward.
 *
 * A rewrite inside the filesystem's timestamp granularity can land on the same
 * mtime, which would make a genuinely changed file look unchanged and quietly
 * turn the staleness test into a no-op.
 */
function rewriteExport(file: string, ids: number[]): void {
  writeExport(path.dirname(file), ids, path.basename(file));
  const stat = statSync(file);
  utimesSync(file, stat.atime.getTime() / 1000 + 5, stat.mtime.getTime() / 1000 + 5);
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
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
  await expect(window.locator(".cp-status")).toContainText(/Engine connected/i, {
    timeout: 60_000,
  });
  return window;
}

/** Wait for a job to reach a terminal state, and return its final status. */
async function settle(window: Page, jobId: string) {
  await expect
    .poll(
      async () =>
        (await window.evaluate((id) => window.cuepoint!.getJob!(id), jobId))!.state,
      { timeout: 90_000 },
    )
    .toMatch(/succeeded|failed|cancelled/);
  return window.evaluate((id) => window.cuepoint!.getJob!(id), jobId);
}

async function importLibrary(window: Page, xmlPath: string) {
  const started = await window.evaluate(
    (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
    xmlPath,
  );
  expect((await settle(window, started.job_id))!.state).toBe("succeeded");
}

test.describe("Library refresh from the renderer (LIBRARY-10)", () => {
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

  test("a preview reaches the renderer and changes nothing", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importLibrary(window, writeExport(workspace, [0, 1, 2, 3, 4, 5]));
      const edited = writeExport(workspace, [0, 1, 2, 9], "edited.xml");

      const started = await window.evaluate(
        (file) => window.cuepoint!.startLibraryRefreshPreview!({ xml_path: file }),
        edited,
      );
      expect((await settle(window, started.job_id))!.state).toBe("succeeded");

      // The diff arrives as the job's result, not on the polled status payload.
      const results = await window.evaluate(
        (id) => window.cuepoint!.getJobResults!(id),
        started.job_id,
      );
      const diff = results.result as {
        diff_id: string;
        tracks: {
          added: { count: number };
          removed: { count: number };
        };
      };
      expect(diff.diff_id).toBeTruthy();
      expect(diff.tracks.added.count).toBe(1);
      expect(diff.tracks.removed.count).toBe(3);

      // DEC-032's premise: nothing happened yet.
      const summary = await window.evaluate(() => window.cuepoint!.getLibrarySummary!());
      expect(summary.track_count).toBe(6);
    } finally {
      await app.close();
    }
  });

  test("an apply reaches the renderer and does what the preview promised", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importLibrary(window, writeExport(workspace, [0, 1, 2, 3, 4, 5]));
      const edited = writeExport(workspace, [0, 1, 2, 9], "edited.xml");

      const preview = await window.evaluate(
        (file) => window.cuepoint!.startLibraryRefreshPreview!({ xml_path: file }),
        edited,
      );
      await settle(window, preview.job_id);
      const previewed = await window.evaluate(
        (id) => window.cuepoint!.getJobResults!(id),
        preview.job_id,
      );
      const diffId = (previewed.result as { diff_id: string }).diff_id;

      const applied = await window.evaluate(
        (id) => window.cuepoint!.startLibraryRefreshApply!({ diff_id: id }),
        diffId,
      );
      expect((await settle(window, applied.job_id))!.state).toBe("succeeded");

      const outcome = await window.evaluate(
        (id) => window.cuepoint!.getJobResults!(id),
        applied.job_id,
      );
      const result = outcome.result as {
        tracks_inserted: number;
        tracks_deleted: number;
        track_count: number;
      };
      expect(result.tracks_inserted).toBe(1);
      expect(result.tracks_deleted).toBe(3);
      expect(result.track_count).toBe(4);

      const summary = await window.evaluate(() => window.cuepoint!.getLibrarySummary!());
      expect(summary.track_count).toBe(4);
      expect(summary.source!.xml_path).toBe(edited);
    } finally {
      await app.close();
    }
  });

  test("a diff whose file changed is refused rather than applied", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importLibrary(window, writeExport(workspace, [0, 1, 2, 3, 4, 5]));
      const edited = writeExport(workspace, [0, 1], "edited.xml");

      const preview = await window.evaluate(
        (file) => window.cuepoint!.startLibraryRefreshPreview!({ xml_path: file }),
        edited,
      );
      await settle(window, preview.job_id);
      const previewed = await window.evaluate(
        (id) => window.cuepoint!.getJobResults!(id),
        preview.job_id,
      );
      const diffId = (previewed.result as { diff_id: string }).diff_id;

      // The user re-exports before confirming. The numbers they were shown are
      // now about a file that no longer exists in that form.
      rewriteExport(edited, [0, 1, 2, 3, 4, 5, 6]);

      const outcome = await window.evaluate(async (id) => {
        try {
          await window.cuepoint!.startLibraryRefreshApply!({ diff_id: id });
          return { ok: true, message: "" };
        } catch (error) {
          return { ok: false, message: String(error) };
        }
      }, diffId);

      expect(outcome.ok).toBe(false);
      expect(outcome.message).toContain("has changed since this preview");

      const summary = await window.evaluate(() => window.cuepoint!.getLibrarySummary!());
      expect(summary.track_count).toBe(6);
    } finally {
      await app.close();
    }
  });

  test("an unknown diff id is refused with something a user can act on", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);

      const outcome = await window.evaluate(async () => {
        try {
          await window.cuepoint!.startLibraryRefreshApply!({ diff_id: "no-such-diff" });
          return { ok: true, message: "" };
        } catch (error) {
          return { ok: false, message: String(error) };
        }
      });

      expect(outcome.ok).toBe(false);
      expect(outcome.message).toContain("preview the refresh again");
    } finally {
      await app.close();
    }
  });

  test("a running refresh is labelled apart from an import in the strip", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      // Large enough that the strip's two-second discovery poll finds it while
      // it is still running.
      const big = writeExport(
        workspace,
        Array.from({ length: 60_000 }, (_unused, i) => i),
        "big.xml",
      );
      await importLibrary(window, big);

      // `force`, so the preview actually reads the 60,000-track export.
      // LIBRARY-12's fast path answers an untouched file in microseconds — long
      // over before the strip's two-second discovery poll could ever see it.
      await window.evaluate(() =>
        window.cuepoint!.startLibraryRefreshPreview!({ force: true }),
      );

      // "Checking", not "Refreshing" and not "Working": the half that only
      // reads has to be distinguishable from the half that deletes.
      await expect(window.locator(".cp-status__job-label")).toContainText(/^Checking/, {
        timeout: 30_000,
      });
    } finally {
      await app.close();
    }
  });
});
