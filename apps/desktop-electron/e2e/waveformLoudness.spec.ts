/**
 * Loudness, measured with each waveform and shown where it is read (WAVE-08).
 *
 * The component tests prove each sentence and number from an answer; this
 * proves the pinned decoder's readings reach every place in the running app:
 *
 * - the Inspector says each fixture's loudness, or why it has none: `bands.flac`
 *   −3.5 LUFS with a −4.3 dBFS peak, a generated −20 dBFS sine −20.0 LUFS,
 *   silence "Silent", and a file under one 400 ms block too short to measure;
 * - the Library's "Loudness" column shows each number, and a copy carries it
 *   with its unit;
 * - Prepare's transition strip ends each title with its track's loudness and
 *   says how far apart the two sit;
 * - a store made before this step keeps every waveform after the upgrade, says
 *   each loudness is still to be measured, measures one asked for while the
 *   analysis is paused, and the rest when it resumes, every picture unchanged.
 *
 * Skips where no `mpv` was fetched; desktop CI fetches it on Windows and macOS.
 * `CUEPOINT_E2E_EXECUTABLE` runs it against a packaged build, and
 * `CUEPOINT_MPV_PATH` names the `mpv` a Linux build uses. Each launch gets its
 * own `--user-data-dir` and `CUEPOINT_HOME`.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { resolvePlayerBinary } from "../electron/playerLaunch";
import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(DESKTOP_ROOT, "../..");
const FIXTURES = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio");

const hasDecoder = Boolean(resolvePlayerBinary({ packaged: false, repoRoot: REPO_ROOT, env: process.env }));

const location = (file: string) => "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");

type Bridge = Record<string, any>;

/** The tracks, in the playlist "Friday"'s order: title, file, and what each reads. */
const TRACKS = [
  { title: "Bands", file: "bands.flac", line: "Loudness −3.5 LUFS · Peak −4.3 dBFS", cell: "−3.5" },
  { title: "Sine", file: "sine.wav", line: "Loudness −20.0 LUFS · Peak −20.0 dBFS", cell: "−20.0" },
  { title: "Hush", file: "tone.mp3", line: "Silent", cell: "Silent" },
  { title: "Blip", file: "tone.flac", line: "Too quiet or too short to measure · Peak −4.3 dBFS", cell: "Quiet" },
] as const;

/**
 * A 1 kHz sine at −20 dBFS in both channels, five seconds at 48 kHz, as EBU
 * Tech 3341's first case is at −23: it reads −20.0 LUFS, and its peak −20.0.
 */
function writeSine(file: string): void {
  const rate = 48_000;
  const frames = rate * 5;
  const data = Buffer.alloc(frames * 4);
  const amplitude = 10 ** (-20 / 20) * 32_767;
  for (let i = 0; i < frames; i += 1) {
    const sample = Math.round(amplitude * Math.sin((2 * Math.PI * 1_000 * i) / rate));
    data.writeInt16LE(sample, i * 4);
    data.writeInt16LE(sample, i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([header, data]));
}

function writeExport(dir: string): string {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const tracks = TRACKS.map((track, index) => {
    const file = path.join(music, track.file);
    if (track.file === "sine.wav") writeSine(file);
    else copyFileSync(path.join(FIXTURES, track.file), file);
    return `<TRACK TrackID="${index + 1}" Name="${track.title}" Artist="Fixture" Location="${location(file)}"/>`;
  });
  const keys = TRACKS.map((_, index) => `<TRACK Key="${index + 1}"/>`).join("");
  const xml = path.join(dir, "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${tracks.length}">
${tracks.join("\n")}
  </COLLECTION>
  <PLAYLISTS><NODE Type="0" Name="ROOT" Count="1"><NODE Name="Friday" Type="1" KeyType="0" Entries="${TRACKS.length}">${keys}</NODE></NODE></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return xml;
}

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

/** Make the store one written before WAVE-08: every waveform, no loudness table. */
const FORGET_LOUDNESS = `
from cuepoint.persistence.waveform_store import WaveformStore
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.utils.di_container import get_container

bootstrap_services()
store = get_container().resolve(WaveformStore)
connection = store.connect()
connection.execute("DROP TABLE loudness")
print(store.count())
store.close_all()
`;

function forgetLoudness(cuepointHome: string): number {
  const out = execFileSync(python(), ["-c", FORGET_LOUDNESS], {
    env: { ...process.env, CUEPOINT_HOME: cuepointHome, PYTHONPATH: path.join(REPO_ROOT, "src") },
    encoding: "utf-8",
  });
  return Number(out.trim().split(/\s+/).pop());
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.env.CUEPOINT_E2E_EXECUTABLE;
  return packaged
    ? electron.launch({ executablePath: packaged, args: [`--user-data-dir=${userDataDir}`], env })
    : electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await window.evaluate(() => (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
  return window;
}

function analysis(window: Page) {
  return window.evaluate(async () => (await window.cuepoint!.waveforms!.analysis()).value!);
}

/** Wait until every track is analysed and measured, and the run has ended. */
async function analysedAll(window: Page) {
  await expect
    .poll(async () => {
      const now = await analysis(window);
      return `${now.state === "running" ? "running" : "settled"} ${now.analysed + now.failed} ${now.remaining}`;
    }, { timeout: 120_000 })
    .toBe(`settled ${TRACKS.length} 0`);
}

async function trackIds(window: Page): Promise<Map<string, number>> {
  const page = await window.evaluate(() =>
    window.cuepoint!.searchLibrary!({ q: "Fixture", limit: 50, offset: 0 } as never),
  );
  const rows = (page as { tracks: { id: number; title: string }[] }).tracks;
  return new Map(rows.map((row) => [row.title, row.id]));
}

/** Each track's state, loudness and picture bytes, as the engine answers them now. */
async function answers(window: Page, ids: number[]) {
  return window.evaluate(async (trackIds) => {
    const answer = await window.cuepoint!.waveforms!.get({ track_ids: trackIds, width: 120 });
    return answer.value!.waveforms.map((track) => ({
      id: track.track_id,
      state: track.state,
      loudness: track.loudness,
      picture: track.data ? Array.from(track.data).join(",") : null,
    }));
  }, ids);
}

async function inspect(window: Page, title: string) {
  const search = window.locator(".cp-filter-bar").getByRole("textbox", { name: "Search" });
  await search.fill(title);
  await window.locator(".track-table__row").filter({ hasText: title }).first().click();
  await expect(window.locator("[data-testid=inspector-waveform]")).toBeVisible({ timeout: 20_000 });
}

test.describe("Loudness, measured with each waveform (WAVE-08)", () => {
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

  test("the Inspector, the Library's column, a copy and Prepare's strip each say it", async () => {
    test.setTimeout(240_000);
    const xml = writeExport(workspace);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await window.evaluate((file) => window.cuepoint!.startLibraryImport!({ xml_path: file }), xml);
      await analysedAll(window);
      // The import was the engine's alone: the window reads the library afresh.
      await window.reload();
      await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });

      // --- the Inspector: each reading, or why there is none ---------------
      await window.getByRole("link", { name: "Library" }).click();
      await expect(window.locator(".track-table__row").first()).toBeVisible({ timeout: 30_000 });
      const line = window.getByTestId("inspector-loudness");
      for (const track of TRACKS) {
        await inspect(window, track.title);
        await expect(line).toHaveText(track.line, { timeout: 15_000 });
      }
      await window.locator(".cp-filter-bar").getByRole("textbox", { name: "Search" }).fill("");

      // --- the Library's column: the number alone --------------------------
      await window.getByRole("button", { name: "Columns…" }).click();
      await window.getByRole("dialog").getByRole("checkbox", { name: "Loudness" }).check();
      await window.keyboard.press("Escape");
      for (const track of TRACKS) {
        const row = window.locator(".track-table__row").filter({ hasText: track.title }).first();
        await expect(row.locator(".track-table__cell[data-column=loudness]")).toHaveText(track.cell, {
          timeout: 20_000,
        });
      }
      const bands = window
        .locator(".track-table__row")
        .filter({ hasText: "Bands" })
        .first()
        .locator(".track-table__cell[data-column=loudness] span");
      await expect(bands).toHaveAttribute("title", "Loudness −3.5 LUFS · Peak −4.3 dBFS");

      // --- a copy: each row's loudness with its unit -----------------------
      await window.locator(".track-table__row").filter({ hasText: "Bands" }).first().click();
      await window.keyboard.press("Control+A");
      await window.getByRole("button", { name: "More", exact: true }).click();
      await window.getByRole("menuitem", { name: /^Copy/ }).click();
      await expect(window.getByText(`Copied ${TRACKS.length} tracks`)).toBeVisible({ timeout: 15_000 });
      const copied = (await app.evaluate(({ clipboard }) => clipboard.readText())).replace(/\r\n/g, "\n");
      const lines = copied.split("\n");
      const column = lines[0]!.split("\t").indexOf("Loudness");
      expect(column).toBeGreaterThan(-1);
      const byTitle = new Map(lines.slice(1).map((each) => [each.split("\t")[0], each.split("\t")[column]]));
      expect(byTitle.get("Bands")).toBe("−3.5 LUFS");
      expect(byTitle.get("Sine")).toBe("−20.0 LUFS");
      expect(byTitle.get("Hush")).toBe("Silent");
      expect(byTitle.get("Blip")).toBe("Too quiet or too short to measure");

      // --- Prepare's strip: each title's loudness, and the difference -------
      const setId = await window.evaluate(async () => {
        const c = (window as never as { cuepoint: Bridge }).cuepoint;
        const friday = (await c.getLibraryPlaylists()).playlists.find((node: { name: string }) => node.name === "Friday");
        const made = await c.sets.createFrom({ source: { kind: "playlist", id: friday.id } });
        return made.value.set.id;
      });
      await window.getByRole("link", { name: "Prepare", exact: true }).click();
      await expect(window).toHaveURL(new RegExp(`#/prepare/${setId}$`), { timeout: 30_000 });
      await window.getByRole("button", { name: "View ▾" }).click();
      await window.getByRole("menuitem", { name: "Show transition strip" }).click();
      const setTable = window.getByRole("table", { name: "Set entries" });
      await setTable.locator(".track-table__row").first().click({ position: { x: 60, y: 10 } });
      const words = window.getByTestId("transition-words");
      // The fixtures carry no Beatport key, so the strip first says the key was not checked (PAGES-09B).
      await expect(words).toHaveText("No Beatport key: key not checked · No out time → no times · −16.5 LU", {
        timeout: 15_000,
      });
      await expect(window.getByTestId("transition-loudness")).toHaveText([" · −3.5 LUFS", " · −20.0 LUFS"]);
      // Sine into silence: no difference without two values.
      await window.getByTestId("transition-to").click();
      await expect(words).toHaveText("No Beatport key: key not checked · No out time → no times");
      await expect(window.getByTestId("transition-loudness")).toHaveText([" · −20.0 LUFS"]);
    } finally {
      await app.close();
    }
  });

  test("a store made before loudness keeps every waveform and gains each loudness", async () => {
    test.setTimeout(240_000);
    const xml = writeExport(workspace);
    let app = await launch(userDataDir, cuepointHome);
    let before: Awaited<ReturnType<typeof answers>>;
    let ids: Map<string, number>;
    try {
      const window = await ready(app);
      await window.evaluate((file) => window.cuepoint!.startLibraryImport!({ xml_path: file }), xml);
      await analysedAll(window);
      ids = await trackIds(window);
      before = await answers(window, [...ids.values()]);
      expect(before.every((track) => track.state === "ready" && track.loudness !== null)).toBe(true);
      // Paused, so the relaunch shows the store as an upgrade finds it.
      await window.evaluate(() => window.cuepoint!.waveforms!.pause());
    } finally {
      await app.close();
    }

    expect(forgetLoudness(cuepointHome)).toBe(TRACKS.length);

    app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      // Every waveform kept; every loudness still to be measured, and counted.
      const upgraded = await answers(window, [...ids.values()]);
      expect(upgraded.map((track) => [track.state, track.picture, track.loudness])).toEqual(
        before.map((track) => ["ready", track.picture, null]),
      );
      const paused = await analysis(window);
      expect([paused.state, paused.remaining, paused.analysed]).toEqual(["paused", TRACKS.length, 0]);

      // The Inspector draws it, says why there is no loudness yet, and asks
      // for it: a request is measured even while paused.
      await window.getByRole("link", { name: "Library" }).click();
      await expect(window.locator(".track-table__row").first()).toBeVisible({ timeout: 30_000 });
      await inspect(window, "Sine");
      await expect(window.locator("[data-testid=inspector-waveform] canvas")).toBeVisible({ timeout: 20_000 });
      const line = window.getByTestId("inspector-loudness");
      await expect(line).toHaveText("Loudness −20.0 LUFS · Peak −20.0 dBFS", { timeout: 30_000 });
      expect((await analysis(window)).remaining).toBe(TRACKS.length - 1);

      // Resumed, the rest are measured, every picture as it was.
      await window.evaluate(() => window.cuepoint!.waveforms!.resume());
      await analysedAll(window);
      const after = await answers(window, [...ids.values()]);
      expect(after.map((track) => track.picture)).toEqual(before.map((track) => track.picture));
      expect(after.map((track) => track.loudness)).toEqual(before.map((track) => track.loudness));
      await inspect(window, "Bands");
      await expect(line).toHaveText("Loudness −3.5 LUFS · Peak −4.3 dBFS", { timeout: 15_000 });
    } finally {
      await app.close();
    }
  });
});
