/**
 * Folders, files and names that are not ASCII (HARDEN-06).
 *
 * CuePoint's own home folder is called `Müsik ünd Ünicode ✦` (`CUEPOINT_HOME`), and the tracks live
 * under `Ελληνικά/日本語/Beyoncé/`, one of them with a file name written in NFD (the decomposed
 * spelling a Mac's older volumes and a zip made there give). Then the journey: import, refresh
 * shows no change, search "beyonce" and find Beyoncé, write a tag into a file, export, check the
 * files. The 300-character path is Windows' (past its 259-character limit) and the NFC export over
 * an NFD file name is macOS's; each runs only there.
 */
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  FIXTURE_AUDIO,
  finished,
  idle,
  importLibrary,
  integrityCheck,
  launchApp,
  libraryFile,
  ready,
  writeExportFile,
  type GeneratedTrack,
} from "./hardenHarness";

const TONE = path.join(FIXTURE_AUDIO, "tone.mp3");

/** An MP3's audio frames alone (its ID3 tags taken off), to show a tag write left the sound as it was. */
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

test.describe("Unicode paths (HARDEN-06)", () => {
  test.describe.configure({ timeout: 240_000 });

  let userDataDir: string;
  let parent: string;
  let home: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    parent = mkdtempSync(path.join(tmpdir(), "cuepoint-uni-"));
    home = path.join(parent, "Müsik ünd Ünicode ✦");
    workspace = path.join(parent, "Bibliothek ✦");
    mkdirSync(workspace);
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, parent]) rmSync(dir, { recursive: true, force: true });
  });

  test("a library under non-ASCII folders imports, refreshes unchanged, searches folded, writes a tag, exports and checks", async () => {
    const music = path.join(workspace, "Ελληνικά", "日本語", "Beyoncé");
    mkdirSync(music, { recursive: true });
    const names = {
      halo: "Halo ✦.mp3",
      // Written decomposed: "e" and a combining acute, "a" and a combining grave.
      deja: "Déjà Vu.mp3".normalize("NFD"),
      sisyphos: "Σίσυφος.mp3",
      tokyo: "東京.mp3",
    };
    expect(names.deja).not.toBe(names.deja.normalize("NFC"));
    const tracks: GeneratedTrack[] = [
      { id: 1, title: "Halo", artist: "Beyoncé", file: path.join(music, names.halo) },
      { id: 2, title: "Déjà Vu", artist: "Beyoncé", file: path.join(music, names.deja) },
      { id: 3, title: "Σίσυφος", artist: "Ελένη", file: path.join(music, names.sisyphos) },
      { id: 4, title: "東京", artist: "日本語", file: path.join(music, names.tokyo) },
    ];
    for (const track of tracks) copyFileSync(TONE, track.file!);
    // The decomposed name is on disk as it was written: the folder holds four distinct names.
    expect(readdirSync(music).sort()).toEqual(Object.values(names).sort());

    const app = await launchApp({ userDataDir, home });
    try {
      const window = await ready(app);
      const xml = await writeExportFile(path.join(workspace, "collection ✦.xml"), tracks, tracks.length);

      await test.step("import", async () => {
        await importLibrary(window, xml);
        const summary = await window.evaluate(() => window.cuepoint!.getLibrarySummary!());
        expect(summary.track_count).toBe(4);
        // The library file is in the folder with the non-ASCII name.
        expect(existsSync(libraryFile(home))).toBe(true);
      });

      await test.step("a file check finds every file, whatever its spelling", async () => {
        const check = await window.evaluate(() => window.cuepoint!.startFileCheck!({ selection: { query: {} } }));
        expect((await finished(window, check.job_id)).state).toBe("succeeded");
        await idle(window);
        const found = await window.evaluate(() => window.cuepoint!.browseLibrary!({ limit: 20, sort: "title", dir: "asc" }));
        expect(found.tracks).toHaveLength(4);
        for (const track of found.tracks) expect(track.file_status, track.title).toBe("present");
      });

      await test.step("a refresh from the same export shows no change", async () => {
        // The same words again with a newer modified time, so the export is read and compared and not skipped.
        await writeExportFile(xml, tracks, tracks.length);
        const stat = statSync(xml);
        utimesSync(xml, stat.atime.getTime() / 1000 + 5, stat.mtime.getTime() / 1000 + 5);
        const preview = await window.evaluate((file) => window.cuepoint!.startLibraryRefreshPreview!({ xml_path: file }), xml);
        expect((await finished(window, preview.job_id)).state).toBe("succeeded");
        const diff = (await window.evaluate((id) => window.cuepoint!.getJobResults!(id), preview.job_id)).result as {
          is_empty: boolean;
          tracks: { added: { count: number }; removed: { count: number }; changed: { count: number } };
        };
        expect(diff.tracks.added.count).toBe(0);
        expect(diff.tracks.removed.count).toBe(0);
        expect(diff.tracks.changed.count).toBe(0);
        expect(diff.is_empty).toBe(true);
        await idle(window);
      });

      await test.step("searching 'beyonce' finds Beyoncé and only Beyoncé", async () => {
        const found = await window.evaluate(() => window.cuepoint!.searchLibrary!({ q: "beyonce", limit: 20 }));
        expect(found.tracks.map((track: { title: string }) => track.title).sort()).toEqual(["Déjà Vu", "Halo"]);
        // The same in the window: typed into the Library's own search.
        await window.getByRole("link", { name: "Library", exact: true }).click();
        const search = window.locator(".cp-filter-bar").getByRole("searchbox", { name: "Search" });
        await search.fill("beyonce");
        const rows = window.locator('.track-table__row [data-column="title"]');
        await expect(rows.filter({ hasText: "Halo" })).toHaveCount(1, { timeout: 30_000 });
        await expect(rows.filter({ hasText: "Déjà Vu" })).toHaveCount(1);
        await expect(rows.filter({ hasText: "Σίσυφος" })).toHaveCount(0);
        await search.fill("");
      });

      await test.step("a tag is written into the file with the decomposed name", async () => {
        const before = audioFrames(tracks[1]!.file!);
        const preview = await window.evaluate(() =>
          window.cuepoint!.previewTagWrite!({ selection: { query: { q: "beyonce" } } }),
        );
        if (preview.job_id) expect((await finished(window, preview.job_id)).state).toBe("succeeded");
        await idle(window);
        const started = await window.evaluate(
          (id) => window.cuepoint!.startTagWrite!({ preview_id: id }),
          preview.preview_id ?? preview.preview!.preview_id,
        );
        const job = await finished(window, started.job_id);
        expect(job.state).toBe("succeeded");
        await idle(window);
        const record = await window.evaluate((id) => window.cuepoint!.getTagWrites!({ jobId: id }), started.job_id);
        expect(JSON.stringify(record)).toContain("Déjà Vu".normalize("NFD"));
        // The file under that name now holds a tag, and the sound in it is the sound it had.
        expect(readFileSync(tracks[1]!.file!).toString("latin1", 0, 3)).toBe("ID3");
        expect(audioFrames(tracks[1]!.file!)).toBe(before);
        expect(readdirSync(music).sort()).toEqual(Object.values(names).sort());
      });

      await test.step("an export goes to a folder with a non-ASCII name", async () => {
        const folder = path.join(workspace, "Exportación ✦");
        mkdirSync(folder);
        const destination = path.join(folder, "CuePoint Export ✦.xml");
        const started = await window.evaluate(
          (target) => window.cuepoint!.startRekordboxExport!({ collection_ids: null, destination_path: target }),
          destination,
        );
        expect(started.refusal).toBeNull();
        expect((await finished(window, started.started!.job_id)).state).toBe("succeeded");
        await idle(window);
        const written = readFileSync(destination, "utf-8");
        for (const track of tracks) {
          expect(written).toContain(`Name="${track.title}"`);
          expect(written).toContain(`Artist="${track.artist}"`);
        }
        // The Locations still name the same files, and the folder holds only the export.
        expect(decodeURIComponent(written)).toContain(path.join("Ελληνικά", "日本語", "Beyoncé").split(path.sep).join("/"));
        expect(readdirSync(folder)).toEqual(["CuePoint Export ✦.xml"]);
      });
    } finally {
      await app.close();
    }
    expect(integrityCheck(libraryFile(home))).toBe("ok");
  });

  test("a path past 259 characters imports and is found", async () => {
    test.skip(process.platform !== "win32", "Windows' long-path prefix");
    // 300 characters of folders under the workspace, written through the extended-length prefix.
    let deep = workspace;
    while (deep.length < 300) deep = path.join(deep, "Ελληνικά日本語-0123456789");
    const long = (p: string) => `\\\\?\\${p}`;
    mkdirSync(long(deep), { recursive: true });
    const file = path.join(deep, "Beyoncé long.mp3");
    expect(file.length).toBeGreaterThan(300);
    copyFileSync(long(TONE), long(file));

    const app = await launchApp({ userDataDir, home });
    try {
      const window = await ready(app);
      const track: GeneratedTrack = { id: 1, title: "Long", artist: "Beyoncé", file };
      await importLibrary(window, await writeExportFile(path.join(workspace, "long.xml"), [track], 1));
      const check = await window.evaluate(() => window.cuepoint!.startFileCheck!({ selection: { query: {} } }));
      expect((await finished(window, check.job_id)).state).toBe("succeeded");
      const found = await window.evaluate(() => window.cuepoint!.browseLibrary!({ limit: 5 }));
      expect(found.tracks[0].file_status).toBe("present");
    } finally {
      await app.close();
    }
  });

  test("an NFC export over an NFD file name still finds the file", async () => {
    test.skip(process.platform !== "darwin", "macOS volumes treat the two spellings as one name");
    const decomposed = path.join(workspace, "Déjà Vu.mp3".normalize("NFD"));
    copyFileSync(TONE, decomposed);
    const composed = path.join(workspace, "Déjà Vu.mp3".normalize("NFC"));
    const app = await launchApp({ userDataDir, home });
    try {
      const window = await ready(app);
      await importLibrary(
        window,
        await writeExportFile(path.join(workspace, "nfc.xml"), [{ id: 1, title: "Déjà Vu", artist: "Beyoncé", file: composed }], 1),
      );
      const check = await window.evaluate(() => window.cuepoint!.startFileCheck!({ selection: { query: {} } }));
      expect((await finished(window, check.job_id)).state).toBe("succeeded");
      const found = await window.evaluate(() => window.cuepoint!.browseLibrary!({ limit: 5 }));
      expect(found.tracks[0].file_status).toBe("present");
    } finally {
      await app.close();
    }
  });
});
