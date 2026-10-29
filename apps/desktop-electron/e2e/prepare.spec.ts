/**
 * The Prepare page at the size people open it (PREP-10, DEC-112).
 *
 * The screen is crowded: the sidebar, the Set, the Inspector, across the
 * default 1,280 × 800 window at `--scale: 1.5`. Stacking two tables would have
 * halved the height Phase 8 already found too small, so DEC-112 put them side
 * by side and asked for a test that holds how many whole rows the Set shows.
 * This is that test. It measures the rows that are wholly inside the Set
 * table's viewport, at the default window size and scale, with the sidebar
 * expanded and as a rail, and with the player's bar on screen. It checks the
 * width in the same run, with PREP-11's source panel beside the Set: nothing
 * spills sideways, every header and panel control is on screen, and the Set
 * is the wider pane. It measures the rows again with the tempo and key lanes
 * open, with the transition strip open (WAVE-07), and the rows the panel's
 * Suggestions show.
 *
 * It then double-clicks a partly visible row, on the Prepare page and on the
 * Library page where Phase 8 found the defect, with the pointer where a person
 * would put it rather than through Playwright's scroll-into-view, and checks
 * that the row clicked is the row that plays (DEC-112's `TrackTable` fix).
 *
 * `CUEPOINT_E2E_EXECUTABLE` runs it against a packaged build, for example
 * `release/win-unpacked/CuePoint.exe`; without it the development build runs.
 */
import { test, expect, type ElectronApplication, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { waitForEngine } from "./engineReady";
import { clickRowAt } from "./rowClick";
import { NO_PLAYER, hasPlayer } from "./playerAvailable";
import { WINDOWS_INNER, setInnerSize } from "./windowSizes";
import { launchElectron } from "./support/launchApp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const TONE = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio", "tone.mp3");

/**
 * Each platform's counts are its own (WAVE-08). PREP-10 measured on Linux and
 * expected Windows one row lower everywhere. The first Windows run measured
 * every state as a rail one lower, but with the sidebar expanded two: the Set
 * pane is then 317 CSS pixels wide, and at Windows' font metrics the header
 * over the table wraps one line more (24 px), which is a row. So Linux holds
 * its own measurements, and Windows, and macOS until it is measured, the
 * Windows ones.
 */
const ON_LINUX = process.platform === "linux";

/**
 * The whole rows the Set table shows at the default window and scale, as the
 * page opens: measured in PREP-10 (see the step's outcome) and held here, with
 * the sidebar expanded and as a rail. DEC-112's floor is five: a design that
 * cannot reach five stops the step rather than lowering the floor. A change
 * that loses a row fails here and has to say why.
 *
 * Linux measured 8, held at 7; Windows measured 6 expanded and 7 as a rail.
 * PAGES-14 re-measured on Linux at the new default, 1.5×: 8 again (4 at 2×);
 * Windows' re-measure is owed. DEC-112's floor moved with the default.
 * R4-1: rows now follow the text (29px at 1.5×, was 50), so Linux measures 19, held at 18 (expanded
 * and as a rail); Windows and macOS hold 15 until measured.
 */
// Consistency round (26px rows): Windows measures 13, Linux holds one higher until measured.
// Round 5: the player bar is always drawn (87px at 1.5x, a full bar from 700px of window height up), so the
// 1,264 x 735 page measures 11 on Windows with it on screen (13 before, when it was not drawn until a first play).
const WHOLE_ROWS = ON_LINUX ? 12 : 11;
const FLOOR = 5;

/**
 * The same, with the player's bar on screen after something played (DEC-025).
 *
 * Measured and held too, so it cannot quietly get worse. It is below the floor:
 * the bar takes 116px at scale 2 and every control above the table is the
 * design system's 44px hit target doubled, so a fifth whole row would need a
 * smaller control or a smaller scale, which DEC-112 leaves alone. The step's
 * outcome records it.
 */
// Linux measured 5, held at 4; Windows 3 expanded and 4 as a rail. At 1.5×
// (PAGES-14) Linux measures 6 (2 at 2×), held at 5; Windows' re-measure is owed.
// R4-1 (rows follow the text): Linux measures 13, held at 12; Windows holds 10 until measured.
// Consistency round (26px rows): Windows holds 8, Linux one higher until measured.
const WHOLE_ROWS_PLAYING = ON_LINUX ? 9 : 8;

/**
 * The same with the tempo and key lanes open (PREP-11, DEC-111), sidebar
 * expanded and as a rail: the lanes take their height from the rows, which is
 * why they start hidden, and a person who opens them keeps them open.
 *
 * Measured 5 on Linux, held at 4. Windows measured 3 with the sidebar expanded
 * and 4 as a rail (WAVE-08; WAVE-06's commit measures the same), as the
 * transition strip does, since both take three of the Set's rows. At 1.5×
 * (PAGES-14) Linux measures 6 (2 at 2×), held at 5.
 */
// Consistency round (26px rows, 39px at 1.5×): Windows measures 11 with the lanes, Linux holds one higher.
// Round 5 review: measured 8 with the lanes at 1,264 x 735 (the always-drawn bar; 11 before it).
const WHOLE_ROWS_LANES = ON_LINUX ? 9 : 8;

/**
 * The same with the transition strip open (WAVE-07, DEC-120), sidebar expanded
 * and as a rail: one row of titles and a waveform two rows tall take three of
 * the rows, which is why it starts hidden too.
 *
 * Measured at WAVE-07 on Windows: 3 with the sidebar expanded and 4 as a rail,
 * what the lanes measure there, since both take three of the Set's rows. Every
 * count above sits one lower on Windows than on Linux, so Linux holds this
 * with a row to spare; held at the Windows figure until the Linux run records
 * its own. PAGES-14: Linux measured 5 at 1.5× (1 at 2×), held at 4.
 */
// Consistency round (26px rows, 39px at 1.5×): Windows measures 10 with the strip, Linux holds one higher.
// Round 5 review: measured 8 with the strip at 1,264 x 735 (the always-drawn bar; 10 before it).
// Batch Z: Linux now measures 8 as well (9 at the base): the strip and the shared header take the row Linux had spare.
const WHOLE_ROWS_TRANSITION = 8;

/**
 * The rows the Set keeps under the lanes or the strip whatever else is on
 * screen (WAVE-07, `setAreaFloor.ts`): with the player's bar as well they
 * would otherwise take every row, so the page scrolls to keep these.
 */
const ROWS_KEPT = 2;

/**
 * The whole rows the source panel's Suggestions show beside the Set, the page
 * as it opens (PREP-11). Measured 4 on Linux; held at 3 for the same reason.
 * At 1.5× (PAGES-14) Linux measures 6 (2 at 2×), held at 5; the other
 * platforms keep 3 until they are measured.
 */
const SOURCE_ROWS = ON_LINUX ? 5 : 3;

/** Enough tracks that the Set is always taller than its pane. */
const TRACKS = 36;

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
    const bpm = (120 + (i % 9)).toFixed(2);
    tracks.push(
      `<TRACK TrackID="${i}" Name="Track ${String(i).padStart(2, "0")}" Artist="Artist ${i}" ` +
        `Genre="House" Tonality="${(i % 12) + 1}A" AverageBpm="${bpm}" TotalTime="1" Location="${location(file)}"/>`,
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

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome } as Record<string, string>;
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

/** What a whole-row count sees: the rows wholly inside the table and the window. */
interface Measured {
  whole: number;
  partial: { index: number; title: string; x: number; y: number } | null;
  pageScrolls: boolean;
  overflowX: number;
  offscreenControls: string[];
  /** The Set pane's and the source panel's widths. */
  panes: { set: number; source: number };
  /** How far the source panel's content spills past its own width. */
  sourceOverflow: number;
  window: { width: number; height: number };
  scale: string;
}

async function measure(win: Page, tableName: string): Promise<Measured> {
  return win.evaluate((name) => {
    const table = document.querySelector<HTMLElement>(`[role="grid"][aria-label="${name}"]`)!;
    const header = table.querySelector<HTMLElement>(".track-table__header")!;
    const box = table.getBoundingClientRect();
    // The client area, not the box: a horizontal scrollbar along the bottom
    // covers whatever row is under it, which is not a row anyone can read.
    const top = Math.max(box.top + table.clientTop + header.getBoundingClientRect().height, 0);
    const bottom = Math.min(box.top + table.clientTop + table.clientHeight, window.innerHeight);
    const main = document.querySelector<HTMLElement>("main.app-main")!.getBoundingClientRect();
    // What is on screen is what every clipping ancestor lets through: the
    // Library's own column scrolls inside the page, and the page inside main.
    let visibleTop = top;
    let visibleBottom = bottom;
    for (let el = table.parentElement; el; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (!/(auto|scroll|hidden)/.test(style.overflowY)) continue;
      const r = el.getBoundingClientRect();
      visibleTop = Math.max(visibleTop, r.top + el.clientTop);
      visibleBottom = Math.min(visibleBottom, r.top + el.clientTop + el.clientHeight);
    }
    const rows = [...table.querySelectorAll<HTMLElement>(".track-table__row")];
    let whole = 0;
    let partial: Measured["partial"] = null;
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      if (r.top >= visibleTop - 0.5 && r.bottom <= visibleBottom + 0.5) whole += 1;
      // A chapter heading is not a track: a double-click on it plays nothing.
      else if (!partial && !row.classList.contains("prepare-heading") && r.top < visibleBottom - 4 && r.bottom > visibleBottom) {
        // The playing row's title cell also says "Now playing:" to a screen reader (R4-6).
        const title = (row.querySelector('[data-column="title"]')?.textContent?.trim() ?? "").replace(/^Now playing:\s*/, "");
        partial = {
          index: Number(row.dataset.index),
          title,
          x: r.left + Math.min(200, r.width / 2),
          y: r.top + Math.max(2, (visibleBottom - r.top) / 2),
        };
      }
    }
    const screenEl = [...document.querySelectorAll<HTMLElement>("main.app-main .screen")].find((el) => el.getClientRects().length > 0)!;
    const controls = [
      ...document.querySelectorAll<HTMLElement>(
        ".prepare-screen .cp-screen-header button, .prepare-screen .cp-screen-header select, .prepare-source button, .prepare-source select, .prepare-source input",
      ),
    ];
    const offscreenControls = controls
      // A table's own headers scroll inside it, by design.
      .filter((control) => !control.closest(".track-table"))
      .filter((control) => {
        const r = control.getBoundingClientRect();
        return r.left < main.left - 0.5 || r.right > main.right + 0.5;
      })
      .map((control) => control.textContent?.trim() || control.getAttribute("aria-label") || "control");
    return {
      whole,
      partial,
      pageScrolls: screenEl.scrollHeight > screenEl.clientHeight + 1,
      overflowX: Math.max(
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
        screenEl.scrollWidth - screenEl.clientWidth,
      ),
      offscreenControls,
      panes: {
        set: document.querySelector<HTMLElement>(".prepare-layout__set")?.getBoundingClientRect().width ?? 0,
        source: document.querySelector<HTMLElement>(".prepare-layout__source")?.getBoundingClientRect().width ?? 0,
      },
      sourceOverflow: (() => {
        const source = document.querySelector<HTMLElement>(".prepare-source");
        return source ? source.scrollWidth - source.clientWidth : 0;
      })(),
      window: { width: window.innerWidth, height: window.innerHeight },
      scale: getComputedStyle(document.documentElement).getPropertyValue("--scale").trim(),
    };
  }, tableName);
}

async function currentTitle(win: Page): Promise<string | null> {
  return win.evaluate(async () => {
    const state = await (window as never as Bridge).cuepoint.player.getState();
    return state.queue.currentItem?.title ?? null;
  });
}

/**
 * A ticked item of the View menu (C126): opens the menu, ticks or unticks the item, and closes the
 * menu again, as a ticked item leaves it open.
 */
async function toggleView(win: Page, name: string) {
  await win.getByRole("button", { name: "View", exact: true }).click();
  await win.getByRole("menuitemcheckbox", { name }).click();
  await win.keyboard.press("Escape");
}

async function setSidebar(win: Page, collapsed: boolean) {
  const nav = win.getByRole("navigation", { name: "Main navigation" });
  const wanted = collapsed ? "Collapse sidebar" : "Expand sidebar";
  const toggle = nav.getByRole("button", { name: wanted });
  if (await toggle.count()) await toggle.click();
  await expect(nav).toHaveAttribute("data-collapsed", String(collapsed));
}

test.describe("the Prepare page at the default size (PREP-10)", () => {
  test.describe.configure({ timeout: 300_000 });

  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-prepare-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  test("shows its whole rows, fits its width, and plays the row double-clicked", async () => {
    test.skip(!hasPlayer, NO_PLAYER);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const win = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(win);
      // The first launch stored the size its screen suggests (R2-5); this test is about the default 1.5.
      await win.evaluate(() => ((localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.removeItem("cuepoint-ui-lab-scale")), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
      // PAGES-12: every kind of motion is on (no stored overrides, the system not asking for less),
      // so a double-click to play and a shift-click range are proved with the motion in place.
      await win.emulateMedia({ reducedMotion: "no-preference" });
      // Polled: the page writes the attributes once it has mounted and read the system's answer,
      // which on the first launch of a run can come after the engine is up.
      await expect
        .poll(() => win.evaluate(() => document.documentElement.getAttributeNames().filter((n) => n.startsWith("data-motion-")).length), {
          message: "every kind is on",
          timeout: 15_000,
        })
        .toBe(10);

      // --- a library and a Set with three chapters, through the bridge ------
      const started = await win.evaluate(
        (xml) => (window as never as Bridge).cuepoint.startLibraryImport({ xml_path: xml }),
        writeLibrary(workspace),
      );
      await finished(win, started.job_id);
      const setId = await win.evaluate(async () => {
        const c = (window as never as Bridge).cuepoint;
        const playlists = (await c.getLibraryPlaylists()).playlists;
        const friday = playlists.find((node: { name: string }) => node.name === "Friday");
        const made = await c.sets.createFrom({ source: { kind: "playlist", id: friday.id } });
        const id = made.value.set.id;
        const plan = (await c.sets.plan({ set_id: id })).value;
        const entries = plan.entries.map((entry: { entry_id: number }) => entry.entry_id);
        await c.sets.splitChapter({ entry_id: entries[12], name: "Peak" });
        await c.sets.splitChapter({ entry_id: entries[24], name: "Close" });
        const first = (await c.sets.plan({ set_id: id })).value.chapters[0].id;
        await c.sets.updateChapter({ chapter_id: first, name: "Warm-up", target: "30:00" });
        return id;
      });

      // --- the default window, the default scale ------------------------------
      // The window as main opens it: nothing here resizes it.
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getSize())).toEqual([
        1280, 800,
      ]);
      await win.reload();
      await win.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
      await win.getByRole("link", { name: "Prepare", exact: true }).click();
      await expect(win).toHaveURL(new RegExp(`#/prepare/${setId}$`), { timeout: 30_000 });
      const table = win.getByRole("grid", { name: "Set entries" });
      await expect(table).toBeVisible({ timeout: 30_000 });
      await expect(win.locator(".prepare-heading").first()).toBeVisible({ timeout: 30_000 });
      await win.evaluate(async () => {
        const player = (window as never as Bridge).cuepoint.player;
        await player.setVolume(0);
        await player.setRepeat("one");
      });

      const measured: Record<string, Measured> = {};
      for (const collapsed of [false, true]) {
        await setSidebar(win, collapsed);
        const m = await measure(win, "Set entries");
        measured[collapsed ? "rail" : "expanded"] = m;
        expect(m.scale).toBe("1.5");
        expect(m.overflowX, "nothing spills sideways").toBeLessThanOrEqual(0);
        expect(m.offscreenControls, "every header and panel control is on screen").toEqual([]);
        // PREP-11: the source panel is beside the Set, the narrower of the two
        // (DEC-112), and nothing in it is wider than it.
        expect(m.panes.source, "the source panel is there").toBeGreaterThan(0);
        expect(m.panes.set, "the Set is the wider pane").toBeGreaterThan(m.panes.source);
        expect(m.sourceOverflow, "the panel's content fits it").toBeLessThanOrEqual(0);
      }

      // --- the source panel's rows, the page as it opens (PREP-11) -----------
      await setSidebar(win, false);
      await expect(win.getByRole("grid", { name: "Suggestions" }).locator(".track-table__row").first()).toBeVisible({
        timeout: 30_000,
      });
      const source = await measure(win, "Suggestions");
      console.log("PREP-11 source panel whole rows:", source.whole);
      expect(source.whole, "the Suggestions the panel shows").toBeGreaterThanOrEqual(SOURCE_ROWS);

      // --- the time columns, and Mix in on the focused row takes a mouse click ----------
      // M200: this Set has no times yet, so it opens without Time, Mix in and Mix out; Title has the room.
      const opening = (await table.getByRole("columnheader").allTextContents()).map((text) => text.trim());
      for (const name of ["Time", "Mix in", "Mix out"]) {
        expect(opening, `${name} waits until a time is asked for (M200)`).not.toContain(name);
      }
      // The View item brings them back.
      await toggleView(win, "Mix-in and mix-out columns");
      const entryRow = table.locator(".track-table__row").filter({ has: win.getByRole("button", { name: /^Mix in for/ }) }).nth(1);
      // The row by its own Mix in's name: once the cell opens, the button the filter above reads is gone.
      const mixInName = (await entryRow.getByRole("button", { name: /^Mix in for/ }).getAttribute("aria-label"))!;
      await clickRowAt(win, entryRow);
      const focusedRow = table.locator(".track-table__row").filter({ has: win.getByRole("button", { name: mixInName, exact: true }) });
      const buttons = focusedRow.getByRole("group", { name: "Selected tracks" });
      await expect(buttons).toBeVisible();
      // M192 (replaces option 3A): the buttons sit on a column of their own at the row's end, so no
      // data cell runs under them. Read at the table's right end, where a sticky cell is in its place.
      await table.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      const ends = await focusedRow.evaluate((row) => {
        const end = row.querySelector(":scope > .track-table__end")!.getBoundingClientRect();
        const reserved = row.querySelector(':scope > [data-column="entry_buttons"]')!.getBoundingClientRect();
        const data = [...row.querySelectorAll<HTMLElement>(":scope > [data-column]")].filter(
          (cell) => cell.dataset.column !== "entry_buttons",
        );
        return {
          endLeft: end.left,
          reservedLeft: reserved.left,
          dataRight: Math.max(...data.map((cell) => cell.getBoundingClientRect().right)),
        };
      });
      expect(Math.abs(ends.endLeft - ends.reservedLeft), "the buttons sit on their own column").toBeLessThan(1);
      expect(ends.dataRight, "no data cell runs under the buttons").toBeLessThanOrEqual(ends.endLeft + 1);
      const mixInBox = (await focusedRow.getByRole("button", { name: mixInName, exact: true }).boundingBox())!;
      await win.waitForTimeout(600); // past a double-click's length, so this is a click of its own
      const at = { x: mixInBox.x + mixInBox.width / 2, y: mixInBox.y + mixInBox.height / 2 };
      expect(
        await focusedRow.getByRole("button", { name: mixInName, exact: true }).evaluate(
          (cell, point) => cell.contains(document.elementFromPoint(point.x, point.y)),
          at,
        ),
        "Mix in is what is drawn at its own centre",
      ).toBe(true);
      await win.mouse.click(at.x, at.y);
      const field = table.getByRole("textbox", { name: mixInName.replace(/: .*$/, ""), exact: true });
      await expect(field).toBeVisible();
      await win.keyboard.press("Escape");
      await expect(field).toHaveCount(0);
      // Escape again lets go of the row, as the page was before this step.
      await win.keyboard.press("Escape");
      await expect(buttons).toHaveCount(0);
      await table.evaluate((element) => {
        element.scrollTop = 0;
        element.scrollLeft = 0;
      });

      // --- with the tempo and key lanes open (PREP-11) ------------------------
      await toggleView(win, "Tempo and key lane");
      await expect(win.getByRole("group", { name: "Tempo and key lanes" })).toBeVisible();
      const lanes: Record<string, Measured> = {};
      for (const collapsed of [false, true]) {
        await setSidebar(win, collapsed);
        const m = await measure(win, "Set entries");
        lanes[collapsed ? "rail + lanes" : "expanded + lanes"] = m;
        expect(m.overflowX, "nothing spills sideways with the lanes").toBeLessThanOrEqual(0);
        expect(m.pageScrolls, "the page does not scroll with the lanes").toBe(false);
      }
      console.log(
        "PREP-11 whole rows with the lanes:",
        JSON.stringify(Object.fromEntries(Object.entries(lanes).map(([k, v]) => [k, v.whole]))),
      );
      for (const [state, m] of Object.entries(lanes)) {
        expect(m.whole, `whole rows, ${state}`).toBeGreaterThanOrEqual(WHOLE_ROWS_LANES);
      }
      await toggleView(win, "Tempo and key lane");
      await expect(win.getByRole("group", { name: "Tempo and key lanes" })).toHaveCount(0);

      // --- with the transition strip open (WAVE-07) ---------------------------
      await toggleView(win, "Transition strip");
      const strip = win.getByRole("region", { name: "Transition" });
      await expect(strip).toBeVisible();
      // A row of titles and a waveform two rows tall, in the Set's own rows. The titles' row
      // is a row, or the two lines of its name and times where those are taller (R4-1).
      const geometry = await win.evaluate(() => {
        const shown = document.querySelector<HTMLElement>(".prepare-transition")!;
        const row = document.querySelector<HTMLElement>('[aria-label="Set entries"] .track-table__row')!;
        // --font-size-xs is 10px × --scale (a calc the computed style leaves unresolved).
        const xs = 10 * parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--scale"));
        return {
          rows: getComputedStyle(shown).gridTemplateRows,
          row: row.getBoundingClientRect().height,
          titles: Math.max(row.getBoundingClientRect().height, 2.3 * xs),
        };
      });
      // With no row selected the strip is one line (C259); the full height comes once a row is selected.
      expect(geometry.rows).toBe(`${geometry.titles}px`);
      await win
        .locator('[aria-label="Set entries"] .track-table__row[draggable="true"]')
        .first()
        .click({ position: { x: 20, y: 8 } });
      await expect
        .poll(() => win.evaluate(() => getComputedStyle(document.querySelector(".prepare-transition")!).gridTemplateRows))
        .toBe(`${geometry.titles}px ${geometry.row * 2}px`);
      const transition: Record<string, Measured> = {};
      for (const collapsed of [false, true]) {
        await setSidebar(win, collapsed);
        const m = await measure(win, "Set entries");
        transition[collapsed ? "rail + transition" : "expanded + transition"] = m;
        expect(m.overflowX, "nothing spills sideways with the strip").toBeLessThanOrEqual(0);
        expect(m.pageScrolls, "the page does not scroll with the strip").toBe(false);
      }
      console.log(
        "WAVE-07 whole rows with the transition strip:",
        JSON.stringify(Object.fromEntries(Object.entries(transition).map(([k, v]) => [k, v.whole]))),
      );
      for (const [state, m] of Object.entries(transition)) {
        expect(m.whole, `whole rows, ${state}`).toBeGreaterThanOrEqual(WHOLE_ROWS_TRANSITION);
      }
      await toggleView(win, "Transition strip");
      await expect(strip).toHaveCount(0);

      // --- the row double-clicked is the row that plays -----------------------
      await setSidebar(win, false);
      let before = await measure(win, "Set entries");
      // The rows can fit the pane exactly, or the row cut can be a chapter heading, which plays
      // nothing: scroll half a row at a time until an entry is cut.
      for (let tries = 0; !before.partial && tries < 4; tries += 1) {
        await win.evaluate(() => {
          const table = document.querySelector<HTMLElement>('[role="grid"][aria-label="Set entries"]')!;
          const row = table.querySelector<HTMLElement>(".track-table__row")!;
          table.scrollTop += row.getBoundingClientRect().height / 2;
        });
        before = await measure(win, "Set entries");
      }
      expect(before.partial, "a row is cut by the table's edge").not.toBeNull();
      await win.mouse.dblclick(before.partial!.x, before.partial!.y);
      await expect.poll(() => currentTitle(win), { timeout: 30_000 }).toBe(before.partial!.title);
      await expect(win.locator(".cp-player-bar")).toBeVisible({ timeout: 15_000 });
      // Back to the top, where the rows below are counted from.
      await win.evaluate(() => {
        document.querySelector<HTMLElement>('[role="grid"][aria-label="Set entries"]')!.scrollTop = 0;
      });

      // --- a shift-click picks the range, with every kind of motion on ----------
      const entryRows = win.locator('[role="grid"][aria-label="Set entries"] .track-table__row:not(.prepare-heading)');
      await entryRows.nth(0).click();
      await entryRows.nth(3).click({ modifiers: ["Shift"] });
      await expect(
        win.locator('[role="grid"][aria-label="Set entries"] .track-table__row[aria-selected="true"]:not(.prepare-heading)'),
        "the range from the first entry to the fourth",
      ).toHaveCount(4);

      // With the player's bar on screen too: the crowded case.
      for (const collapsed of [false, true]) {
        await setSidebar(win, collapsed);
        measured[collapsed ? "rail + player" : "expanded + player"] = await measure(win, "Set entries");
      }
      console.log(
        "PREP-10 whole rows:",
        JSON.stringify(Object.fromEntries(Object.entries(measured).map(([k, v]) => [k, v.whole]))),
        "page scrolls:",
        JSON.stringify(Object.fromEntries(Object.entries(measured).map(([k, v]) => [k, v.pageScrolls]))),
      );
      expect(WHOLE_ROWS).toBeGreaterThanOrEqual(FLOOR);
      for (const [state, m] of Object.entries(measured)) {
        const playing = state.endsWith("+ player");
        expect(m.whole, `whole rows, sidebar ${state}`).toBeGreaterThanOrEqual(
          playing ? WHOLE_ROWS_PLAYING : WHOLE_ROWS,
        );
        // The header stays on screen: the page itself does not scroll.
        expect(m.pageScrolls, `the page scrolls, sidebar ${state}`).toBe(false);
      }

      // --- the crowded case: the player's bar and the lanes or the strip -----
      // WAVE-07: they took every row the Set had left here. The Set keeps two
      // whole rows under them, and the page scrolls to show them.
      await setSidebar(win, false);
      const crowded: Record<string, number> = {};
      for (const [show, hide, name] of [
        ["Tempo and key lane", "Tempo and key lane", "lanes"],
        ["Transition strip", "Transition strip", "transition"],
      ] as const) {
        await toggleView(win, show);
        await win.evaluate(() => {
          const screen = [...document.querySelectorAll<HTMLElement>("main.app-main .screen")].find((el) => el.getClientRects().length > 0)!;
          screen.scrollTop = screen.scrollHeight;
        });
        const m = await measure(win, "Set entries");
        crowded[`expanded + player + ${name}`] = m.whole;
        expect(m.overflowX, `nothing spills sideways, player and ${name}`).toBeLessThanOrEqual(0);
        expect(m.whole, `whole rows under the ${name}, with the player`).toBeGreaterThanOrEqual(ROWS_KEPT);
        await win.evaluate(() => {
          [...document.querySelectorAll<HTMLElement>("main.app-main .screen")].find((el) => el.getClientRects().length > 0)!.scrollTop = 0;
        });
        await toggleView(win, hide);
      }
      console.log("WAVE-07 whole rows, crowded:", JSON.stringify(crowded));

      // --- the default columns at 1264 x 735, scale 1.25, Details open (C246) --------
      await win.evaluate(() => localStorage.setItem("cuepoint-ui-lab-scale", "1.25"));
      await win.reload();
      await expect(win.getByRole("grid", { name: "Set entries" })).toBeVisible({ timeout: 30_000 });
      const openedAt = await win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
      await setInnerSize(app, win, WINDOWS_INNER);
      // M125 (D16): the header's Details button shows only while the panel is hidden.
      const detailsToggle = win.getByRole("button", { name: "Track details", exact: true });
      if (await detailsToggle.isVisible()) await detailsToggle.click();
      await expect(win.getByRole("complementary", { name: "Track details" })).toBeVisible();
      // No default column is cut: the rule drops Artist first, and what is left fits without a sideways scroll.
      await expect
        .poll(() =>
          win.evaluate(() => {
            // The table is drawn again as Track details opens: read nothing until it is back.
            const scroll = document.querySelector<HTMLElement>('[role="grid"][aria-label="Set entries"]');
            return scroll ? scroll.scrollWidth - scroll.clientWidth : Number.POSITIVE_INFINITY;
          }),
        )
        .toBeLessThanOrEqual(1);
      const headersShown = await win
        .getByRole("grid", { name: "Set entries" })
        .getByRole("columnheader")
        .allTextContents();
      const shownNames = headersShown.map((text) => text.trim()).filter(Boolean);
      expect(shownNames).toEqual(expect.arrayContaining(["#", "Title", "Key", "BPM"]));
      // M200: the Set has no times, so after the reload Time and Mix in wait to be asked for again.
      expect(shownNames).not.toContain("Time");
      expect(shownNames).not.toContain("Mix in");
      // Back to the scale and the window the rest of this spec measures.
      await win.getByRole("button", { name: "Hide track details" }).click();
      await setInnerSize(app, win, openedAt);
      await win.evaluate(() => localStorage.removeItem("cuepoint-ui-lab-scale"));
      await win.reload();
      await expect(win.getByRole("grid", { name: "Set entries" })).toBeVisible({ timeout: 30_000 });

      // --- the Library, where Phase 8 found a double-click defeated -----------
      await win.getByRole("link", { name: "Library", exact: true }).click();
      const library = win.getByRole("grid", { name: "Library tracks" });
      await expect(library).toBeVisible({ timeout: 30_000 });
      await expect(win.locator(".library-screen .track-table__row").first()).toBeVisible({ timeout: 30_000 });
      // Phase 8 found a double-click defeated where a row straddles the bottom of
      // what is shown. Rows now follow the text (R4-1), so the Library's page fits
      // at this size; the same situation is made by scrolling the table's own
      // scroller until its bottom edge cuts a row through the middle, as a person
      // scrolling its rows would. Measured, not a fixed half row: where the edge
      // falls depends on the window's height (M496 hides the menu bar, so the page
      // is 27 px taller), and half a row from there landed on a row's boundary.
      await win.evaluate(() => {
        const table = document.querySelector<HTMLElement>('[role="grid"][aria-label="Library tracks"]')!;
        const row = table.querySelector<HTMLElement>(".track-table__row")!;
        const height = row.getBoundingClientRect().height;
        const bottom = table.getBoundingClientRect().top + table.clientTop + table.clientHeight;
        const into = (((bottom - row.getBoundingClientRect().top) % height) + height) % height;
        table.scrollTop += (height / 2 - into + height) % height;
      });
      const shown = await measure(win, "Library tracks");
      expect(shown.partial, "a Library row is cut by the table's edge").not.toBeNull();
      // One double-click, where a person would put it: the visible part of the
      // row, with nothing scrolled into view first. The first click selects,
      // which brings the selection's buttons; neither may move the rows or
      // cover them before the second click lands (DEC-112).
      // The Library's selection bar is drawn over the table's bottom rows (option 1A) and lets the
      // pointer through for a double-click's length, so the second click lands on the same row.
      await expect(win.getByRole("toolbar", { name: "Selection" })).toHaveCount(0);
      // Repeat-one again after the reload: the fixtures last a quarter of a second, and the next
      // track would otherwise be current before the poll reads it.
      await win.evaluate(() => (window as never as Bridge).cuepoint.player.setRepeat("one"));
      await win.mouse.dblclick(shown.partial!.x, shown.partial!.y);
      await expect.poll(() => currentTitle(win), { timeout: 30_000 }).toBe(shown.partial!.title);
    } finally {
      await app.close();
    }
  });
});
