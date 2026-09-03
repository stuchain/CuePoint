/**
 * The Library page in the running app (LIBRARY-11).
 *
 * The unit tests drive the page against a faked bridge and prove the wording
 * and the flow. This drives it against a real engine, through a real preload,
 * with a real SQLite library underneath — which is where a page that renders
 * perfectly against fixtures still fails, because the shape it was handed is
 * not the shape the engine actually sends.
 *
 * The acceptance criterion is one sentence about a user: import a collection,
 * see it, refresh it, and cancel a refresh at the preview without anything
 * changing. Those are the tests.
 *
 * The file dialog cannot be clicked from Playwright, so the import is started
 * through the same bridge method the button calls; everything after that — the
 * counts, the preview, the confirm, the cancel — is real clicking.
 *
 * Each launch gets its own `--user-data-dir` and `CUEPOINT_HOME`, so a run
 * never reads or writes the real CuePoint library.
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

/** Navigate to Library by clicking the sidebar entry the registry now renders. */
async function openLibrary(window: Page) {
  await window.getByRole("link", { name: "Library" }).click();
  await expect(window.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
}

/** Import through the bridge — the file dialog itself is not clickable here. */
async function importCollection(window: Page, xmlPath: string) {
  const started = await window.evaluate(
    (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
    xmlPath,
  );
  await expect
    .poll(
      async () =>
        (await window.evaluate((id) => window.cuepoint!.getJob!(id), started.job_id))!.state,
      { timeout: 60_000 },
    )
    .toBe("succeeded");
}

test.describe("The Library page (LIBRARY-11)", () => {
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

  test("is reachable from the sidebar and says what to do when empty", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);

      // DEC-020's registry: enabling one flag is what put this here.
      await openLibrary(window);

      await expect(window.getByText(/No collection imported yet/i)).toBeVisible();
      await expect(
        window.getByRole("button", { name: /Import a collection/i }),
      ).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("shows a real imported collection", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      const xmlPath = writeExport(workspace, [0, 1, 2, 3, 4, 5]);

      await importCollection(window, xmlPath);
      await openLibrary(window);

      await expect(window.getByTestId("library-track-count")).toHaveText("6 tracks");
      await expect(window.getByText(xmlPath)).toBeVisible();
      await expect(window.getByText("Up to date")).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("notices when the export has changed since the import", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      const xmlPath = writeExport(workspace, [0, 1, 2, 3, 4, 5]);
      await importCollection(window, xmlPath);

      // The user re-exports from Rekordbox.
      writeExport(workspace, [0, 1, 2, 3, 4, 5, 6]);
      await openLibrary(window);

      await expect(window.getByText("Out of date")).toBeVisible();
      await expect(window.getByText(/has changed since your last import/i)).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("cancelling the preview changes nothing (the acceptance criterion)", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(workspace, [0, 1, 2, 3, 4, 5]));
      // Two tracks leave the collection, so the preview has removals to warn
      // about — the case where cancelling matters most.
      writeExport(workspace, [0, 1, 2, 3]);
      await openLibrary(window);

      await window.getByRole("button", { name: /Check for changes/i }).click();
      const dialog = window.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByTestId("count-removed")).toHaveText("2");
      await expect(dialog.getByText(/cannot be undone/i)).toBeVisible();

      await dialog.getByRole("button", { name: "Cancel" }).click();

      await expect(dialog).not.toBeVisible();
      // Still six: the preview wrote nothing and the cancel applied nothing.
      await expect(window.getByTestId("library-track-count")).toHaveText("6 tracks");
      const summary = await window.evaluate(() => window.cuepoint!.getLibrarySummary!());
      expect(summary.track_count).toBe(6);
    } finally {
      await app.close();
    }
  });

  test("confirming the preview applies exactly what it promised", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(workspace, [0, 1, 2, 3, 4, 5]));
      writeExport(workspace, [0, 1, 2, 3, 9]);
      await openLibrary(window);

      await window.getByRole("button", { name: /Check for changes/i }).click();
      const dialog = window.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByTestId("count-added")).toHaveText("1");
      await expect(dialog.getByTestId("count-removed")).toHaveText("2");

      // The irreversible number is on the button, not only in the paragraph.
      await dialog.getByRole("button", { name: /Remove 2 tracks and refresh/i }).click();

      await expect(dialog).not.toBeVisible({ timeout: 30_000 });
      await expect(window.getByTestId("library-track-count")).toHaveText("5 tracks", {
        timeout: 30_000,
      });
      await expect(window.getByText(/2 removed/)).toBeVisible();
      await expect(window.getByText("Up to date")).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("two watchers can follow the same job at once", async () => {
    // A regression test, and the real-collection run is what found it. The
    // status strip follows whatever job is running; the Library page follows
    // the job it just started. Those are the same job, from the same renderer,
    // and the supervisor used to cancel the first stream when the second
    // subscribed — so the page waited forever for work the engine had already
    // finished. Small exports hid it, because the job was over before either
    // subscription attached.
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      const xmlPath = writeExport(
        workspace,
        Array.from({ length: 20_000 }, (_unused, i) => i),
        "big.xml",
      );

      const seen = await window.evaluate(async (file) => {
        const started = await window.cuepoint!.startLibraryImport!({ xml_path: file });
        const terminal = ["succeeded", "failed", "cancelled"];
        const wait = (label: string) =>
          new Promise<string>((resolve) => {
            const stop = window.cuepoint!.subscribeJobEvents!(
              started.job_id,
              (event: { state?: string }) => {
                if (event.state && terminal.includes(event.state)) {
                  stop();
                  resolve(`${label}:${event.state}`);
                }
              },
            );
            setTimeout(() => resolve(`${label}:timed-out`), 120_000);
          });

        // Both subscribe before the job can finish, which is the case that
        // used to break.
        return Promise.all([wait("first"), wait("second")]);
      }, xmlPath);

      expect(seen).toEqual(["first:succeeded", "second:succeeded"]);
    } finally {
      await app.close();
    }
  });

  test("says so plainly when a refresh would change nothing", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(workspace, [0, 1, 2]));
      await openLibrary(window);

      await window.getByRole("button", { name: /Check for changes/i }).click();
      const dialog = window.getByRole("dialog");

      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog.getByText(/already matches this export/i)).toBeVisible();
      // Nothing to confirm means no confirm button to press by mistake.
      await expect(
        dialog.getByRole("button", { name: /Remove|Apply changes/i }),
      ).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});
