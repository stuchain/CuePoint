/**
 * Phase 7's journey, end to end (CLEAN-14).
 *
 * Everything Clean does, in the order a person meets it, against a real
 * engine, a real preload and real files: a library is imported, a playlist is
 * matched, one track is accepted automatically and one waits for review; the
 * review chooses the second candidate from the keyboard, applies its key and
 * BPM, and the Library shows the applied values with their source until the
 * apply is reverted. A file check finds the missing file, the Missing files tab counts it and
 * shows it, tags are previewed, written into a copy of a real
 * MP3 and restored, a refresh that would remove the reviewed track names it
 * before anything is removed, and the retired inKey address lands on Clean.
 *
 * Beatport is stubbed at the engine: `CUEPOINT_BEATPORT_FIXTURE` names the
 * pages and the search answers in `src/tests/fixtures/beatport/journey/`, and
 * the matcher scores them as it would live ones. Nothing reaches Beatport.
 *
 * `CUEPOINT_E2E_EXECUTABLE` runs the same journey against a packaged build,
 * for example `release/win-unpacked/CuePoint.exe`; without it the development
 * app runs. Each launch gets its own `--user-data-dir` and `CUEPOINT_HOME`, and
 * the audio is a copy of the repository's fixture.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const TONE = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio", "tone.mp3");
const BEATPORT = path.join(REPO_ROOT, "src", "tests", "fixtures", "beatport", "journey", "fixture.json");

interface Journey {
  xml: string;
  files: string[];
}

interface Track {
  name: string;
  artist: string;
  file: boolean;
}

const TRACKS: Track[] = [
  { name: "Tone One", artist: "Artist 1", file: true },
  { name: "Tone Two", artist: "Artist 2", file: true },
  { name: "Gone", artist: "Artist 3", file: false },
];

/** A Rekordbox export of `tracks`, with a playlist holding all of them. */
function exportXml(xml: string, files: string[], tracks: Track[]) {
  const rows = tracks.map((track) => {
    const index = TRACKS.findIndex((known) => known.name === track.name);
    // A Rekordbox Location is a file URL: "file://localhost/" then the path
    // with no leading slash. Dropping the strip left "file://localhost//var/..."
    // on macOS, whose doubled slash the file check reads as a UNC share
    // ("//server/share") and reports every file under it as missing.
    const location = "file://localhost/" + files[index]!.replace(/\\/g, "/").replace(/^\/+/, "");
    return (
      `<TRACK TrackID="${index + 1}" Name="${track.name}" Artist="${track.artist}" ` +
      `Genre="House" Tonality="8A" AverageBpm="124.00" Year="2020" TotalTime="300" ` +
      `Location="${location}"/>`
    );
  });
  const entries = tracks
    .map((track) => `<TRACK Key="${TRACKS.findIndex((known) => known.name === track.name) + 1}"/>`)
    .join("");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${tracks.length}">
${rows.join("\n")}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="Journey" Type="1" KeyType="0" Entries="${tracks.length}">${entries}</NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
}

/** Two real MP3s and one path with nothing at it. */
function writeLibrary(dir: string): Journey {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const files = TRACKS.map((track, i) => {
    const file = path.join(music, `${i}.mp3`);
    if (track.file) copyFileSync(TONE, file);
    return file;
  });
  const xml = path.join(dir, "collection.xml");
  exportXml(xml, files, TRACKS);
  return { xml, files };
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: cuepointHome,
    CUEPOINT_BEATPORT_FIXTURE: BEATPORT,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CUEPOINT_SKIP_BEATPORT;
  const packaged = process.env.CUEPOINT_E2E_EXECUTABLE;
  return packaged
    ? electron.launch({ executablePath: packaged, args: [`--user-data-dir=${userDataDir}`], env })
    : electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await window.evaluate(() => ((localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.getItem("cuepoint-ui-lab-scale") === "1.25" && localStorage.removeItem("cuepoint-ui-lab-scale")), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
  await window.reload();
  await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
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

async function importLibrary(window: Page, xml: string) {
  const started = await window.evaluate(
    (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
    xml,
  );
  await expect
    .poll(
      async () =>
        (await window.evaluate((id) => window.cuepoint!.getJob!(id), started.job_id))!.state,
      { timeout: 60_000 },
    )
    .toBe("succeeded");
  await idle(window);
}

function libraryRow(window: Page, title: string) {
  return window
    .getByRole("table", { name: "Library tracks" })
    .getByRole("row")
    .filter({ hasText: title });
}

/** A row of the Review table: every track of the playlist that just finished, with where each stands. */
function reviewRow(window: Page, title: string) {
  return window
    .getByRole("region", { name: /^Review / })
    .getByRole("table")
    .getByRole("row")
    .filter({ hasText: title });
}

/** The side panel beside the Review table: one track's candidates. */
function detailsPanel(window: Page) {
  return window.getByRole("complementary", { name: /^Candidates for / });
}

/** Open a track's side panel by clicking its row (not its tick or its preview). */
async function openDetails(window: Page, title: string) {
  await reviewRow(window, title).locator("td.review-row__yours").click();
  const panel = detailsPanel(window);
  await expect(panel.locator(".review-panel__title")).toHaveText(title, { timeout: 15_000 });
  return panel;
}

test.describe("Clean, end to end (CLEAN-14)", () => {
  test.describe.configure({ timeout: 360_000 });

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

  test("the whole of Phase 7, in the order a person meets it", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      const library = writeLibrary(workspace);

      await test.step("import a library", async () => {
        await importLibrary(window, library.xml);
      });

      await test.step("match a playlist", async () => {
        await window.getByRole("link", { name: "Clean", exact: true }).click();
        // Match opens on Playlists (C22): the playlist says it is not matched; tick it and press Match.
        await expect(window.getByRole("tab", { name: "Playlists", exact: true })).toHaveAttribute(
          "aria-selected",
          "true",
          { timeout: 30_000 },
        );
        const journey = window.getByRole("row").filter({ hasText: "Journey" });
        await expect(journey).toHaveAttribute("data-status", "not_matched", { timeout: 15_000 });
        await window.getByRole("checkbox", { name: "Match Journey" }).check();
        await window.getByRole("button", { name: "Match 1 playlist" }).click();
        await expect(window.getByText("Matching 3 tracks on Beatport.", { exact: true })).toBeVisible({ timeout: 30_000 });
        // The run lands on its Review when it ends: every track, with where each stands and a tick.
        await expect(window.getByRole("tab", { name: "Review Journey" })).toHaveAttribute("aria-selected", "true", {
          timeout: 90_000,
        });
        await idle(window);
        await expect(reviewRow(window, "Tone Two")).toContainText("Check", { timeout: 15_000 });
      });

      await test.step("see what was accepted and what needs review", async () => {
        // One plain table: the sure match is Matched and ticked, the proposal is Check.
        await expect(reviewRow(window, "Tone One")).toContainText("Matched", { timeout: 15_000 });
        await expect(window.getByRole("checkbox", { name: /^Sync Tone One/ })).toBeChecked();
        await expect(reviewRow(window, "Tone Two")).toContainText("Check");

        // Beatport's artwork for the accepted track, decoded into a thumbnail
        // by the engine's guarded decoder — in a packaged build, Pillow's.
        const artwork = await window.evaluate(async () => {
          const found = await window.cuepoint!.browseLibrary!({ q: "Tone One", limit: 1 });
          const url = await window.cuepoint!.getTrackArtwork!({
            trackId: found.tracks[0]!.id!,
            size: "inspector",
          });
          if (!url) return null;
          const image = new Image();
          image.src = url;
          await image.decode();
          const size = { width: image.naturalWidth, height: image.naturalHeight };
          window.cuepoint!.releaseTrackArtwork!(url);
          return size;
        });
        expect(artwork).not.toBeNull();
        expect(artwork!.width).toBeGreaterThan(0);
        expect(artwork!.height).toBe(artwork!.width);
      });

      await test.step("choose the second-best result from the side panel, then sync the playlist", async () => {
        // A click on the row opens the panel straight on the candidates.
        const panel = await openDetails(window, "Tone Two");
        const candidates = panel.getByRole("list", { name: "Beatport candidates" });
        await expect(candidates).toBeVisible({ timeout: 15_000 });
        // The other result is the one in E minor (9A): Use this confirms it and ticks the track.
        await candidates.getByRole("listitem").filter({ hasText: "9A" }).getByRole("button", { name: /^Use / }).click();
        await window.keyboard.press("Escape");
        const row = reviewRow(window, "Tone Two");
        await expect(row).toContainText("Matched", { timeout: 15_000 });
        await expect(window.getByRole("checkbox", { name: /^Sync Tone Two/ })).toBeChecked();
        // And the engine holds the second result, the one chosen.
        const decided = await window.evaluate(async () => {
          const found = await window.cuepoint!.browseLibrary!({ q: "Tone Two", limit: 1 });
          const matches = await window.cuepoint!.getTrackMatches!({ trackId: found.tracks[0]!.id! });
          const attempt = matches.state.attempt_id!;
          const listed = await window.cuepoint!.getMatchCandidates!({ attemptId: attempt });
          return {
            state: matches.state.state,
            decidedBy: matches.state.decided_by,
            chosen: listed.candidates.find((c) => c.id === matches.state.candidate_id)?.key,
            order: listed.candidates.map((c) => c.key),
          };
        });
        expect(decided).toMatchObject({ state: "accepted", decidedBy: "user", chosen: "E Minor" });

        // Sync: the green button opens one window for the ticked tracks; the choice of values is made there.
        const before = readFileSync(library.files[1]!);
        await window.getByRole("button", { name: "Sync Journey to files…" }).click();
        const dialog = window.getByRole("dialog", { name: "Sync Journey to your files" });
        await dialog.getByRole("checkbox", { name: "Key" }).check({ timeout: 60_000 });
        const sync = dialog.getByRole("button", { name: /^Sync \d[\d,]* tracks?$/ });
        await expect(sync).toBeEnabled({ timeout: 30_000 });
        expect(readFileSync(library.files[1]!).equals(before)).toBe(true);
        await sync.click();
        await expect(dialog.getByRole("region", { name: "Saved" })).toContainText(/Wrote \d[\d,]* files?/, {
          timeout: 30_000,
        });
        expect(readFileSync(library.files[1]!).includes(Buffer.from("TKEY"))).toBe(true);
        // Only now are the values in CuePoint's own: the sync recorded what each file got, as one batch.
        const bpm = () =>
          window.evaluate(async () => {
            const found = await window.cuepoint!.browseLibrary!({ q: "Tone Two", limit: 1 });
            return found.tracks[0]!.effective_bpm;
          });
        expect(await bpm()).toBe(125);
        // Undo this save puts the files back and takes that batch back with them.
        await dialog.getByRole("button", { name: "Undo this save" }).click();
        await expect(dialog).toContainText(/Undid \d[\d,]* files?/, { timeout: 30_000 });
        expect(readFileSync(library.files[1]!).includes(Buffer.from("TKEY"))).toBe(false);
        expect(await bpm()).toBe(124);
        await dialog.getByRole("button", { name: "Done" }).click();
        await idle(window);
      });

      await test.step("the Library shows Rekordbox's values again after the undo", async () => {
        await window.getByRole("link", { name: "Library", exact: true }).click();
        const row = libraryRow(window, "Tone Two");
        await expect(row.locator('[data-column="bpm"]')).toHaveText("124", { timeout: 30_000 });
        await expect(row.getByRole("img")).toHaveCount(0);
      });

      await test.step("check files, with one missing", async () => {
        await window.getByRole("link", { name: "Clean", exact: true }).click();
        await window.getByRole("tab", { name: "Missing files" }).click();
        await window.getByRole("button", { name: /^Check (every file|again)$/ }).click();
        await idle(window);
        const missing = window.getByRole("table", { name: "Missing files" });
        await expect(missing.getByText("Gone")).toBeVisible({ timeout: 15_000 });
        await expect(missing.getByText("Tone One")).toHaveCount(0);
      });

      await test.step("see the missing-file count on its tab (Health moved to Statistics)", async () => {
        await expect(window.getByRole("tab", { name: "Missing files (1)" })).toBeVisible({ timeout: 15_000 });
        await expect(window.getByRole("tab", { name: /^Health/ })).toHaveCount(0);
        await expect(window.getByRole("tab", { name: /^Fix values/ })).toHaveCount(0);
        const table = window.getByRole("table", { name: "Missing files" });
        await expect(table.getByText("Gone")).toBeVisible({ timeout: 15_000 });
        await expect(table.getByText("Tone One")).toHaveCount(0);
        await window.getByRole("link", { name: "Library", exact: true }).click();
        await expect(
          window.getByRole("table", { name: "Library tracks" }).getByText("Tone One"),
        ).toBeVisible({ timeout: 15_000 });
      });

      await test.step("the Library keeps no save bar and Clean none either", async () => {
        await window.getByRole("link", { name: "Clean", exact: true }).click();
        await expect(window.getByRole("region", { name: "Save to files" })).toHaveCount(0);
        // The refresh below is the Library's.
        await window.getByRole("link", { name: "Library", exact: true }).click();
      });

      await test.step("a refresh that removes the reviewed track names it first", async () => {
        exportXml(library.xml, library.files, TRACKS.filter((track) => track.name !== "Tone Two"));
        await window.getByRole("button", { name: /Check for changes/ }).click();
        const dialog = window.getByRole("dialog", { name: "Review this refresh" });
        await expect(dialog).toBeVisible({ timeout: 60_000 });
        await expect(dialog.getByRole("alert").filter({ hasText: "your own work" })).toContainText(
          /1 track you are about to remove carries your own work: .*1 reviewed/,
        );
        await expect(dialog.locator(".library-preview__samples")).toContainText("Tone Two");
        await expect(libraryRow(window, "Tone Two")).toBeVisible();

        await dialog
          .getByRole("checkbox", { name: "I understand this removes my own work on these tracks too" })
          .check();
        await dialog.getByRole("button", { name: "Remove 1 track and refresh" }).click();
        await expect(libraryRow(window, "Tone Two")).toHaveCount(0, { timeout: 60_000 });
        await expect(libraryRow(window, "Tone One")).toBeVisible();
      });

      await test.step("the retired inKey address lands on Clean", async () => {
        await window.evaluate(() => {
          window.location.hash = "#/match";
        });
        await expect.poll(() => window.evaluate(() => window.location.hash)).toBe("#/clean");
        await expect(window.getByRole("heading", { name: "Clean", level: 1 })).toBeVisible();
        const nav = window.getByRole("navigation", { name: /main navigation/i });
        await expect(nav.getByRole("link", { name: "inKey", exact: true })).toHaveCount(0);
        await expect(nav.getByRole("link", { name: "Results", exact: true })).toHaveCount(0);
      });
    } finally {
      await app.close();
    }
  });
});
