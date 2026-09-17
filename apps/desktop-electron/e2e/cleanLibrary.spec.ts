/**
 * Clean in the Library and the Inspector, in the running app (CLEAN-13).
 *
 * The component tests drive every control over a faked bridge. This drives
 * them against a real engine, a real preload and real files, for what only
 * that can show: a typed value reaches the table marked with its source and is
 * reverted from History; a batch edit is reverted from Activity; tags are
 * previewed, written into a real MP3 and restored; and the Clean columns and
 * filters read what the engine really sends.
 *
 * Nothing here matches, so Beatport is never reached. Each launch gets its own
 * `--user-data-dir` and `CUEPOINT_HOME`, and the audio is a copy of the
 * repository's fixture.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const TONE = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio", "tone.mp3");

/** The Python the development engine runs on, found the way the supervisor finds it. */
function python(): string {
  if (process.env.CUEPOINT_PYTHON) return process.env.CUEPOINT_PYTHON;
  const local =
    process.platform === "win32"
      ? path.join(REPO_ROOT, ".venv", "Scripts", "python.exe")
      : path.join(REPO_ROOT, ".venv", "bin", "python");
  if (existsSync(local)) return local;
  return process.platform === "win32" ? "python" : "python3";
}

/**
 * Store an answered match for the first track, as the matcher would have,
 * through the engine's own repository: Beatport is never asked.
 */
const SEED_MATCH = `
from cuepoint.models.beatport_candidate import BeatportCandidate
from cuepoint.models.result import TrackResult
from cuepoint.models.track import Track
from cuepoint.services import interfaces
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.utils.di_container import get_container

bootstrap_services()
container = get_container()
tracks = container.resolve(interfaces.ITrackRepository)
track = next(t for t in tracks.list_all() if t.title == "Tone One")
def candidate(number, score, winner, **values):
    fields = dict(url=f"https://www.beatport.com/track/tone/{number}", title="Tone One",
        artists=track.artist, label="Afterlife", release_date="2021-03-01", bpm=122.0,
        key="A Minor", genre="Melodic House & Techno", score=score, title_sim=95,
        artist_sim=95, query_index=1, query_text="q", candidate_index=1, base_score=score,
        bonus_year=0, bonus_key=0, guard_ok=True, reject_reason="", elapsed_ms=1,
        is_winner=winner, release_year=2021, release_name="A Release")
    fields.update(values)
    return BeatportCandidate(**fields)
best = candidate(1, 97.0, True)
result = TrackResult(playlist_index=1, title=track.title, artist=track.artist, matched=True,
    best_match=best, candidates=[best, candidate(2, 60.0, False, title="Tone One (Extended Mix)")],
    match_score=97.0)
stored = container.resolve(interfaces.IMatchRepository).add_attempt(
    track.id, "e2e", result, Track(title=track.title, artist=track.artist))
container.resolve(interfaces.IMatchStateService).apply_attempt(stored)
`;

function seedMatch(cuepointHome: string) {
  execFileSync(python(), ["-c", SEED_MATCH], {
    env: { ...process.env, CUEPOINT_HOME: cuepointHome, PYTHONPATH: path.join(REPO_ROOT, "src") },
    stdio: "inherit",
  });
}

/** Two real MP3s and one path with nothing at it. */
function writeExport(dir: string): { xml: string; files: string[] } {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const names = ["Tone One", "Tone Two", "Gone"];
  const files: string[] = [];
  const tracks = names.map((name, i) => {
    const file = path.join(music, `${i}.mp3`);
    if (name !== "Gone") copyFileSync(TONE, file);
    files.push(file);
    const location = "file://localhost/" + file.replace(/\\/g, "/");
    return (
      `<TRACK TrackID="${i + 1}" Name="${name}" Artist="Artist ${i + 1}" ` +
      `Genre="House" Tonality="8A" AverageBpm="124.00" Year="2020" TotalTime="1" Location="${location}"/>`
    );
  });
  const xml = path.join(dir, "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="3">
${tracks.join("\n")}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0"/></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return { xml, files };
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
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

async function importAndCheck(window: Page, xmlPath: string) {
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
  // The file check follows the import on its own (CLEAN-07); a write needs it.
  await expect
    .poll(
      async () => {
        const health = await window.evaluate(() => window.cuepoint!.getLibraryHealth!());
        return health.counts.find((count) => count.id === "missing_files")?.count;
      },
      { timeout: 60_000 },
    )
    .toBe(1);
  // And nothing else may hold the files when a write starts.
  await expect
    .poll(
      async () =>
        (await window.evaluate(() => window.cuepoint!.listJobs!({ state: "active" }))).active_count,
      { timeout: 60_000 },
    )
    .toBe(0);
}

function row(window: Page, title: string) {
  return window.getByRole("table", { name: "Library tracks" }).getByRole("row").filter({ hasText: title });
}

test.describe("Clean in the Library (CLEAN-13)", () => {
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

  test("a typed value is marked in the table and reverted from History", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importAndCheck(window, writeExport(workspace).xml);
      await window.getByRole("link", { name: "Library" }).click();
      await row(window, "Tone One").getByText("Tone One").click();

      const inspector = window.locator(".cp-track-detail");
      const key = inspector.getByLabel("Your key", { exact: true });
      await expect(key).toHaveAttribute("placeholder", "Rekordbox: 8A");
      await key.fill("11A");
      await key.press("Enter");

      // The table shows the typed value, marked, and says where it came from.
      const mark = row(window, "Tone One").getByRole("img", { name: /^Key typed by you\. Rekordbox has 8A\./ });
      await expect(mark).toBeVisible({ timeout: 15_000 });
      await expect(row(window, "Tone One")).toContainText("11A");
      await expect(inspector.locator('[data-field="key"]')).toContainText("Now 11A (typed by you)");

      // The engine refuses a BPM it cannot hold, in its own words.
      const bpm = inspector.getByLabel("Your BPM", { exact: true });
      await bpm.fill("400");
      await bpm.press("Enter");
      // In the engine's words, not wrapped in Electron's.
      await expect(inspector.getByRole("alert")).toHaveText(/^bpm must be between 20 and 300/);

      // Reverted from History, the imported value shows again, unmarked.
      await inspector.getByRole("button", { name: /^Revert: Your key/ }).click();
      await expect(row(window, "Tone One").getByRole("img")).toHaveCount(0, { timeout: 15_000 });
      await expect(row(window, "Tone One")).toContainText("8A");
      await expect(key).toHaveValue("");
    } finally {
      await app.close();
    }
  });

  test("a batch edit is reverted from Activity, and Clean columns and filters read the engine", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importAndCheck(window, writeExport(workspace).xml);
      await window.getByRole("link", { name: "Library" }).click();
      await expect(row(window, "Tone Two")).toBeVisible({ timeout: 30_000 });

      await window.getByRole("button", { name: "Select all" }).click();
      await window.getByRole("button", { name: "Actions…" }).click();
      const menu = window.getByRole("menu");
      for (const entry of ["Match on Beatport", "Accept match", "Edit metadata…", "Write tags to files…"]) {
        await expect(menu.getByRole("menuitem", { name: entry, exact: true })).toBeVisible();
      }
      await menu.getByRole("menuitem", { name: "Edit metadata…" }).click();
      const dialog = window.getByRole("dialog", { name: "Edit metadata" });
      await dialog.getByRole("textbox", { name: "BPM value" }).fill("126");
      await dialog.getByRole("button", { name: "Apply" }).click();
      await expect(window.getByText(/Set the BPM to 126 on 3 tracks/)).toBeVisible({ timeout: 15_000 });
      await expect(row(window, "Tone Two")).toContainText("126.0");

      // Reverted as one, from the batch's own entry.
      await window.keyboard.press("Control+Shift+A");
      const activity = window.getByRole("dialog", { name: "Activity" });
      // The batch's own entry; its revert is recorded as another, which names it.
      const entry = activity
        .getByRole("listitem")
        .filter({ hasText: /Set the BPM to 126(\.0)? on 3 tracks/ })
        .filter({ hasNotText: "changes of" });
      await entry.getByRole("button", { name: "Revert this batch" }).click();
      await entry.getByRole("button", { name: "Revert", exact: true }).click();
      await expect(entry).toContainText("Reverted 3 changes.", { timeout: 15_000 });
      await window.keyboard.press("Escape");
      await expect(activity).toHaveCount(0);
      await expect(row(window, "Tone Two")).toContainText("124.0", { timeout: 15_000 });
      await expect(row(window, "Tone Two").getByRole("img")).toHaveCount(0);

      // The Clean columns, as the engine answers them.
      await window.getByRole("button", { name: "Columns…" }).click();
      const picker = window.getByRole("dialog");
      await picker.getByRole("checkbox", { name: "Match" }).check();
      await picker.getByRole("checkbox", { name: "File status" }).check();
      await window.keyboard.press("Escape");
      await expect(row(window, "Gone")).toContainText("Missing");
      await expect(row(window, "Tone One")).toContainText("Present");
      await expect(row(window, "Tone One")).toContainText("Not matched");

      // A fixed-value field is a choice, and its chip reads the name.
      await window.getByRole("button", { name: "Add filter" }).click();
      await window.getByRole("combobox", { name: "Field" }).selectOption({ label: "File status" });
      await window.getByRole("combobox", { name: "File status" }).selectOption({ label: "Missing" });
      await window.getByRole("button", { name: "Add", exact: true }).click();
      await expect(window.getByText("File status is Missing")).toBeVisible();
      await expect(row(window, "Gone")).toBeVisible();
      await expect(row(window, "Tone One")).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test("tags are previewed, written into a real file, and restored", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      const { xml, files } = writeExport(workspace);
      await importAndCheck(window, xml);
      const before = readFileSync(files[0]!);
      await window.getByRole("link", { name: "Library" }).click();
      await row(window, "Tone One").getByText("Tone One").click({ button: "right" });
      await window.getByRole("menu").getByRole("menuitem", { name: "Write tags to files…" }).click();

      const dialog = window.getByRole("dialog", { name: "Write tags to files" });
      // Nothing can be written before a preview has answered.
      await expect(dialog.getByRole("button", { name: /^Write/ })).toHaveCount(0);
      await dialog.getByRole("button", { name: "Preview" }).click();
      const preview = dialog.getByRole("region", { name: "Preview" });
      await expect(preview).toContainText("Writing would change 1 file of 1. Nothing has been written yet.", {
        timeout: 30_000,
      });
      expect(readFileSync(files[0]!).equals(before)).toBe(true);

      await dialog.getByRole("button", { name: "Write 1 file" }).click();
      const written = dialog.getByRole("region", { name: "Written" });
      await expect(written).toContainText("Wrote 1 file.", { timeout: 30_000 });
      await expect(written).toContainText("Reload Tag");
      expect(readFileSync(files[0]!).includes(Buffer.from("TKEY"))).toBe(true);

      await dialog.getByRole("button", { name: "Done" }).click();

      // The write's Activity entry offers Restore, and it puts the values back.
      await window.keyboard.press("Control+Shift+A");
      const activity = window.getByRole("dialog", { name: "Activity" });
      const entry = activity.getByRole("listitem").filter({ hasText: "Wrote tags to 1 file" });
      await expect(entry).toContainText("can be restored", { timeout: 15_000 });
      await entry.getByRole("button", { name: "Restore" }).click();
      await entry.getByRole("button", { name: "Restore" }).click();
      await expect(entry).toContainText("Restored 1 file.", { timeout: 30_000 });
      await expect(entry).toContainText("Everything written here has been restored.");
      expect(readFileSync(files[0]!).includes(Buffer.from("TKEY"))).toBe(false);

      const record = await window.evaluate(async () => {
        const detail = await window.cuepoint!.browseLibrary!({ q: "Tone One", limit: 1 });
        return window.cuepoint!.getTagWrites!({ trackId: detail.tracks[0]!.id!, limit: 1 });
      });
      expect(record.restorable).toBe(0);
      expect(record.unconfirmed).toBe(0);
    } finally {
      await app.close();
    }
  });

  test("the Beatport zone applies a field, and opens the track on the Clean page", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importAndCheck(window, writeExport(workspace).xml);
      seedMatch(cuepointHome);
      await window.getByRole("link", { name: "Library" }).click();
      await row(window, "Tone One").getByText("Tone One").click();

      const zone = window.getByRole("region", { name: "Beatport" });
      await expect(zone).toContainText("Accepted automatically", { timeout: 15_000 });
      const genre = zone.locator('[data-field="genre"]');
      await expect(genre).toContainText("Rekordbox House");
      await expect(genre).toContainText("Beatport Melodic House & Techno");
      await expect(genre).toContainText("Now House (from Rekordbox)");

      await zone.getByRole("button", { name: "Apply Beatport's Genre" }).click();
      await expect(genre).toContainText("Now Melodic House & Techno (applied from Beatport)", {
        timeout: 15_000,
      });
      await expect(
        row(window, "Tone One").getByRole("img", { name: /^Genre applied from Beatport\. Rekordbox has House\./ }),
      ).toBeAttached();

      await zone.getByRole("button", { name: "Open on the Clean page" }).click();
      const comparison = window.getByRole("region", { name: "Comparison" });
      await expect(comparison.getByRole("heading", { name: "Tone One" })).toBeVisible({ timeout: 15_000 });
      await expect(window.getByRole("combobox", { name: "Show" })).toHaveValue("accepted");

      // With the comparison and the Inspector both full, the window itself
      // never scrolls: each part scrolls on its own.
      const page = await window.evaluate(() => ({
        scroll: document.scrollingElement!.scrollHeight,
        height: document.scrollingElement!.clientHeight,
      }));
      expect(page.scroll).toBeLessThanOrEqual(page.height);
    } finally {
      await app.close();
    }
  });
});
