/**
 * Backups, end to end (HARDEN-01): back up, damage a Collection, restore, and it is whole again.
 *
 * The journey a person takes in Settings › Backups: import a library, make a Collection, press
 * Back up now, take tracks out of the Collection, press Restore on that backup and confirm. The
 * restore runs in main with the engine stopped (`electron/backups.ts`) and starts it again; when it
 * ends the Collection holds every track again, and the copy kept of the library as it was just
 * before the restore is listed as "Before restoring".
 */
import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { idle, importLibrary, launchApp, plainTracks, ready, writeExportFile, integrityCheck, libraryFile } from "./hardenHarness";

const TRACKS = 12;

test.describe("Backups and restore (HARDEN-01)", () => {
  test.describe.configure({ timeout: 240_000 });

  let userDataDir: string;
  let home: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    home = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-backups-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, home, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  async function openBackups(window: Page) {
    await window.getByRole("link", { name: "Settings", exact: true }).click();
    const list = window.getByRole("list", { name: "Backups" });
    await expect(window.getByRole("button", { name: "Back up now" })).toBeVisible({ timeout: 30_000 });
    return list;
  }

  test("a backup restores a Collection that tracks were taken out of", async () => {
    const app: ElectronApplication = await launchApp({ userDataDir, home });
    try {
      const window = await ready(app);
      const xml = await writeExportFile(path.join(workspace, "collection.xml"), plainTracks(TRACKS), TRACKS);
      await importLibrary(window, xml);

      const collectionId = await test.step("make a Collection of every track", async () => {
        return window.evaluate(async () => {
          const bridge = window.cuepoint!;
          const found = await bridge.browseLibrary!({ limit: 50, sort: "title", dir: "asc" });
          const { collection } = await bridge.createCollection!({ kind: "collection", name: "Saturday" });
          await bridge.addTracksToCollection!({
            collection_id: collection.id,
            track_ids: found.tracks.map((row: any) => row.id),
          });
          return collection.id as number;
        });
      });
      const entries = () =>
        window.evaluate((id) => window.cuepoint!.getCollectionEntries!({ collectionId: id, limit: 100 }), collectionId);
      expect((await entries()).entry_count).toBe(TRACKS);

      await test.step("Back up now", async () => {
        await openBackups(window);
        await window.getByRole("button", { name: "Back up now" }).click();
        await expect(window.getByText("Backed up just now")).toBeVisible({ timeout: 60_000 });
        const rows = window.getByRole("list", { name: "Backups" }).getByRole("listitem");
        await expect(rows.filter({ hasText: "You made this" })).toHaveCount(1);
      });

      await test.step("take tracks out of the Collection", async () => {
        const page = await entries();
        await window.evaluate(
          (ids) => window.cuepoint!.removeCollectionEntries!({ entry_ids: ids }),
          page.entries.slice(0, 7).map((entry: { id: number }) => entry.id),
        );
        expect((await entries()).entry_count).toBe(TRACKS - 7);
      });

      await test.step("Restore that backup, and confirm", async () => {
        const row = window.getByRole("list", { name: "Backups" }).getByRole("listitem").filter({ hasText: "You made this" });
        await row.getByRole("button", { name: /^Restore the backup from/ }).click();
        const dialog = window.getByRole("dialog", { name: "Restore this backup?" });
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText("Your library as it is now is kept as a backup first");
        await dialog.getByRole("button", { name: "Restore", exact: true }).click();
        await expect(dialog).toHaveCount(0, { timeout: 120_000 });
      });

      await test.step("the Collection is whole again", async () => {
        await idle(window);
        await expect.poll(async () => (await entries()).entry_count, { timeout: 90_000 }).toBe(TRACKS);
        const tree = await window.evaluate(() => window.cuepoint!.getCollections!());
        expect(JSON.stringify(tree)).toContain("Saturday");
      });

      await test.step("the copy from before the restore is listed", async () => {
        const rows = window.getByRole("list", { name: "Backups" }).getByRole("listitem");
        await expect(rows.filter({ hasText: "Before restoring" })).toHaveCount(1, { timeout: 60_000 });
        await expect(rows.filter({ hasText: "You made this" })).toHaveCount(1);
        const listed = await window.evaluate(() => window.cuepoint!.backups!.list());
        expect(listed.backups.some((entry: any) => /^pre-restore/.test(entry.reason))).toBe(true);
      });
    } finally {
      await app.close();
    }
    expect(integrityCheck(libraryFile(home))).toBe("ok");
  });
});

