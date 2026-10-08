/**
 * What inCrate left behind is left alone (DISCOVER-12, Phase 9 acceptance 12).
 *
 * inCrate retired, and its code went with it, but its files are user data
 * (fact 6): the inventory database and `incrate_past_results.json` stay where
 * they were, and nothing reads, moves or deletes them. `test_retired_incrate.py`
 * holds that against an engine in the test process. This holds it where it
 * matters — the real app and the engine it starts, in a packaged build with
 * `CUEPOINT_E2E_EXECUTABLE` — over a whole session: a library imported, every
 * Discover read made, inCrate's old address followed, and the app quit.
 *
 * The files are put where a real install has them. The engine is headless, so
 * it resolves those folders from the environment — `APPDATA` and
 * `LOCALAPPDATA` on Windows, `HOME` elsewhere — which is what lets the test
 * give it a sandbox rather than the developer's own profile. The configuration
 * file keeps every `incrate.` key, including the five nothing reads, and must
 * load and stay as it was too: CuePoint does not edit it to remove them
 * (DEC-098).
 *
 * No Beatport token is set, so nothing asks Beatport; a developer's own is
 * removed from the launch environment.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

/** A fixed, long-past time, so any write would show in the file's times. */
const LONG_AGO = new Date("2020-09-13T12:26:40Z");

interface Leftovers {
  /** The environment that points the app and its engine at the sandbox. */
  env: Record<string, string>;
  inventory: string;
  pastResults: string;
}

/**
 * Where inCrate kept its files, inside `root`, as its own code resolved them
 * (`default_inventory_db_path` and `past_results_storage`, before DISCOVER-12).
 */
function leftoversUnder(root: string): Leftovers {
  if (process.platform === "win32") {
    const roaming = path.join(root, "Roaming");
    const local = path.join(root, "Local");
    return {
      env: { APPDATA: roaming, LOCALAPPDATA: local },
      inventory: path.join(roaming, "CuePoint", "incrate", "inventory.sqlite"),
      pastResults: path.join(local, "CuePoint", "incrate_past_results.json"),
    };
  }
  if (process.platform === "darwin") {
    const support = path.join(root, "Library", "Application Support", "CuePoint");
    return {
      env: { HOME: root },
      inventory: path.join(support, "incrate", "inventory.sqlite"),
      pastResults: path.join(support, "incrate_past_results.json"),
    };
  }
  const share = path.join(root, ".local", "share", "CuePoint");
  return {
    env: { HOME: root },
    inventory: path.join(share, "incrate", "inventory.sqlite"),
    pastResults: path.join(share, "incrate_past_results.json"),
  };
}

function seed(file: string, content: string | Buffer) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  utimesSync(file, LONG_AGO, LONG_AGO);
}

/** A file's bytes and last-modified time, to compare before and after. */
function snapshot(file: string): { bytes: string; mtimeMs: number } {
  return { bytes: readFileSync(file).toString("base64"), mtimeMs: statSync(file).mtimeMs };
}

function writeExport(dir: string): string {
  const xml = path.join(dir, "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="2">
<TRACK TrackID="1" Name="Harbour Walk" Artist="Mara Veil" Label="Nightfall Audio" Genre="House" Tonality="8A" AverageBpm="122.00" TotalTime="300" Location="file://localhost/music/1.mp3"/>
<TRACK TrackID="2" Name="Low Tide" Artist="Mara Veil" Label="Nightfall Audio" Genre="House" Tonality="9A" AverageBpm="124.00" TotalTime="300" Location="file://localhost/music/2.mp3"/>
  </COLLECTION>
  <PLAYLISTS><NODE Type="0" Name="ROOT" Count="0"/></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return xml;
}

function launch(
  userDataDir: string,
  cuepointHome: string,
  sandbox: Record<string, string>,
): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    ...sandbox,
    NODE_ENV: "production",
    CUEPOINT_HOME: cuepointHome,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.BEATPORT_ACCESS_TOKEN;
  delete env.CUEPOINT_BEATPORT_FIXTURE;
  // On Linux the inventory followed XDG_DATA_HOME when it was set; the sandbox
  // is HOME's default instead.
  delete env.XDG_DATA_HOME;
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
  await waitForEngine(window);
  return window;
}

async function idle(window: Page) {
  await expect
    .poll(
      async () =>
        (await window.evaluate(() => window.cuepoint!.listJobs!({ state: "active" }))).active_count,
      { timeout: 90_000 },
    )
    .toBe(0);
}

test.describe("What inCrate left behind (DISCOVER-12)", () => {
  let userDataDir: string;
  let cuepointHome: string;
  let dataRoot: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    dataRoot = mkdtempSync(path.join(tmpdir(), "cuepoint-data-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-xml-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, dataRoot, workspace]) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the inventory, the past results and the old settings are left as they were", async () => {
    test.setTimeout(240_000);
    const leftovers = leftoversUnder(dataRoot);
    // What inCrate wrote: a SQLite file, its past runs, and its settings —
    // the retired ones included, and the inventory's path among them.
    seed(leftovers.inventory, Buffer.concat([Buffer.from("SQLite format 3\0"), Buffer.alloc(4080, 7)]));
    seed(
      leftovers.pastResults,
      JSON.stringify({ runs: [{ run_id: "kept", tracks: [{ beatport_track_id: 1 }] }] }),
    );
    const config = path.join(cuepointHome, "config.yaml");
    seed(
      config,
      [
        "incrate:",
        `  inventory_db_path: ${JSON.stringify(leftovers.inventory)}`,
        "  enrich_on_first_import: true",
        "  enrichment_delay_seconds: 0.5",
        "  new_releases_days: 14",
        "  playlist_name_format: iso",
        "  beatport_username: someone",
        "  beatport_password: not-a-real-password",
        "",
      ].join("\n"),
    );
    const before = {
      inventory: snapshot(leftovers.inventory),
      pastResults: snapshot(leftovers.pastResults),
      config: snapshot(config),
    };

    const app = await launch(userDataDir, cuepointHome, leftovers.env);
    try {
      const window = await ready(app);

      // A library, imported, and everything that follows an import.
      const started = await window.evaluate(
        (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
        writeExport(workspace),
      );
      await expect
        .poll(
          async () => (await window.evaluate((id) => window.cuepoint!.getJob(id), started.job_id)).state,
          { timeout: 60_000 },
        )
        .toBe("succeeded");
      await idle(window);

      // Every Discover read, and the settings the engine loads from the file.
      const answers = await window.evaluate(async () => {
        const bridge = window.cuepoint!;
        const summary = await bridge.getLibrarySummary!();
        const options = await bridge.getDiscoverOptions!();
        const runs = await bridge.listDiscoveryRuns!({ limit: 10, offset: 0 });
        const wantlist = await bridge.getWantlist!({});
        const page = await bridge.getEntityPage!({ kind: "artist", ref: "name:mara veil" });
        const found = await bridge.browseLibrary!({ q: "Harbour Walk", limit: 1 });
        const similar = await bridge.getSimilarTracks!({ track_id: found.tracks[0]!.id! });
        const token = await bridge.getBeatportTokenStatus();
        return { summary, options, runs, wantlist, page, similar, token };
      });
      expect(answers.summary.track_count).toBe(2);
      // The settings loaded: Discover's release window is the file's 14 days.
      expect(answers.options.refusal).toBeNull();
      expect(answers.options.value!.defaults.new_releases_days).toBe(14);
      // And a pushed playlist is named in the file's ISO format.
      expect(answers.options.value!.defaults.playlist_name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(answers.options.value!.beatport.state).toBe("no_token");
      expect(answers.runs.refusal).toBeNull();
      expect(answers.wantlist.refusal).toBeNull();
      expect(answers.page.value!.library.tracks).toBe(2);
      expect(answers.similar.refusal).toBeNull();
      expect(answers.token.configured).toBe(false);

      // inCrate's old address, and the pages it lands on.
      await window.evaluate(() => {
        window.location.hash = "#/incrate";
      });
      await expect(window).toHaveURL(/#\/discover$/, { timeout: 15_000 });
      await expect(window.getByText("Beatport is not connected")).toBeVisible({ timeout: 30_000 });
      await window.getByRole("link", { name: "Settings" }).click();
      await expect(window.locator("#settings-beatport-token")).toBeVisible({ timeout: 15_000 });
      await idle(window);
    } finally {
      // Quitting stops the engine, so nothing it holds is still open below.
      await app.close();
    }

    expect(snapshot(leftovers.inventory)).toEqual(before.inventory);
    expect(snapshot(leftovers.pastResults)).toEqual(before.pastResults);
    expect(snapshot(config)).toEqual(before.config);
    // Not opened for writing either: SQLite would leave a journal beside it.
    expect(readdirSync(path.dirname(leftovers.inventory))).toEqual(["inventory.sqlite"]);
    expect(
      readdirSync(path.dirname(leftovers.pastResults)).filter((name) => name.startsWith("incrate_")),
    ).toEqual(["incrate_past_results.json"]);
  });
});
