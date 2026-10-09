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
