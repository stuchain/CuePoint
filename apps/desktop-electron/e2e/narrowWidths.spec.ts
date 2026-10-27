/**
 * P2's width risk, measured (UI cohesion pass, WP31): Inter at 11 medium is wider than the pixel
 * face at 10, so the three rows that were tightest must still fit in a 1,024 px wide page at the
 * Medium text size (1.5x): the Library's filter row, Prepare's source toolbar and the player bar's
 * meta line. "Fit" means no sideways scroll, nothing drawn past its row's right edge, and no
 * button, select or label whose text is cut (scrollWidth over clientWidth).
 *
 * A box measure of the running app; every number is printed so the margin is on record.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { waitForEngine } from "./engineReady";
import { setInnerSize } from "./windowSizes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const TONE = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio", "tone.mp3");
const SCALE_KEY = "cuepoint-ui-lab-scale";

type Bridge = Record<string, any>;

const location = (file: string) => "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");

function writeLibrary(dir: string): { xml: string; tone: string } {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const tracks: string[] = [];
  const keys: string[] = [];
  for (let i = 1; i <= 12; i += 1) {
    const file = path.join(music, `${String(i).padStart(2, "0")}.mp3`);
    copyFileSync(TONE, file);
    tracks.push(
      `<TRACK TrackID="${i}" Name="Track ${i}" Artist="Artist ${i}" Genre="House" Tonality="${(i % 4) + 7}A" ` +
        `AverageBpm="${(122 + i).toFixed(2)}" TotalTime="300" Location="${location(file)}"/>`,
    );
    keys.push(`<TRACK Key="${i}"/>`);
  }
  const xml = path.join(dir, "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.8.5" Company="AlphaTheta"/>
  <COLLECTION Entries="12">
${tracks.join("\n")}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="Friday" Type="1" KeyType="0" Entries="12">${keys.join("")}</NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return { xml, tone: path.join(music, "01.mp3") };
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

/** How a row fits: its own spill, the spill of the page, anything past its edge, and any cut text. */
async function fit(win: Page, selector: string) {
  return win.evaluate((sel) => {
    const row = document.querySelector<HTMLElement>(sel)!;
    const box = row.getBoundingClientRect();
    const past: string[] = [];
    const cut: string[] = [];
    for (const el of row.querySelectorAll<HTMLElement>("*")) {
      const r = el.getBoundingClientRect();
      // A visually hidden label (a 1 px box) is read by screen readers only.
      if (r.width <= 1 || r.height <= 1 || getComputedStyle(el).visibility === "hidden") continue;
      const name = `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} "${(el.textContent ?? "").trim().slice(0, 24)}"`;
      if (r.right > box.right + 1) past.push(`${name} ends ${Math.round(r.right - box.right)}px past the row`);
      const interactive = el.matches("button, label, select, a, span, legend, p");
      if (interactive && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).display !== "inline") {
        cut.push(`${name} scrollWidth ${el.scrollWidth} > clientWidth ${el.clientWidth}`);
      }
    }
    return {
      width: Math.round(box.width),
      rowSpill: row.scrollWidth - row.clientWidth,
      pageSpill: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      right: Math.round(box.right),
      window: window.innerWidth,
      past,
      cut,
    };
  }, selector);
}

test.describe("the tightest rows at 1,024 px wide and 1.5x (P2)", () => {
  test.describe.configure({ timeout: 300_000 });

  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-narrow-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  test("the Library filter row, Prepare's source toolbar and the player's meta line fit", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const win = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(win);
      await win.evaluate(() => (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
      const { xml, tone } = writeLibrary(workspace);
      const started = await win.evaluate((x) => (window as never as Bridge).cuepoint.startLibraryImport({ xml_path: x }), xml);
      await expect
        .poll(async () => (await win.evaluate((id) => (window as never as Bridge).cuepoint.getJob(id), started.job_id)).state, {
          timeout: 90_000,
        })
        .toBe("succeeded");
      const setId: number = await win.evaluate(async () => {
        const c = (window as never as Bridge).cuepoint;
        const friday = (await c.getLibraryPlaylists()).playlists.find((node: { name: string }) => node.name === "Friday");
        return (await c.sets.createFrom({ source: { kind: "playlist", id: friday.id } })).value.set.id;
      });

      await win.evaluate((key) => localStorage.setItem(key, "1.5"), SCALE_KEY);
      await win.reload();
      await win.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
      await setInnerSize(app, win, { width: 1024, height: 800 });
      await expect
        .poll(() => win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--scale").trim()))
        .toBe("1.5");

      // --- the Library filter row ---------------------------------------------------------
      await win.getByRole("link", { name: "Library", exact: true }).click();
      await expect(win.locator(".library-screen .track-table__row").first()).toBeVisible({ timeout: 30_000 });
      const library = await fit(win, ".cp-filter-bar__row");
      console.log("Library filter row at 1024 px / 1.5x:", JSON.stringify(library));
      expect(library.pageSpill, "the page does not scroll sideways").toBeLessThanOrEqual(0);
      expect(library.rowSpill, "the filter row has no hidden overflow").toBeLessThanOrEqual(0);
      expect(library.past, "nothing in the filter row is drawn past its edge").toEqual([]);
      expect(library.cut, "no text in the filter row is cut").toEqual([]);

      // --- Prepare's source toolbar -------------------------------------------------------
      await win.evaluate((id) => (window.location.hash = `#/prepare/${id}`), setId);
      await expect(win.getByRole("grid", { name: "Set entries" })).toBeVisible({ timeout: 30_000 });
      await expect(win.locator(".prepare-source__controls")).toBeVisible();
      const prepare = await fit(win, ".prepare-source__controls");
      console.log("Prepare source toolbar at 1024 px / 1.5x:", JSON.stringify(prepare));
      expect(prepare.pageSpill, "the page does not scroll sideways").toBeLessThanOrEqual(0);
      expect(prepare.rowSpill, "the source toolbar has no hidden overflow").toBeLessThanOrEqual(0);
      expect(prepare.past, "nothing in the source toolbar is drawn past its edge").toEqual([]);
      expect(prepare.cut, "no text in the source toolbar is cut").toEqual([]);

      // --- Prepare's side Library table (M85, M88) ----------------------------------------
      // The narrow panel opens on Title and Key: no sideways scroll, and Key's heading is whole.
      await win.getByRole("region", { name: "Add to the Set" }).getByRole("tab", { name: "Library" }).click();
      const side = win.getByRole("grid", { name: "Library tracks to add" });
      await expect(side.locator(".track-table__row").first()).toBeVisible({ timeout: 30_000 });
      const sideFit = await side.evaluate((el) => ({
        headers: [...el.querySelectorAll<HTMLElement>(".track-table__header-text")].map((h) => (h.textContent ?? "").trim()),
        spill: el.scrollWidth - el.clientWidth,
        cut: [...el.querySelectorAll<HTMLElement>(".track-table__header-text")]
          .filter((h) => h.scrollWidth > h.clientWidth + 1)
          .map((h) => (h.textContent ?? "").trim()),
      }));
      console.log("Prepare side Library table at 1024 px / 1.5x:", JSON.stringify(sideFit));
      expect(sideFit.headers, "the side table opens on Title and Key (M85)").toEqual(expect.arrayContaining(["Title", "Key"]));
      expect(sideFit.headers, "BPM waits in the Columns list (M85)").not.toContain("BPM");
      expect(sideFit.spill, "the side table does not scroll sideways (M85)").toBeLessThanOrEqual(0);
      expect(sideFit.cut, "no heading is cut by the corner (M88)").toEqual([]);

      // --- the player's meta line ---------------------------------------------------------
      // Start the track and wait until the player really holds it: playQueue answers { ok: false } while
      // the player is still starting, and the result used to be ignored, so the bar sometimes never named
      // the track. Poll until playQueue is ok and the current item is the expected track, then pause.
      // The tone fixture lasts 0.26 s and Linux CI's PulseAudio null sink plays in real time, so a single
      // copy ended before the pause landed and the bar fell back to "Nothing playing". The queue holds
      // the same file 20 times (as waveformPlaces.spec.ts does): each copy is preloaded gaplessly
      // behind the one playing, so the track is still held when the pause lands.
      await win.evaluate(async () => {
        await (window as never as Bridge).cuepoint.player.setVolume(0);
      });
      await expect
        .poll(
          () =>
            win.evaluate(async (file) => {
              const player = (window as never as Bridge).cuepoint.player;
              const item = { filePath: file, title: "Strobe", artist: "deadmau5", key: "8A", bpm: 128, durationSeconds: 300 };
              const result = await player.playQueue(
                Array.from({ length: 20 }, () => ({ ...item })),
                0,
              );
              if (!result?.ok) return `playQueue refused: ${result?.code ?? "no result"}`;
              const state = await player.getState();
              return state?.queue?.currentItem?.title ?? null;
            }, tone),
          { message: "the player accepts the queue and holds Strobe", timeout: 30_000, intervals: [250, 500, 1_000, 2_000] },
        )
        .toBe("Strobe");
      await win.evaluate(async () => {
        await (window as never as Bridge).cuepoint.player.pause();
      });
      await expect(win.locator(".cp-player-bar")).toContainText("Strobe", { timeout: 20_000 });
      const dialog = win.getByRole("dialog", { name: "Getting started" });
      // D24: Getting started has no Skip; its × (Close) skips it.
      if (await dialog.count()) await dialog.getByRole("button", { name: "Close" }).click();
      const meta = await win.evaluate(() => {
        const el = document.querySelector<HTMLElement>(".cp-player-bar__meta")!;
        return {
          text: (el.textContent ?? "").trim(),
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          pageSpill: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });
      console.log("Player meta line at 1024 px / 1.5x:", JSON.stringify(meta));
      expect(meta.text, "the meta line keeps the artist, key and tempo").toContain("deadmau5");
      expect(meta.text).toContain("8A");
      expect(meta.text).toContain("128 BPM");
      expect(meta.scrollWidth, "the meta line is not cut").toBeLessThanOrEqual(meta.clientWidth + 1);
      expect(meta.pageSpill, "the page does not scroll sideways").toBeLessThanOrEqual(0);
    } finally {
      await app.close();
    }
  });
});
