/**
 * The Statistics page in the running app (STATS-04).
 *
 * The component tests drive the page against a faked bridge. This drives it against a real
 * engine, through a real preload, for what only that can show: the destination is in the
 * sidebar after Prepare, the three routes answer through the bridge, the three sections draw,
 * and a library imported by this build already has its baseline read, so no "starts at your
 * next refresh" note.
 *
 * Each launch gets its own `--user-data-dir` and `CUEPOINT_HOME`.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

/** An export of three tracks, two of whose files exist. */
function writeExport(dir: string): string {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const tracks = ["Present One", "Present Two", "Gone"].map((name, i) => {
    const file = path.join(music, `${i}.mp3`);
    if (name !== "Gone") writeFileSync(file, "not really audio");
    const location = "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");
    return (
      `<TRACK TrackID="${i + 1}" Name="${name}" Artist="Artist ${i + 1}" ` +
      `Genre="House" Tonality="8A" AverageBpm="124.00" TotalTime="300" Location="${location}"/>`
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
  return xml;
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
  await window.evaluate(
    () => (
      localStorage.setItem("cuepoint-onboarding-complete", "1"),
      localStorage.setItem("cuepoint-phase14-note-seen", "1")
    ),
  );
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
  return window;
}

async function importLibrary(window: Page, xmlPath: string) {
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

test.describe("The Statistics page (STATS-04)", () => {
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

  test("asks for an import before there is a library", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await window.getByRole("link", { name: "Statistics" }).click();
      await expect(window.getByRole("heading", { name: "Statistics", level: 1 })).toBeVisible();
      await expect(window.getByText("There is no library to count yet.")).toBeVisible();
      await window.getByRole("button", { name: "Import a library" }).click();
      await expect(window.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test("follows Prepare in the sidebar and shows its three sections over a real library", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importLibrary(window, writeExport(workspace));

      const links = await window
        .getByRole("navigation", { name: /main navigation/i })
        .getByRole("link")
        .allInnerTexts();
      const names = links.map((text) => text.split("\n")[0]!.trim());
      expect(names.indexOf("Statistics")).toBe(names.indexOf("Prepare") + 1);

      await window.getByRole("link", { name: "Statistics" }).click();
      await expect(window.getByRole("heading", { name: "Statistics", level: 1 })).toBeVisible();
      for (const name of ["Plays", "Your library", "Health"]) {
        await expect(window.getByRole("heading", { name, level: 2 })).toBeVisible({
          timeout: 30_000,
        });
      }
      await expect(window.getByRole("combobox", { name: "Scope" })).toHaveValue("library");
      // The three routes answered through the bridge: each section drew its count.
      await expect(window.getByRole("region", { name: "Your library" })).toContainText("3 tracks", {
        timeout: 30_000,
      });
      await expect(window.getByRole("region", { name: "Health" })).toContainText("files present");
      await expect(window.getByRole("region", { name: "Plays" })).toContainText(
        "with no play count",
      );
      // An import seeds the baseline read (DEC-168), so a library imported by this build has
      // history from the start. The note is for a library imported before it, and the
      // component tests cover it against a plays answer with no `history_from`.
      await expect(window.getByText("Play history starts at your next refresh")).toHaveCount(0);
    } finally {
      await app.close();
    }
  });
});

/**
 * Four tracks: three at 124 BPM and one at 128. Warmup holds tracks 2 and 3. The user's own
 * keys (the Keys page counts these, never the export's tonality): 8A on tracks 1 and 2.
 */
function writeSpreadExport(dir: string): string {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const tempos = ["124.00", "124.00", "124.00", "128.00"];
  const tracks = tempos.map((bpm, i) => {
    const file = path.join(music, `${i}.mp3`);
    writeFileSync(file, "not really audio");
    const location = "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");
    return (
      `<TRACK TrackID="${i + 1}" Name="Spread ${i + 1}" Artist="Artist ${i + 1}" ` +
      `Genre="House" AverageBpm="${bpm}" TotalTime="300" Location="${location}"/>`
    );
  });
  const xml = path.join(dir, "spread.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="4">
${tracks.join("\n")}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0">
    <NODE Name="Warmup" Type="1" Entries="2"><TRACK Key="2"/><TRACK Key="3"/></NODE>
  </NODE></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return xml;
}

test.describe("The Your library section (STATS-06)", () => {
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

  test("opens the Library on a tempo bar and Keys on the scope, with the same counts", async () => {
    test.setTimeout(240_000);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importLibrary(window, writeSpreadExport(workspace));
      await window.evaluate(async () => {
        const c = window.cuepoint!;
        const found = await c.browseLibrary!({ limit: 50 });
        for (const track of found.tracks) {
          if (track.title === "Spread 1" || track.title === "Spread 2") {
            await c.setTrackOverrides!({ trackId: track.id, key: "8A" });
          }
        }
      });

      await window.getByRole("link", { name: "Statistics" }).click();
      const library = window.getByRole("region", { name: "Your library" });
      const tempo = library.locator('[data-panel="tempo"]');

      // The whole library: 2 of 4 tracks have a key.
      await expect(library).toContainText(
        "2 of 4 tracks have a Beatport key · most common 8A (2) · No Beatport key: 2",
        { timeout: 30_000 },
      );

      // A tempo bar opens the Library with the count the bar carries.
      await tempo.getByRole("button", { name: "124 BPM, 3 tracks" }).click();
      await expect(window.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
      // The header counts the whole library; the table is the filtered tracks.
      await expect(window.locator(".track-table__row")).toHaveCount(3, { timeout: 30_000 });
      await expect(window.getByText("BPM is at least 123.5")).toBeVisible();

      // Narrow to the Warmup playlist and open Keys: the same counts, the playlist ticked.
      await window.getByRole("link", { name: "Statistics" }).click();
      await window.getByRole("combobox", { name: "Scope" }).selectOption({ label: "Warmup" });
      const section = window.getByRole("region", { name: "Your library" });
      await expect(section).toContainText(
        "1 of 2 tracks have a Beatport key · most common 8A (1) · No Beatport key: 1",
        { timeout: 30_000 },
      );
      await section.getByRole("button", { name: "Open in Keys" }).click();
      await expect(window.getByRole("heading", { name: "Keys", level: 1 })).toBeVisible();
      await expect(
        window.getByRole("group", { name: "Sources" }).getByRole("checkbox", { name: "Warmup" }),
      ).toBeChecked({ timeout: 30_000 });
      await expect(window.getByRole("status").filter({ hasText: "in 1 playlist" })).toHaveText(
        "2 tracks in 1 playlist",
        { timeout: 30_000 },
      );
      await expect(window.getByText("No Beatport key: 1")).toBeVisible();
      await expect(window.locator(".keys-page__wheel strong")).toHaveText("1");
    } finally {
      await app.close();
    }
  });
});
