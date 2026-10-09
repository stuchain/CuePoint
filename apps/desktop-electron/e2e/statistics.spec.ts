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
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
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
      await expect(window.getByRole("region", { name: "Health" })).toContainText("Present, 2 tracks");
      await expect(window.getByRole("region", { name: "Plays" })).toContainText(
        "Plays unknown: 3",
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

/** An export of four tracks whose files do not exist, each with the given play count. */
function writePlayExport(dir: string, counts: number[], name: string): string {
  const tracks = counts.map(
    (plays, i) =>
      `<TRACK TrackID="${i + 1}" Name="Track ${i + 1}" Artist="Artist ${i + 1}" Genre="House" ` +
      `Tonality="8A" AverageBpm="124.00" TotalTime="300" PlayCount="${plays}" ` +
      `Location="file://localhost/m/${i + 1}.mp3"/>`,
  );
  const file = path.join(dir, name);
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${counts.length}">
${tracks.join("\n")}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0"/></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  // A rewrite inside the filesystem's timestamp granularity can keep the same mtime.
  const stat = statSync(file);
  utimesSync(file, stat.atime.getTime() / 1000 + 5, stat.mtime.getTime() / 1000 + 5);
  return file;
}

/** Preview a refresh from an export and apply it, as the Library's own flow does. */
async function refreshLibrary(window: Page, xmlPath: string) {
  const settle = async (jobId: string) => {
    await expect
      .poll(
        async () => (await window.evaluate((id) => window.cuepoint!.getJob!(id), jobId))!.state,
        { timeout: 90_000 },
      )
      .toMatch(/succeeded|failed|cancelled/);
    return (await window.evaluate((id) => window.cuepoint!.getJob!(id), jobId))!.state;
  };
  const preview = await window.evaluate(
    (file) => window.cuepoint!.startLibraryRefreshPreview!({ xml_path: file }),
    xmlPath,
  );
  expect(await settle(preview.job_id)).toBe("succeeded");
  const previewed = await window.evaluate(
    (id) => window.cuepoint!.getJobResults!(id),
    preview.job_id,
  );
  const applied = await window.evaluate(
    (id) => window.cuepoint!.startLibraryRefreshApply!({ diff_id: id }),
    (previewed.result as { diff_id: string }).diff_id,
  );
  expect(await settle(applied.job_id)).toBe("succeeded");
}

test.describe("The Plays section (STATS-05)", () => {
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

  test("ranks what was played since the import and keeps the list as a Collection", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importLibrary(window, writePlayExport(workspace, [5, 3, 1, 0], "first.xml"));
      // Track 2 gained 6 plays, track 4 gained 4, track 1 gained 1, track 3 none.
      await refreshLibrary(window, writePlayExport(workspace, [6, 9, 1, 4], "second.xml"));

      await window.getByRole("link", { name: "Statistics" }).click();
      const plays = window.getByRole("region", { name: "Plays" });
      const list = plays.getByRole("list", { name: "Most played" });
      await expect(list).toBeVisible({ timeout: 30_000 });

      // All time: the counts Rekordbox holds now.
      await expect(
        list.getByRole("button", { name: "1. Track 2 by Artist 2, 9 plays" }),
      ).toBeVisible();
      await expect(plays.getByText(/^Counts from your refresh on /)).toBeVisible();

      // Since the first import (the refresh's own rises), in their own order.
      await plays.getByLabel("Since").selectOption({ label: "Your last refresh" });
      await expect(list.getByRole("listitem")).toHaveCount(3, { timeout: 30_000 });
      await expect(
        list.getByRole("button", { name: "1. Track 2 by Artist 2, 6 plays" }),
      ).toBeVisible();
      await expect(
        list.getByRole("button", { name: "2. Track 4 by Artist 4, 4 plays" }),
      ).toBeVisible();
      await expect(
        list.getByRole("button", { name: "3. Track 1 by Artist 1, 1 play" }),
      ).toBeVisible();

      // Keep it as a Collection, and it says where it went.
      await plays.getByRole("button", { name: "Keep as Collection" }).click();
      await expect(plays.getByText(/Kept 3 tracks in rank order as/)).toBeVisible({
        timeout: 30_000,
      });

      // Open it in the Library: the same tracks, in the same order.
      await window.getByRole("link", { name: "Library" }).click();
      const tree = window.getByRole("tree", { name: "Collections" });
      await tree.getByText(/^Most played since /).click();
      await expect(window.locator(".library-toolbar__count")).toContainText("3 tracks", {
        timeout: 30_000,
      });
      await expect
        .poll(
          async () =>
            window.evaluate(() =>
              [
                ...document.querySelectorAll('[role="row"][data-index] [data-column="title"]'),
              ].map((cell) => cell.textContent?.trim() ?? ""),
            ),
          { timeout: 30_000 },
        )
        .toEqual(["Track 2", "Track 4", "Track 1"]);
    } finally {
      await app.close();
    }
  });
});

test.describe("The Health section and the whole page (STATS-07)", () => {
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

  test("import, refresh with changed plays, every section, and one click from each into the Library", async () => {
    test.setTimeout(300_000);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importLibrary(window, writePlayExport(workspace, [5, 3, 1, 0], "first.xml"));
      await refreshLibrary(window, writePlayExport(workspace, [6, 9, 1, 4], "second.xml"));

      await window.getByRole("link", { name: "Statistics" }).click();
      for (const name of ["Plays", "Your library", "Health"]) {
        await expect(window.getByRole("heading", { name, level: 2 })).toBeVisible({
          timeout: 30_000,
        });
      }
      const plays = window.getByRole("region", { name: "Plays" });
      const library = window.getByRole("region", { name: "Your library" });
      const health = window.getByRole("region", { name: "Health" });
      await expect(plays.getByRole("list", { name: "Most played" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(library.locator('[data-panel="genre"]')).toBeVisible({ timeout: 30_000 });
      for (const group of ["Files", "Beatport", "Waveforms"]) {
        await expect(health.getByRole("heading", { name: group, level: 3 })).toBeVisible({
          timeout: 30_000,
        });
      }
      for (const name of ["Check files", "Match", "Analyze", "All health checks"]) {
        await expect(health.getByRole("button", { name, exact: true })).toBeVisible();
      }

      const rows = window.locator(".track-table__row");
      const libraryHeading = window.getByRole("heading", { name: "Library", level: 1 });

      // Plays: the top artist opens that artist's one track.
      await plays.getByRole("button", { name: /^1\. Artist 2, 9 plays, 1 track$/ }).click();
      await expect(libraryHeading).toBeVisible();
      await expect(rows).toHaveCount(1, { timeout: 30_000 });
      await expect(rows).toContainText("Track 2");

      // Your library: the House bar opens all four tracks.
      await window.getByRole("link", { name: "Statistics" }).click();
      await library
        .locator('[data-panel="genre"]')
        .getByRole("button", { name: "House, 4 tracks" })
        .click({ timeout: 30_000 });
      await expect(libraryHeading).toBeVisible();
      await expect(rows).toHaveCount(4, { timeout: 30_000 });

      // Health: a files bar opens the tracks the engine counted for it.
      await window.getByRole("link", { name: "Statistics" }).click();
      const counted = await window.evaluate(async () => {
        const answer = await window.cuepoint!.getStatisticsHealth!({ scope: "library" });
        return { missing: answer.files.missing.count, notChecked: answer.files.not_checked.count };
      });
      const [label, expected] =
        counted.missing > 0
          ? (["Missing", counted.missing] as const)
          : (["Not checked", counted.notChecked] as const);
      expect(expected).toBeGreaterThan(0);
      await health
        .locator('[data-panel="files"]')
        .getByRole("button", { name: `${label}, ${expected} ${expected === 1 ? "track" : "tracks"}` })
        .click({ timeout: 30_000 });
      await expect(libraryHeading).toBeVisible();
      await expect(rows).toHaveCount(expected, { timeout: 30_000 });
    } finally {
      await app.close();
    }
  });

  test("opens Clean's Health tab from All health checks", async () => {
    test.setTimeout(240_000);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importLibrary(window, writeExport(workspace));
      await window.getByRole("link", { name: "Statistics" }).click();
      const health = window.getByRole("region", { name: "Health" });
      await health.getByRole("button", { name: "All health checks" }).click({ timeout: 30_000 });
      await expect(window.getByRole("heading", { name: "Clean", level: 1 })).toBeVisible();
      await expect(window.getByRole("tab", { name: /Health/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    } finally {
      await app.close();
    }
  });
});
