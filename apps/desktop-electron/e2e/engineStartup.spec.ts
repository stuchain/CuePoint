/**
 * Launching over an existing library shows it, however long the engine takes.
 *
 * The window stopped waiting for the engine (Phase 8 macOS pass), and the first
 * screen asked for its data while the engine was still starting. Refused, the
 * Library read its summary as absent and said "No collection imported yet" to
 * a library that was there — and went on saying it after the engine was up,
 * because it only asks once. Every other spec here starts from an empty library
 * and waits for "Engine connected" before doing anything, so none of them could
 * see it.
 *
 * This one does neither: it imports, quits, relaunches over the same library,
 * and goes to the Library without waiting for the engine.
 */
import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

const TRACKS = 12;

function writeExport(dir: string): string {
  const tracks = Array.from({ length: TRACKS }, (_, index) => index + 1)
    .map(
      (id) =>
        `<TRACK TrackID="${id}" Name="Track ${id}" Artist="Artist ${id}" ` +
        `Location="file://localhost/m/${id}.mp3"/>`,
    )
    .join("\n");
  const file = path.join(dir, "collection.xml");
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${TRACKS}">
${tracks}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0"></NODE></PLAYLISTS>
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

test.describe("Engine startup", () => {
  let root: string;

  test.beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "cuepoint-engine-startup-"));
  });

  test.afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test("a relaunch over an imported library shows it while the engine starts", async () => {
    const userDataDir = path.join(root, "user-data");
    const home = path.join(root, "home");
    const xml = writeExport(root);

    // First run: import, and leave onboarding done so the relaunch goes
    // straight to the shell.
    let app = await launch(userDataDir, home);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await window.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
      await waitForEngine(window);
      const started = await window.evaluate(
        (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
        xml,
      );
      await expect
        .poll(
          async () =>
            (await window.evaluate((id) => window.cuepoint!.getJob!(id), started.job_id))!.state,
          { timeout: 90_000 },
        )
        .toBe("succeeded");
    } finally {
      await app.close();
    }

    // Second run: straight to the Library, without waiting for the engine —
    // which is what a person does, and what the Library has to survive.
    app = await launch(userDataDir, home);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
      await window.getByRole("link", { name: "Library" }).click();

      await expect(window.locator(".track-table__row").first()).toBeVisible({ timeout: 90_000 });
      await expect(window.getByText("No collection imported yet")).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});
