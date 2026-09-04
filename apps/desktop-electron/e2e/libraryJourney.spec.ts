/**
 * Phase 3, end to end, in the packaged app (LIBRARY-12).
 *
 * The other library specs each prove one step. This one is the phase-level
 * acceptance list walked in a single run of the real app, in the order a user
 * would meet it, because a chain of steps that each pass alone can still fail
 * where they join — and this is the last chance to find that out.
 *
 * It asserts, in one session:
 *
 * 1. A Rekordbox export imports completely, with the full playlist tree.
 * 2. Re-importing the same file changes nothing.
 * 3. An edited export produces a correct preview and applies on confirmation.
 * 4. A track Rekordbox renumbered is re-linked, not deleted and re-added.
 * 5. Removed tracks are deleted and the activity feed records what happened.
 * 6. The import runs as a job and is visible from anywhere in the app.
 * 7. An untouched export is answered without being read (LIBRARY-12).
 *
 * `CUEPOINT_HOME` points at a temporary directory, so the run never reads or
 * writes the real CuePoint library.
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

/** A track's identity as Rekordbox reports it: an id, and the file it points at. */
interface TrackSpec {
  id: number;
  file: number;
}

/**
 * Write an export.
 *
 * `id` and `file` are separate so a renumbering can be expressed directly: the
 * same file with a new TrackID is the case DEC-002 exists for, and the one that
 * would otherwise read as a deletion plus an addition.
 */
function writeExport(dir: string, tracks: TrackSpec[], name = "collection.xml"): string {
  const entries = tracks
    .map(
      ({ id, file }) =>
        `<TRACK TrackID="${id}" Name="Track ${file}" Artist="Artist ${file}" ` +
        `${TRACK_ATTRS} Location="file://localhost/m/${file}.mp3"/>`,
    )
    .join("\n");
  const members = tracks
    .slice(0, 3)
    .map(({ id }) => `<TRACK Key="${id}"/>`)
    .join("");
  const file = path.join(dir, name);
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${tracks.length}">
${entries}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0">
    <NODE Name="Warmup" Type="1" Entries="3">${members}</NODE>
    <NODE Name="Peak" Type="1" Entries="1"><TRACK Key="${tracks[0]!.id}"/></NODE>
  </NODE></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return file;
}

/** `1..n` as plain tracks whose id and file agree. */
function plain(ids: number[]): TrackSpec[] {
  return ids.map((id) => ({ id, file: id }));
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

async function importCollection(window: Page, xmlPath: string) {
  const started = await window.evaluate(
    (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
    xmlPath,
  );
  const finished = await settle(window, started.job_id);
  expect(finished!.state).toBe("succeeded");
  // The import really did run as a job, and the job store knows what kind.
  expect(finished!.type).toBe("library_import");
  return started.job_id;
}

test.describe("Phase 3 end to end (LIBRARY-12)", () => {
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

  test("import, re-import, preview, re-link and apply, in one session", async () => {
    test.setTimeout(180_000);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);

      // ---------------------------------------------------------------- 1
      const original = writeExport(workspace, plain([1, 2, 3, 4, 5, 6]));
      await importCollection(window, original);
      await window.getByRole("link", { name: "Library" }).click();
      await expect(window.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();

      await expect(window.getByTestId("library-track-count")).toHaveText("6 tracks");
      // Two playlists plus the ROOT folder they hang from.
      await expect(window.getByText("3 playlists")).toBeVisible();
      await expect(window.getByText("4 entries")).toBeVisible();
      await expect(window.getByText("Up to date")).toBeVisible();

      // ---------------------------------------------------------------- 2
      await importCollection(window, original);
      const afterSecond = await window.evaluate(() =>
        window.cuepoint!.getLibrarySummary!(),
      );
      expect(afterSecond.track_count).toBe(6);
      expect(afterSecond.playlist_entry_count).toBe(4);

      // ---------------------------------------------------------------- 7
      // An untouched export is answered from its recorded state, not read.
      const untouched = await window.evaluate(async () => {
        const started = await window.cuepoint!.startLibraryRefreshPreview!({});
        return started.job_id;
      });
      await settle(window, untouched);
      const quiet = (
        await window.evaluate((id) => window.cuepoint!.getJobResults!(id), untouched)
      ).result as { is_empty: boolean; contents_compared: boolean };
      expect(quiet.is_empty).toBe(true);
      expect(quiet.contents_compared).toBe(false);

      // ------------------------------------------------------------- 3 & 4
      // Track 1 is renumbered — same file, new TrackID, which must re-link
      // rather than read as a deletion plus an addition. Tracks 5 and 6 are
      // gone, and 9 is new.
      writeExport(workspace, [
        { id: 101, file: 1 },
        { id: 2, file: 2 },
        { id: 3, file: 3 },
        { id: 4, file: 4 },
        { id: 9, file: 9 },
      ]);
      await window.reload();
      await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
      await window.getByRole("link", { name: "Library" }).click();
      await expect(window.getByText("Out of date")).toBeVisible({ timeout: 30_000 });

      await window.getByRole("button", { name: /Check for changes/i }).click();
      const dialog = window.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 30_000 });

      await expect(dialog.getByTestId("count-added")).toHaveText("1");
      await expect(dialog.getByTestId("count-removed")).toHaveText("2");
      // The renumbered track is re-linked, and is *not* counted as removed.
      await expect(dialog.getByTestId("count-relinked")).toHaveText("1");

      // ---------------------------------------------------------------- 5
      await dialog.getByRole("button", { name: /Remove 2 tracks and refresh/i }).click();
      await expect(dialog).not.toBeVisible({ timeout: 60_000 });
      await expect(window.getByTestId("library-track-count")).toHaveText("5 tracks", {
        timeout: 60_000,
      });

      const activity = await window.evaluate(() =>
        window.cuepoint!.getRecentActivity!({ limit: 20 }),
      );
      const kinds = activity.events.map((event) => event.type);
      expect(kinds).toContain("library.refreshed");
      expect(kinds).toContain("library.imported");
      const refreshed = activity.events.find((e) => e.type === "library.refreshed")!;
      expect(refreshed.detail.deleted).toBe(2);
      expect(refreshed.detail.relinked).toBe(1);

      // ---------------------------------------------------------------- 6
      // The status strip reports library work from anywhere in the app, so this
      // is asserted from a different page than the one that started it.
      await window.getByRole("link", { name: "Tools" }).click();
      const big = writeExport(
        workspace,
        plain(Array.from({ length: 60_000 }, (_unused, i) => i + 1)),
        "big.xml",
      );
      await window.evaluate(
        (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
        big,
      );
      await expect(window.locator(".cp-status__job-label")).toContainText(/^Importing/, {
        timeout: 30_000,
      });
      await expect(window.locator("progress.cp-status__progress")).toBeVisible();
    } finally {
      await app.close();
    }
  });
});
