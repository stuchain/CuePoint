/**
 * The waveform analysis in the running app (WAVE-03).
 *
 * The engine's tests prove the job with a stand-in decoder, and its binary
 * tests with a real one. This proves the whole path a user meets: Electron
 * names the bundled `mpv` to the engine, an import is followed by the file
 * check and then, without a click, by the analysis; the status strip counts it
 * and its Pause pauses it; a relaunch keeps it paused without losing what it
 * did; and Clean → Health resumes it to the end, a broken file counted as
 * unreadable rather than retried.
 *
 * The library is copies of the shipped fixtures, enough of them that the run
 * lasts long enough to be watched. Skips where no `mpv` was fetched; desktop CI
 * fetches it on Windows and macOS.
 *
 * Each launch gets its own `--user-data-dir` and `CUEPOINT_HOME`.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { copyFileSync, linkSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePlayerBinary } from "../electron/playerLaunch";
import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "../..");
const FIXTURES = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio");
const FORMATS = ["tone.wav", "tone.flac", "tone.aiff", "tone.m4a", "tone.mp3", "bands.flac"];

/** Copies of the fixtures: enough that the run is still going when the strip is read. */
const COPIES = 300;
/** Copies, plus one file that is text with an audio extension. */
const PRESENT = COPIES + 1;

const hasDecoder = Boolean(
  resolvePlayerBinary({ packaged: false, repoRoot: REPO_ROOT, env: process.env }),
);

function link(source: string, dest: string): void {
  try {
    linkSync(source, dest);
  } catch {
    copyFileSync(source, dest);
  }
}

function writeExport(dir: string): string {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const files: { name: string; file: string }[] = [];
  for (let i = 0; i < COPIES; i += 1) {
    const format = FORMATS[i % FORMATS.length]!;
    const file = path.join(music, `${String(i).padStart(3, "0")}-${format}`);
    link(path.join(FIXTURES, format), file);
    files.push({ name: `Copy ${i}`, file });
  }
  const broken = path.join(music, "broken.mp3");
  writeFileSync(broken, "this is text, not audio\n".repeat(200));
  files.push({ name: "Broken", file: broken });

  const tracks = files.map(({ name, file }, i) => {
    const location = "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");
    return `<TRACK TrackID="${i + 1}" Name="${name}" Artist="Artist" Location="${location}"/>`;
  });
  const xml = path.join(dir, "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${tracks.length}">
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
  await window.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
  return window;
}

function analysis(window: Page) {
  return window.evaluate(async () => (await window.cuepoint!.waveforms!.analysis()).value!);
}

async function healthRow(window: Page) {
  await window.getByRole("link", { name: "Clean" }).click();
  await window.getByRole("tab", { name: "Health" }).click();
  return window.getByRole("list", { name: "Checks" }).getByRole("listitem").filter({
    hasText: "Waveforms analysed",
  });
}

test.describe("The waveform analysis (WAVE-03)", () => {
  test.skip(!hasDecoder, "no mpv: run `python scripts/fetch_player_sidecar.py`");

  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-audio-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("follows an import, pauses from the strip, stays paused, and resumes to the end", async () => {
    test.setTimeout(240_000);
    const xml = writeExport(workspace);

    let app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await window.evaluate(
        (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
        xml,
      );

      // No click: the import, then the file check, then the analysis, which
      // the strip counts through the library.
      const strip = window.locator(".cp-status__job-label");
      await expect(strip).toContainText(/Analyzing waveforms · [\d,]+ of 301/, { timeout: 90_000 });
      const pause = window.getByRole("button", { name: /^Pause analyzing waveforms/ });
      await expect(pause).toBeVisible();
      await pause.click();

      await expect
        .poll(async () => (await analysis(window)).state, { timeout: 30_000 })
        .toBe("paused");
      await expect(strip).toHaveCount(0, { timeout: 30_000 });
      const paused = await analysis(window);
      expect(paused.paused).toBe(true);
      expect(paused.present).toBe(PRESENT);
      expect(paused.remaining).toBeGreaterThan(0);
      expect(paused.analysed).toBeGreaterThan(0);

      const row = await healthRow(window);
      await expect(row.getByText(`Paused · ${paused.remaining} to go`)).toBeVisible();
      await expect(row.getByRole("button", { name: "Resume" })).toBeVisible();
    } finally {
      await app.close();
    }

    // A relaunch keeps the pause, and everything analysed before it.
    app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      const after = await analysis(window);
      expect(after.state).toBe("paused");
      expect(after.analysed).toBeGreaterThan(0);

      const row = await healthRow(window);
      await row.getByRole("button", { name: "Resume" }).click();

      await expect
        .poll(async () => {
          const now = await analysis(window);
          return `${now.state} ${now.analysed} ${now.failed} ${now.remaining}`;
        }, { timeout: 180_000 })
        .toBe(`idle ${COPIES} 1 0`);
      await expect(row.getByText(`All ${PRESENT} analyzed · 1 could not be read`)).toBeVisible({
        timeout: 10_000,
      });
      await expect(row.getByRole("button", { name: "Analyze waveforms" })).toBeVisible();

      // One event a run: the one paused from the strip said so, the resumed one
      // finished, and the broken file was reported by whichever run reached it
      // (the newest track, so the first).
      const feed = await window.evaluate(() =>
        window.cuepoint!.getRecentActivity!({ type: "waveforms.analysed", limit: 10 }),
      );
      const summaries = feed.events.map((event) => event.summary);
      expect(summaries[0]).toMatch(/\. Finished\.$/);
      expect(summaries.some((summary) => /Paused\.$/.test(summary))).toBe(true);
      expect(summaries.some((summary) => /1 file could not be read/.test(summary))).toBe(true);
    } finally {
      await app.close();
    }
  });
});
