/**
 * A damaged library opens the recovery screen, and a backup brings it back (HARDEN-03).
 *
 * The library file is overwritten with noise between two launches, as a failing disk or a stray
 * program might leave it. The second launch finds a backup (made by hand in the first), shows the
 * "couldn't read your library" screen, and "Restore this backup" sets the damaged file aside,
 * puts the backup in its place and shows the Library again.
 */
import { test, expect } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  integrityCheck,
  importLibrary,
  launchApp,
  libraryFile,
  plainTracks,
  ready,
  setSeen,
  writeExportFile,
} from "./hardenHarness";
import { waitForEngine } from "./engineReady";

const TRACKS = 15;

test.describe("The library recovery screen (HARDEN-03)", () => {
  test.describe.configure({ timeout: 240_000 });

  let userDataDir: string;
  let home: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    home = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-recovery-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, home, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  test("a library file overwritten with noise opens the Damaged screen, and Restore this backup brings it back", async () => {
    // First run: a library, and a backup of it.
    let app = await launchApp({ userDataDir, home });
    try {
      const window = await ready(app);
      await importLibrary(window, await writeExportFile(path.join(workspace, "collection.xml"), plainTracks(TRACKS), TRACKS));
      const made = await window.evaluate(() => window.cuepoint!.backups!.create());
      expect(made.name).toBeTruthy();
    } finally {
      await app.close();
    }

    // Noise where the library was; its journal files would belong to the old file.
    const db = libraryFile(home);
    expect(existsSync(db)).toBe(true);
    writeFileSync(db, randomBytes(64 * 1024));
    for (const suffix of ["-wal", "-shm"]) rmSync(db + suffix, { force: true });

    // Second run: the screen, not the app.
    app = await launchApp({ userDataDir, home });
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await setSeen(window);
      await window.reload();
      const heading = window.getByRole("heading", { name: "CuePoint couldn't read your library" });
      await expect(heading).toBeVisible({ timeout: 90_000 });
      await expect(window.getByText(/Your latest good backup is from/)).toBeVisible();
      // Nothing of the app behind it.
      await expect(window.getByRole("link", { name: "Library", exact: true })).toHaveCount(0);

      await window.getByRole("button", { name: "Restore this backup" }).click();

      // The screen goes, the app is shown, and the library is as it was backed up.
      await expect(heading).toHaveCount(0, { timeout: 120_000 });
      await window.locator("main.app-main .screen:visible").waitFor({ timeout: 60_000 });
      await waitForEngine(window);
      await expect
        .poll(async () => (await window.evaluate(() => window.cuepoint!.getLibrarySummary!())).track_count, {
          timeout: 60_000,
        })
        .toBe(TRACKS);
      await window.getByRole("link", { name: "Library", exact: true }).click();
      await expect(window.getByRole("grid", { name: "Library tracks" })).toBeVisible({ timeout: 30_000 });
    } finally {
      await app.close();
    }
    expect(integrityCheck(db)).toBe("ok");
  });
});
