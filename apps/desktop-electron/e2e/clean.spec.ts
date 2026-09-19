/**
 * Phase 7's journey, end to end (CLEAN-14).
 *
 * Everything Clean does, in the order a person meets it, against a real
 * engine, a real preload and real files: a library is imported, a playlist is
 * matched, one track is accepted automatically and one waits for review; the
 * review chooses the second candidate from the keyboard, applies its key and
 * BPM, and the Library shows the applied values with their source until the
 * apply is reverted. A file check finds the missing file, Health counts it and
 * opens the Library on it, tags are previewed, written into a copy of a real
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
    const location = "file://localhost/" + files[index]!.replace(/\\/g, "/");
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

function queueRow(window: Page, title: string) {
  return window
    .getByRole("table", { name: "Review queue" })
    .getByRole("row")
    .filter({ hasText: title });
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
        await expect(window.getByText("Nothing is matched yet.")).toBeVisible({ timeout: 30_000 });
        await window.getByRole("combobox", { name: "In" }).selectOption({ label: "Journey" });
        await window.getByRole("combobox", { name: "Show" }).selectOption("not_matched");
        await expect(queueRow(window, "Tone Two")).toBeVisible({ timeout: 15_000 });
        await window.getByRole("button", { name: "Match all 3" }).click();
        await expect(window.getByText("Matching 3 tracks on Beatport.")).toBeVisible({ timeout: 30_000 });
        await expect(window.getByText("Matching finished.")).toBeVisible({ timeout: 90_000 });
        await idle(window);
      });

      await test.step("see what was accepted and what needs review", async () => {
        const show = window.getByRole("combobox", { name: "Show" });
        await show.selectOption("accepted");
        await expect(queueRow(window, "Tone One")).toBeVisible({ timeout: 15_000 });
        await expect(queueRow(window, "Tone Two")).toHaveCount(0);
        await show.selectOption("needs_review");
        await expect(queueRow(window, "Tone Two")).toBeVisible({ timeout: 15_000 });
        await expect(queueRow(window, "Tone One")).toHaveCount(0);

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

      await test.step("review from the keyboard, choosing the second-best candidate", async () => {
        await queueRow(window, "Tone Two").getByText("Tone Two").click();
        const comparison = window.getByRole("region", { name: "Comparison" });
        await expect(comparison.getByRole("heading", { name: "Tone Two" })).toBeVisible();
        const decide = comparison.getByRole("group", { name: "Decide" });
        // The page opens on the matcher's proposal, the 94.0. Candidates are
        // listed in the order the matcher scored them, which depends on which
        // page its workers fetched first, so the proposal is #1 or #2.
        const proposal = comparison.getByRole("button", { name: /^#\d · 94\.0/ });
        await expect(proposal).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
        const proposed = Number(/#(\d)/.exec(await proposal.innerText())![1]);
        const other = proposed === 1 ? 2 : 1;
        await expect(decide.getByRole("button", { name: `Accept #${proposed}` })).toBeVisible();

        // Focus the queue, not a field: bare keys belong to the review there.
        await queueRow(window, "Tone Two").getByText("Tone Two").click();
        await window.keyboard.press(proposed === 1 ? "ArrowRight" : "ArrowLeft");
        await expect(decide.getByRole("button", { name: `Accept #${other}` })).toBeVisible();
        await expect(
          comparison.getByRole("button", { name: new RegExp(`^#${other} · 91\\.1`) }),
        ).toHaveAttribute("aria-pressed", "true");
        await window.keyboard.press("a");

        // Accepted, it leaves the queue of what needs review.
        await expect(queueRow(window, "Tone Two")).toHaveCount(0, { timeout: 15_000 });
        // And the engine holds the second candidate, the one chosen.
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
      });

      await test.step("apply the chosen candidate's key and BPM", async () => {
        await window.getByRole("combobox", { name: "Show" }).selectOption("accepted");
        await queueRow(window, "Tone Two").getByText("Tone Two").click();
        const comparison = window.getByRole("region", { name: "Comparison" });
        const apply = comparison.getByRole("group", { name: "Apply from the accepted match" });
        await expect(apply).toContainText("E Minor", { timeout: 15_000 });
        await expect(apply).toContainText("125");
        for (const field of ["Genre", "Label", "Year"]) {
          await apply.getByRole("checkbox", { name: new RegExp(`^${field}`) }).uncheck();
        }
        await apply.getByRole("button", { name: "Apply 2 fields" }).click();
        await expect(comparison.getByRole("status")).toContainText(/Applied/, { timeout: 15_000 });
      });

      await test.step("see the applied values in the Library, with their source", async () => {
        await window.getByRole("link", { name: "Library", exact: true }).click();
        const row = libraryRow(window, "Tone Two");
        await expect(row).toContainText("125.0", { timeout: 30_000 });
        await expect(
          row.getByRole("img", { name: /^Key applied from Beatport\. Rekordbox has 8A\./ }),
        ).toBeAttached();
        await expect(
          row.getByRole("img", { name: /^BPM applied from Beatport\. Rekordbox has 124/ }),
        ).toBeAttached();
      });

      await test.step("revert the apply", async () => {
        await libraryRow(window, "Tone Two").getByText("Tone Two").click();
        const inspector = window.locator(".cp-track-detail");
        for (const field of ["key", "BPM"]) {
          await inspector
            .getByRole("button", { name: new RegExp(`^Revert: .*${field}`, "i") })
            .first()
            .click();
        }
        const row = libraryRow(window, "Tone Two");
        await expect(row.getByRole("img")).toHaveCount(0, { timeout: 15_000 });
        await expect(row).toContainText("124.0");
        await expect(row).toContainText("8A");
      });

      await test.step("check files, with one missing", async () => {
        await window.getByRole("link", { name: "Clean", exact: true }).click();
        await window.getByRole("tab", { name: "Missing files" }).click();
        await window.getByRole("button", { name: "Check every file" }).first().click();
        await idle(window);
        const missing = window.getByRole("table", { name: "Missing files" });
        await expect(missing.getByText("Gone")).toBeVisible({ timeout: 15_000 });
        await expect(missing.getByText("Tone One")).toHaveCount(0);
      });

      await test.step("see Health's counts and follow one into the Library", async () => {
        await window.getByRole("tab", { name: "Health" }).click();
        await expect(
          window.getByRole("button", { name: "1 Needs review: open in the Library" }),
        ).toHaveCount(0);
        await window
          .getByRole("button", { name: "1 Missing or unreadable files: open in the Library" })
          .click();
        const table = window.getByRole("table", { name: "Library tracks" });
        await expect(table.getByText("Gone")).toBeVisible({ timeout: 15_000 });
        await expect(table.getByText("Tone One")).toHaveCount(0);
        await window.getByRole("button", { name: "Clear all", exact: true }).click();
        await expect(table.getByText("Tone One")).toBeVisible({ timeout: 15_000 });
      });

      await test.step("preview tags, write them into a copied file, and restore them", async () => {
        const before = readFileSync(library.files[0]!);
        await libraryRow(window, "Tone One").getByText("Tone One").click({ button: "right" });
        await window.getByRole("menu").getByRole("menuitem", { name: "Write tags to files…" }).click();
        const dialog = window.getByRole("dialog", { name: "Write tags to files" });
        await dialog.getByRole("button", { name: "Preview" }).click();
        await expect(dialog.getByRole("region", { name: "Preview" })).toContainText(
          "Writing would change 1 file of 1. Nothing has been written yet.",
          { timeout: 30_000 },
        );
        expect(readFileSync(library.files[0]!).equals(before)).toBe(true);
        await dialog.getByRole("button", { name: "Write 1 file" }).click();
        await expect(dialog.getByRole("region", { name: "Written" })).toContainText("Wrote 1 file.", {
          timeout: 30_000,
        });
        expect(readFileSync(library.files[0]!).includes(Buffer.from("TKEY"))).toBe(true);
        await dialog.getByRole("button", { name: "Restore these files" }).click();
        await expect(dialog).toContainText("Restored 1 file.", { timeout: 30_000 });
        expect(readFileSync(library.files[0]!).includes(Buffer.from("TKEY"))).toBe(false);
        await dialog.getByRole("button", { name: "Done" }).click();
        await idle(window);
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
