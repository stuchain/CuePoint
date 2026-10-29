/**
 * The five sizes in the running app (PAGES-14, DEC-161).
 *
 * A fresh profile opens at the size its screen suggests (1.25× under 860 px of height,
 * else 1.5×; Small where even 1.25× is too big). At 1.25× and 1.5× no border width or
 * shadow length on the Library or Settings is fractional (the pixel style stays sharp).
 * In the default 1,280 × 800 window nothing scrolls sideways at any of the five sizes,
 * and the Library's table rows are the size's `--row-height` (26, 34, 39, 52 and 78
 * pixels: 2.6 times the extra-small text, a whole pixel since M4, the one row height of every
 * track list),
 * the header's height too, with no cell's text cut.
 *
 * Sizes are applied the way someone applies them: the stored value, then a reload.
 */
import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { waitForEngine } from "./engineReady";
import { WINDOWS_INNER, setInnerSize } from "./windowSizes";
import { hasFetchedPlayer } from "./playerAvailable";
import { launchElectron } from "./support/launchApp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const TONE = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio", "tone.mp3");

const SIZES = [
  { scale: 1, row: 26 },
  // M4: the extra-small text rounds to 13 px at 1.25×, so its row is round(13 × 2.6) = 34.
  { scale: 1.25, row: 34 },
  { scale: 1.5, row: 39 },
  { scale: 2, row: 52 },
  { scale: 3, row: 78 },
] as const;
const STORAGE_KEY = "cuepoint-ui-lab-scale";
const TRACKS = 12;

type Bridge = Record<string, any>;

const location = (file: string) =>
  "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");

function writeLibrary(dir: string): string {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const tracks: string[] = [];
  const keys: string[] = [];
  for (let i = 1; i <= TRACKS; i += 1) {
    const file = path.join(music, `${String(i).padStart(2, "0")}.mp3`);
    copyFileSync(TONE, file);
    tracks.push(
      `<TRACK TrackID="${i}" Name="Track ${String(i).padStart(2, "0")}" Artist="Artist ${i}" ` +
        `Genre="House" Tonality="${(i % 12) + 1}A" AverageBpm="${120 + i}.00" TotalTime="1" Location="${location(file)}"/>`,
    );
    keys.push(`<TRACK Key="${i}"/>`);
  }
  const xml = path.join(dir, "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.8.5" Company="AlphaTheta"/>
  <COLLECTION Entries="${TRACKS}">
${tracks.join("\n")}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="Friday" Type="1" KeyType="0" Entries="${TRACKS}">${keys.join("")}</NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return xml;
}

function launch(
  userDataDir: string,
  cuepointHome: string,
  extraEnv: Record<string, string> = {},
): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome, ...extraEnv } as Record<
    string,
    string
  >;
  delete env.ELECTRON_RUN_AS_NODE;
  return launchElectron({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

async function finished(win: Page, jobId: string) {
  await expect
    .poll(async () => (await win.evaluate((id) => (window as never as Bridge).cuepoint.getJob(id), jobId)).state, {
      timeout: 90_000,
    })
    .toBe("succeeded");
}

/** Store a size and reload, as choosing it in Settings does. */
async function openAt(win: Page, scale: number) {
  await win.evaluate(([key, value]) => localStorage.setItem(key, value), [STORAGE_KEY, String(scale)]);
  await win.reload();
  await win.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
  await expect
    .poll(() => win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--scale").trim()))
    .toBe(String(scale));
}

// A page eases in (DEC-298): it holds two frames, then moves. Boxes read mid-move are a
// sub-pixel off, so measure once the page has landed.
async function settled(win: Page) {
  await expect(win.locator('main.app-main[data-page-phase="hold"]')).toHaveCount(0);
  // Endless ones (a spinner) never finish, nor do scroll-driven ones (the Settings
  // headings below the fold); neither moves anything measured here.
  await win.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.timeline === document.timeline && a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
}

/** Every element whose computed border width or shadow offset, blur or spread is not a whole pixel. */
async function fractionalEdges(win: Page): Promise<string[]> {
  return win.evaluate(() => {
    const fractional = (value: string) => [...value.matchAll(/(-?\d*\.?\d+)px/g)].some(([, n]) => !Number.isInteger(Number(n)));
    const found: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const style = getComputedStyle(el);
      const widths = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].join(" ");
      if (fractional(widths) || (style.boxShadow !== "none" && fractional(style.boxShadow.replace(/rgba?\([^)]*\)/g, "")))) {
        found.push(`${el.tagName.toLowerCase()}.${el.className} border ${widths} shadow ${style.boxShadow}`);
      }
    }
    return found;
  });
}

test.describe("the sizes (PAGES-14)", () => {
  test.describe.configure({ timeout: 300_000 });

  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-scale-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  test("opens at its screen's size, lands on whole pixels, fits at every size, and sizes the rows", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const win = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(win);

      // --- a fresh profile opens at the size its screen suggests (R2-5) --------
      await win.waitForSelector(".app-shell", { timeout: 30_000 });
      // R2-5's rule: Small (1.25) under 860 px, else Medium, stepping down while fewer than
      // 560 px of rows would fit (a CI Mac's small virtual screen gets 1).
      const suggested = await win.evaluate(() => {
        const height = screen.availHeight;
        const wanted = height < 860 ? 1.25 : 1.5;
        const fits = [1, 1.25, 1.5].filter((s) => s <= wanted && height / s >= 560);
        return String(fits.length > 0 ? fits[fits.length - 1] : 1);
      });
      expect(await win.evaluate((key) => localStorage.getItem(key), STORAGE_KEY), "the suggested size is stored").toBe(suggested);
      expect(
        await win.evaluate(() => ({
          attribute: document.documentElement.dataset.scale,
          scale: getComputedStyle(document.documentElement).getPropertyValue("--scale").trim(),
        })),
      ).toEqual({ attribute: suggested, scale: suggested });

      await win.evaluate(() => (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
      const started = await win.evaluate(
        (xml) => (window as never as Bridge).cuepoint.startLibraryImport({ xml_path: xml }),
        writeLibrary(workspace),
      );
      await finished(win, started.job_id);
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getSize())).toEqual([
        1280, 800,
      ]);

      // --- no fractional border or shadow at 1.25× and 1.5×, on the Library and Settings
      for (const edgeScale of [1.25, 1.5]) {
        await openAt(win, edgeScale);
        await win.getByRole("link", { name: "Library", exact: true }).click();
        await expect(win.getByRole("grid", { name: "Library tracks" })).toBeVisible({ timeout: 30_000 });
        await expect(win.locator(".library-screen .track-table__row").first()).toBeVisible({ timeout: 30_000 });
        await settled(win);
        expect(await fractionalEdges(win), `Library: borders and shadows at ${edgeScale}×`).toEqual([]);
        await win.getByRole("link", { name: "Settings" }).click();
        await expect(win.getByLabel("Size of text and controls")).toBeVisible({ timeout: 30_000 });
        await settled(win);
        expect(await fractionalEdges(win), `Settings: borders and shadows at ${edgeScale}×`).toEqual([]);
      }

      // --- every size: nothing sideways, rows as tall as the size says --------
      // In the window as it opens, then in the page a Windows window leaves (1,264 × 735).
      for (const inner of [null, WINDOWS_INNER]) {
        if (inner) await setInnerSize(app, win, inner);
        const box = await win.evaluate(() => `${window.innerWidth}x${window.innerHeight}`);
        for (const { scale, row } of SIZES) {
          await openAt(win, scale);
          for (const page of ["Settings", "Library"]) {
            await win.getByRole("link", { name: page, exact: true }).click();
            if (page === "Library") {
              await expect(win.getByRole("grid", { name: "Library tracks" })).toBeVisible({ timeout: 30_000 });
              await expect(win.locator(".library-screen .track-table__row").first()).toBeVisible({ timeout: 30_000 });
            } else {
              await expect(win.getByLabel("Size of text and controls")).toBeVisible({ timeout: 30_000 });
            }
            await settled(win);
            const spill = await win.evaluate(() => {
              const screen = [...document.querySelectorAll<HTMLElement>("main.app-main .screen")].find((el) => el.getClientRects().length > 0)!;
              return Math.max(
                document.documentElement.scrollWidth - document.documentElement.clientWidth,
                screen.scrollWidth - screen.clientWidth,
              );
            });
            console.log(`Settings/Library sideways ${page} ${scale}× ${box}:`, spill);
            expect(spill, `${page} does not scroll sideways at ${scale}× in ${box}`).toBeLessThanOrEqual(0);
          }

          const rows = await win.evaluate(() => {
            const table = document.querySelector<HTMLElement>('[role="grid"][aria-label="Library tracks"]')!;
            // The header row with the line under it is one row tall, as a body row is (L3, DEC-301):
            // the line is inside that height, so the pane's lines beside it meet the table's.
            const header = table.querySelector<HTMLElement>(".track-table__header")!;
            const bodyRows = [...table.querySelectorAll<HTMLElement>(".track-table__row")];
            const cells = [...table.querySelectorAll<HTMLElement>(".track-table__cell")];
            return {
              token: getComputedStyle(document.documentElement).getPropertyValue("--row-height").trim(),
              header: header.getBoundingClientRect().height,
              rows: bodyRows.map((r) => r.getBoundingClientRect().height),
              clipped: cells.filter((c) => c.scrollHeight > c.clientHeight).length,
              cells: cells.length,
            };
          });
          expect(rows.rows.length, `rows drawn at ${scale}× in ${box}`).toBeGreaterThan(0);
          expect(rows.cells, `cells drawn at ${scale}× in ${box}`).toBeGreaterThan(0);
          expect(rows.token, `--row-height at ${scale}× in ${box}`).toBe(`${row}px`);
          expect(rows.header, `header height at ${scale}× in ${box}`).toBe(row);
          expect(new Set(rows.rows), `every body row is ${row}px at ${scale}× in ${box}`).toEqual(new Set([row]));
          expect(rows.clipped, `cells with text cut at ${scale}× in ${box}`).toBe(0);
        }
      }
    } finally {
      await app.close();
    }
  });

  test("Settings does not scroll sideways at 3× when no audio player is found", async () => {
    // Windows and macOS CI fetch the player into the tree, so only Linux can lose it.
    test.skip(hasFetchedPlayer, "this tree has a fetched player, so one is always found");
    // A blank override is ignored, and this tree has no fetched player.
    const app = await launch(userDataDir, cuepointHome, { CUEPOINT_MPV_PATH: "" });
    try {
      const win = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(win);
      await win.waitForSelector(".app-shell", { timeout: 30_000 });
      await win.evaluate(() => (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
      await openAt(win, 3);
      await win.getByRole("link", { name: "Settings", exact: true }).click();
      await expect(win.getByLabel("Size of text and controls")).toBeVisible({ timeout: 30_000 });
      // The Playback panel says the player is missing in its problem notice (an alert).
      const error = win.locator(".cp-audio-settings").getByRole("alert").filter({ hasText: "No audio player found" });
      await error.scrollIntoViewIfNeeded();
      await expect(error).toBeVisible({ timeout: 30_000 });
      await expect(error).toContainText("No audio player found");
      for (const inner of [null, WINDOWS_INNER]) {
        if (inner) await setInnerSize(app, win, inner);
        const spill = await win.evaluate(() => {
          const screen = [...document.querySelectorAll<HTMLElement>("main.app-main .screen")].find((el) => el.getClientRects().length > 0)!;
          return {
            box: `${window.innerWidth}x${window.innerHeight}`,
            sideways: Math.max(
              document.documentElement.scrollWidth - document.documentElement.clientWidth,
              screen.scrollWidth - screen.clientWidth,
            ),
          };
        });
        console.log("Settings with the player error at 3×:", JSON.stringify(spill));
        expect(
          spill.sideways,
          `Settings with the player error does not scroll sideways at 3× in ${spill.box}`,
        ).toBeLessThanOrEqual(0);
      }
    } finally {
      await app.close();
    }
  });
});
