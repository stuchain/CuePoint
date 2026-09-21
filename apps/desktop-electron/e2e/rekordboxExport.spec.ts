/**
 * Exporting to Rekordbox, end to end (EXPORT-07, the Phase 8 acceptance).
 *
 * The journey a DJ takes, driven through the real window: import a collection
 * whose tracks carry cue points and a beat grid, organize and edit it in
 * CuePoint, open "Export to Rekordbox…" from the Library header, pick a
 * Collection, try to save over the source and be refused, choose a file, read
 * the preview, confirm, and find the file on disk with CuePoint's values in it
 * and nothing else changed. Then the other way in — a Collection's context
 * menu — a changed source, a deleted one, and Settings showing where exports
 * go.
 *
 * The one thing not driven is the operating system's save dialog, which no
 * test can click: `dialog.showSaveDialog` is answered in the main process with
 * the path a person would have chosen, and everything after it is real.
 *
 * `CUEPOINT_E2E_EXECUTABLE` runs the same journey against a packaged build,
 * for example `release/win-unpacked/CuePoint.exe`; without it the development
 * build runs, as it does in CI.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const TONE = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio", "tone.mp3");

/** Three tracks: two with files, one whose file is gone; cue points and a grid on the first. */
function writeLibrary(dir: string) {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const files = [0, 1, 2].map((i) => path.join(music, `${i}.mp3`));
  copyFileSync(TONE, files[0]!);
  copyFileSync(TONE, files[1]!);
  const location = (file: string) => "file://localhost/" + file.replace(/\\/g, "/");
  const xml = path.join(dir, "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.8.5" Company="AlphaTheta"/>
  <COLLECTION Entries="3">
    <TRACK TrackID="101" Name="Tone One" Artist="Artist 1" Genre="House" Tonality="Am" AverageBpm="124.00" Year="2020" Rating="102" TotalTime="300" Location="${location(files[0]!)}">
      <TEMPO Inizio="0.025" Bpm="124.00" Metro="4/4" Battito="1"/>
      <POSITION_MARK Name="Drop" Type="0" Start="64.500" Num="0" Red="40" Green="226" Blue="20"/>
      <POSITION_MARK Name="" Type="0" Start="12.000" Num="-1"/>
    </TRACK>
    <TRACK TrackID="102" Name="Tone Two" Artist="Artist 2" Genre="House" Tonality="F#m" AverageBpm="126.00" Year="2021" Rating="0" TotalTime="300" Location="${location(files[1]!)}"/>
    <TRACK TrackID="103" Name="Gone" Artist="Artist 3" Genre="Techno" Tonality="Gm" AverageBpm="130.00" Year="2019" Rating="255" TotalTime="300" Location="${location(files[2]!)}"/>
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="Journey" Type="1" KeyType="0" Entries="3"><TRACK Key="101"/><TRACK Key="102"/><TRACK Key="103"/></NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return { xml, files: files.slice(0, 2) };
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: cuepointHome,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.env.CUEPOINT_E2E_EXECUTABLE;
  return packaged
    ? electron.launch({ executablePath: packaged, args: [`--user-data-dir=${userDataDir}`], env })
    : electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
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

/** Nothing running: a job that follows another must not be raced. */
async function idle(window: Page) {
  await expect
    .poll(
      async () =>
        (await window.evaluate(() => window.cuepoint!.listJobs!({ state: "active" }))).active_count,
      { timeout: 90_000 },
    )
    .toBe(0);
}

async function finished(window: Page, jobId: string) {
  await expect
    .poll(async () => (await window.evaluate((id) => window.cuepoint!.getJob!(id), jobId))!.state, {
      timeout: 90_000,
    })
    .toMatch(/succeeded|failed|cancelled/);
}

/** What the person would pick in the save dialog, answered in the main process. */
async function saveDialogAnswers(app: ElectronApplication, filePath: string) {
  await app.evaluate(({ dialog }, chosen) => {
    const answer = async () => ({ canceled: false, filePath: chosen });
    (dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = answer;
  }, filePath);
}

async function openLibrary(window: Page) {
  // Through another page and back, so the page reads the tree the bridge built.
  await window.getByRole("link", { name: "Clean", exact: true }).click();
  await window.getByRole("link", { name: "Library", exact: true }).click();
  await expect(window.getByRole("table", { name: "Library tracks" })).toBeVisible({ timeout: 30_000 });
}

async function exportFromHeader(window: Page) {
  await window.getByRole("button", { name: "Collection file ▾" }).click();
  await window
    .getByRole("menu", { name: "Collection file" })
    .getByRole("menuitem", { name: "Export to Rekordbox…" })
    .click();
}

function exportDialog(window: Page) {
  return window.getByRole("dialog", { name: "Export to Rekordbox" });
}

async function previewed(dialog: ReturnType<typeof exportDialog>) {
  await expect(dialog.getByTestId("export-track-count")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByText(/Working out what the export would write/)).toHaveCount(0, {
    timeout: 30_000,
  });
}

test.describe("Export to Rekordbox, end to end (EXPORT-07)", () => {
  test.describe.configure({ timeout: 300_000 });

  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-export-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("a library goes back to Rekordbox, and nothing else changes", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      const library = writeLibrary(workspace);
      const exports = path.join(workspace, "Exports");
      mkdirSync(exports);
      const destination = path.join(exports, "CuePoint Export.xml");
      const before = {
        source: sha256(library.xml),
        audio: library.files.map(sha256),
      };

      await test.step("import the collection, and organize and edit it in CuePoint", async () => {
        const started = await window.evaluate(
          (xml) => window.cuepoint!.startLibraryImport!({ xml_path: xml }),
          library.xml,
        );
        await finished(window, started.job_id);
        await idle(window);

        await window.evaluate(async () => {
          const bridge = window.cuepoint!;
          const found = await bridge.browseLibrary!({ limit: 10, sort: "title", dir: "asc" });
          const id = (title: string) => found.tracks.find((row) => row.title === title)!.id!;
          const one = id("Tone One");
          const two = id("Tone Two");
          const gone = id("Gone");

          const { collection } = await bridge.createCollection!({ kind: "collection", name: "Saturday" });
          await bridge.addTracksToCollection!({ collection_id: collection.id, track_ids: [one, two, gone] });
          // A closing reprise: the same track twice (DEC-058).
          await bridge.insertTrackInCollection!({ collection_id: collection.id, track_id: one, position: 3 });
          await bridge.saveSmartCollection!({
            name: "Techno",
            rules: { match: "all", rules: [{ field: "genre", operator: "is", value: "Techno" }] },
          });

          // CuePoint's values: a key override, a rating — and what never leaves.
          await bridge.setTrackOverrides!({ trackId: two, key: "Cm" });
          await bridge.setTrackMetadata!({ trackId: one, rating: 5, notes: "PRIVATE-NOTE", favorite: true });
          const { tag } = await bridge.createTag!({ name: "PRIVATE-TAG" });
          await bridge.applyBatch!({
            selection: { track_ids: [one] },
            operation: { kind: "add_tag", value: tag.id },
          });
        });

        const check = await window.evaluate(() =>
          window.cuepoint!.startFileCheck!({ selection: { query: {} } }),
        );
        await finished(window, check.job_id);
        await idle(window);
      });

      await test.step("open the export from the Library header, with nothing ticked", async () => {
        await openLibrary(window);
        // The header's actions fit it, and leave the tracks room, at the
        // default window size. Three buttons once left the table 20px tall.
        const body = await window.locator(".library-screen__body").boundingBox();
        expect(body!.height).toBeGreaterThan(150);
        const header = window.locator(".library-header");
        await header.getByRole("button", { name: "Collection file ▾" }).click();
        await window.getByRole("menu", { name: "Collection file" }).getByRole("menuitem", { name: "Export to Rekordbox…" }).click();
        const dialog = exportDialog(window);
        await previewed(dialog);

        await expect(dialog.getByTestId("export-track-count")).toHaveText("3 tracks in the exported file");
        await expect(dialog.getByRole("checkbox", { name: /^Saturday/ })).not.toBeChecked();
        await expect(dialog.getByTestId("export-playlist-headline")).toContainText("No playlists are added");
        await expect(dialog.getByText(/1 track has its audio file missing/)).toBeVisible();
        await expect(dialog.getByText(/Not chosen yet/)).toBeVisible();
        await expect(dialog.getByRole("button", { name: "Export 3 tracks" })).toBeDisabled();
      });

      await test.step("tick a Collection and read what it appends", async () => {
        const dialog = exportDialog(window);
        await dialog.getByRole("checkbox", { name: /^Saturday/ }).check();
        await expect(dialog.getByTestId("export-playlist-headline")).toHaveText(
          "1 playlist added, in a folder called “CuePoint”",
          { timeout: 30_000 },
        );
        await expect(dialog.getByRole("list", { name: "Playlists to add" })).toContainText("CuePoint/Saturday");
        await expect(dialog.getByRole("list", { name: "Playlists to add" })).toContainText("4 tracks");
        await expect(dialog.getByText("2 tracks rewritten with CuePoint's values")).toBeVisible();
        await expect(dialog.getByRole("list", { name: "Changed fields" })).toContainText("Key: 1 track");
        await expect(dialog.getByRole("list", { name: "Changed fields" })).toContainText("Rating: 1 track");
      });

      await test.step("try to save over the source, and be refused", async () => {
        const dialog = exportDialog(window);
        await saveDialogAnswers(app, library.xml);
        await dialog.getByRole("button", { name: "Choose…" }).click();
        await expect(dialog.getByText(library.xml, { exact: true })).toBeVisible();
        await dialog.getByRole("button", { name: "Export 3 tracks and 1 playlist" }).click();

        const refused = dialog.getByRole("region", { name: "Refused" });
        await expect(refused).toContainText("never writes over it", { timeout: 30_000 });
        await expect(dialog.getByRole("button", { name: "Export 3 tracks and 1 playlist" })).toBeDisabled();
        expect(sha256(library.xml)).toBe(before.source);
      });

      await test.step("choose another file and export", async () => {
        const dialog = exportDialog(window);
        await saveDialogAnswers(app, destination);
        await dialog.getByRole("button", { name: "Choose another file…" }).click();
        await expect(dialog.getByText(destination, { exact: true })).toBeVisible();
        const confirm = dialog.getByRole("button", { name: "Export 3 tracks and 1 playlist" });
        await expect(confirm).toBeEnabled({ timeout: 30_000 });
        await confirm.click();

        await expect(
          dialog.getByText("Exported to CuePoint Export.xml: 3 tracks, 2 rewritten, 1 playlist added."),
        ).toBeVisible({ timeout: 60_000 });
        await expect(dialog.getByText(/Imported Library/)).toBeVisible();
        await dialog.getByRole("button", { name: "Done" }).click();
        await expect(dialog).toHaveCount(0);
      });

      await test.step("find CuePoint's values in the file, and everything else as Rekordbox wrote it", async () => {
        const written = readFileSync(destination, "utf-8");
        // The cue points and the beat grid, untouched (DEC-077).
        expect(written).toContain(
          '<POSITION_MARK Name="Drop" Type="0" Start="64.500" Num="0" Red="40" Green="226" Blue="20"/>',
        );
        expect(written).toContain('<POSITION_MARK Name="" Type="0" Start="12.000" Num="-1"/>');
        expect(written).toContain('<TEMPO Inizio="0.025" Bpm="124.00" Metro="4/4" Battito="1"/>');
        // The override and the rating; the untouched rating left as it was.
        expect(written).toMatch(/TrackID="102"[^>]*Tonality="Cm"/);
        expect(written).toMatch(/TrackID="101"[^>]*Rating="255"/);
        expect(written).toMatch(/TrackID="103"[^>]*Rating="255"/);
        expect(written).toMatch(/TrackID="102"[^>]*Rating="0"/);
        // The Collection, in order, with its reprise, under CuePoint's folder.
        expect(written).toMatch(
          /<NODE Name="CuePoint" Type="0" Count="1">\s*<NODE Name="Saturday" Type="1" KeyType="0" Entries="4">\s*<TRACK Key="101"\/>\s*<TRACK Key="102"\/>\s*<TRACK Key="103"\/>\s*<TRACK Key="101"\/>/,
        );
        // The mirrored tree, as it was.
        expect(written).toContain('<NODE Name="Journey" Type="1" KeyType="0" Entries="3">');
        // Tags, notes and favorites stay in CuePoint (DEC-080).
        expect(written).not.toContain("PRIVATE-NOTE");
        expect(written).not.toContain("PRIVATE-TAG");
        // Nothing half-written left beside it.
        expect(readdirSync(exports)).toEqual(["CuePoint Export.xml"]);
      });

      await test.step("find the source and every audio file byte for byte as they were (DEC-085)", async () => {
        expect(sha256(library.xml)).toBe(before.source);
        expect(library.files.map(sha256)).toEqual(before.audio);
      });

      await test.step("find the export in Activity and in the job record", async () => {
        const events = await window.evaluate(() =>
          window.cuepoint!.getRecentActivity!({ type: "rekordbox.exported" }),
        );
        expect(events.events).toHaveLength(1);
        expect(events.events[0]!.summary).toContain("CuePoint Export.xml");
        const history = await window.evaluate(() => window.cuepoint!.getRekordboxExportHistory!({ limit: 5 }));
        expect(history.exports[0]).toMatchObject({
          outcome: "written",
          destination_path: destination,
          track_count: 3,
          changed_track_count: 2,
          key_format: "normal",
        });
        expect(history.exports[0]!.playlists.map((playlist) => playlist.name)).toEqual(["Saturday"]);
      });

      await test.step("export a Smart Collection from its menu, in Camelot", async () => {
        const tree = window.getByRole("tree", { name: "Collections" });
        await tree.getByRole("treeitem", { name: /Techno/ }).click({ button: "right" });
        await window.getByRole("menuitem", { name: "Export to Rekordbox…" }).click();
        const dialog = exportDialog(window);
        await previewed(dialog);
        await expect(dialog.getByRole("checkbox", { name: /^Techno/ })).toBeChecked();
        await expect(dialog.getByRole("checkbox", { name: /^Saturday/ })).not.toBeChecked();
        await expect(dialog.getByText(new RegExp(`the save dialog opens in ${exports.replace(/\\/g, "\\\\")}`))).toBeVisible();

        await dialog.getByRole("combobox", { name: /Key notation/ }).selectOption("camelot");
        await expect(dialog.getByTestId("export-key-consequence")).toContainText("Camelot keys (8A)");
        await expect(dialog.getByTestId("export-playlist-headline")).toHaveText(
          "1 playlist added, in a folder called “CuePoint”",
          { timeout: 30_000 },
        );
        await expect(dialog.getByRole("list", { name: "Playlists to add" })).toContainText(
          "Smart Collection, as it matches now",
        );
        await saveDialogAnswers(app, path.join(exports, "Techno.xml"));
        await dialog.getByRole("button", { name: "Choose…" }).click();
        await dialog.getByRole("button", { name: "Export 3 tracks and 1 playlist" }).click();
        await expect(dialog.getByText(/^Exported to Techno\.xml/)).toBeVisible({ timeout: 60_000 });
        await dialog.getByRole("button", { name: "Done" }).click();

        const written = readFileSync(path.join(exports, "Techno.xml"), "utf-8");
        // Its membership now: the one Techno track (DEC-081).
        expect(written).toMatch(
          /<NODE Name="Techno" Type="1" KeyType="0" Entries="1">\s*<TRACK Key="103"\/>/,
        );
        // Every key in Camelot, the override's included (DEC-089).
        expect(written).toMatch(/TrackID="101"[^>]*Tonality="8A"/);
        expect(written).toMatch(/TrackID="102"[^>]*Tonality="5A"/);
        expect(written).toContain('<POSITION_MARK Name="Drop" Type="0" Start="64.500"');
      });

      await test.step("a source changed since the import is reported, and can still be exported", async () => {
        appendFileSync(library.xml, "\n");
        const stat = statSync(library.xml);
        utimesSync(library.xml, stat.atime, new Date(stat.mtimeMs + 60_000));

        await exportFromHeader(window);
        const dialog = exportDialog(window);
        await previewed(dialog);
        await expect(dialog.getByRole("region", { name: "Source" })).toContainText(
          "collection.xml has changed since you imported it",
        );
        await expect(dialog.getByRole("button", { name: "Refresh first" })).toBeVisible();
        await saveDialogAnswers(app, path.join(exports, "Stale.xml"));
        await expect(dialog.getByRole("combobox", { name: /Key notation/ })).toHaveValue("camelot");
        await dialog.getByRole("button", { name: "Choose…" }).click();
        await expect(dialog.getByRole("button", { name: "Export 3 tracks" })).toBeEnabled({ timeout: 30_000 });
        await dialog.getByRole("button", { name: "Cancel" }).click();
      });

      await test.step("a source that is gone is refused, by name", async () => {
        const moved = `${library.xml}.moved`;
        renameSync(library.xml, moved);
        try {
          await exportFromHeader(window);
          const dialog = exportDialog(window);
          const refused = dialog.getByRole("region", { name: "Refused" });
          await expect(refused).toContainText("not there any more", { timeout: 30_000 });
          await expect(refused).toContainText(library.xml);
          await expect(dialog.getByRole("button", { name: "Import a different collection…" })).toBeVisible();
          await expect(dialog.getByRole("button", { name: /^Export/ })).toBeDisabled();
          await dialog.getByRole("button", { name: "Cancel" }).click();
        } finally {
          renameSync(moved, library.xml);
        }
        expect(existsSync(path.join(exports, "Stale.xml"))).toBe(false);
      });

      await test.step("Settings shows where exports go, and offers no way to start one", async () => {
        await window.getByRole("link", { name: "Settings" }).click();
        const panel = window.locator(".cp-panel").filter({ hasText: "Rekordbox export" });
        await expect(panel.getByTestId("export-remembered-folder")).toHaveText(exports, { timeout: 30_000 });
        await expect(panel.getByTestId("export-remembered-notation")).toHaveText("Camelot (8A, 12B)");
        await expect(panel.getByRole("list")).toContainText("CuePoint Export.xml");
        await expect(panel.getByRole("list")).toContainText("Techno.xml");
        await expect(panel.getByRole("button")).toHaveCount(0);
      });

      await test.step("the exported file reads back as a collection with its tree intact", async () => {
        // Rekordbox itself is the one reader a test cannot drive; CuePoint's
        // own importer, which reads Rekordbox's files, is the next best.
        const started = await window.evaluate(
          (xml) => window.cuepoint!.startLibraryImport!({ xml_path: xml }),
          destination,
        );
        await finished(window, started.job_id);
        await idle(window);
        const read = await window.evaluate(async () => {
          const tree = await window.cuepoint!.getLibraryPlaylists!();
          const rows = await window.cuepoint!.browseLibrary!({ limit: 10, sort: "title", dir: "asc" });
          return {
            playlists: tree.playlists.map((node) => ({
              name: node.name,
              kind: node.kind,
              count: node.track_count,
            })),
            tracks: rows.tracks.map((row) => ({ title: row.title, key: row.key, rating: row.rating })),
          };
        });
        expect(read.playlists).toEqual(
          expect.arrayContaining([
            { name: "Journey", kind: "playlist", count: 3 },
            { name: "CuePoint", kind: "folder", count: expect.any(Number) },
            { name: "Saturday", kind: "playlist", count: 4 },
          ]),
        );
        expect(read.tracks).toEqual(
          expect.arrayContaining([
            { title: "Tone One", key: "Am", rating: 5 },
            { title: "Tone Two", key: "Cm", rating: 0 },
            { title: "Gone", key: "Gm", rating: 5 },
          ]),
        );
      });
    } finally {
      await app.close();
    }
  });
});
