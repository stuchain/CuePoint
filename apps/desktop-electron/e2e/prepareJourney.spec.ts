/**
 * The whole of Phase 10, end to end (PREP-12).
 *
 * A DJ prepares a Set through the app, gesture by gesture, against the real
 * engine, and relaunches onto it:
 *
 * 1. A Set made from a Collection with a repeat ("New Set from…").
 * 2. Split into three chapters; one given a target length and a BPM range;
 *    the Set's own notes typed.
 * 3. Entries timed in the Inspector, one reordered by drag; the running time
 *    and "Starts" move.
 * 4. A gap filled from Suggestions, and a key warning accepted.
 * 5. The Set played from its third entry, the repeat in the queue.
 * 6. The set list saved as text, CSV and M3U8, and copied.
 * 7. Exported to Rekordbox with the Set ticked.
 * 8. A relaunch onto the Set, all of it intact.
 * 9. A refresh that deletes one of its tracks, with the Set counted in the
 *    warning.
 *
 * The one thing not driven is the operating system's save dialog, which no
 * test can click: `dialog.showSaveDialog` is answered in the main process with
 * the path a person would have chosen, as `rekordboxExport.spec.ts` does, and
 * everything after it is real. Setup that is not the journey (the library and
 * the Collection) goes through the bridge. Every step's outcome is read back
 * from the engine, because what the page drew is not what was written.
 *
 * A second test makes a Set from a Library selection clicked out of the
 * table's order, and holds the Set to the table's order (acceptance 2).
 *
 * `src/tests/integration/test_prepare_phase_journey.py` takes the same nine
 * steps through the engine's routes on every build. `CUEPOINT_E2E_EXECUTABLE`
 * runs this one against a packaged build.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const TONE = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio", "tone.mp3");

type Bridge = Record<string, any>;

/** id, title, BPM, key. 1–5 make the Collection; 6 and 7 are there to be suggested. */
const TRACKS: [number, string, number, string][] = [
  [1, "Warm One", 124, "8A"],
  [2, "Warm Two", 125, "9A"],
  [3, "Build", 126, "8A"],
  [4, "Peak Jump", 140, "3B"],
  [5, "Close", 124.5, "8B"],
  [6, "Bridge Spare", 124.8, "9A"],
  [7, "Other Spare", 123, "8A"],
];

const location = (file: string) => "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");

function writeLibrary(dir: string, keep: (id: number) => boolean = () => true): string {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const rows = TRACKS.filter(([id]) => keep(id)).map(([id, title, bpm, key]) => {
    const file = path.join(music, `${id}.mp3`);
    if (!existsSync(file)) copyFileSync(TONE, file);
    return (
      `<TRACK TrackID="${id}" Name="${title}" Artist="Ada" Genre="House" Tonality="${key}" ` +
      `AverageBpm="${bpm.toFixed(2)}" TotalTime="300" Location="${location(file)}"/>`
    );
  });
  const xml = path.join(dir, "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.8.5" Company="AlphaTheta"/>
  <COLLECTION Entries="${rows.length}">
${rows.join("\n")}
  </COLLECTION>
  <PLAYLISTS><NODE Type="0" Name="ROOT" Count="0"/></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return xml;
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.env.CUEPOINT_E2E_EXECUTABLE;
  return packaged
    ? electron.launch({ executablePath: packaged, args: [`--user-data-dir=${userDataDir}`], env })
    : electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

async function finished(win: Page, jobId: string) {
  await expect
    .poll(async () => (await win.evaluate((id) => (window as never as Bridge).cuepoint.getJob(id), jobId)).state, {
      timeout: 90_000,
    })
    .toBe("succeeded");
}

async function saveDialogAnswers(app: ElectronApplication, filePath: string) {
  await app.evaluate(({ dialog }, chosen) => {
    const answer = async () => ({ canceled: false, filePath: chosen });
    (dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = answer;
  }, filePath);
}

/** The Set as the engine has it: everything the page reads. */
async function readSet(win: Page, setId: number) {
  return win.evaluate(async (id) => {
    const sets = (window as never as Bridge).cuepoint.sets;
    const [plan, entries, analysis] = await Promise.all([
      sets.plan({ set_id: id }),
      sets.entries({ set_id: id }),
      sets.analysis({ set_id: id }),
    ]);
    return { plan: plan.value, entries: entries.value, analysis: analysis.value };
  }, setId);
}

async function order(win: Page, setId: number): Promise<string[]> {
  const set = await readSet(win, setId);
  return set.entries.entries.map((entry: { track: { title: string } }) => entry.track.title);
}

function setTable(win: Page) {
  return win.getByRole("table", { name: "Set entries" });
}

/** A Set row by its title; a heading's title cell is its chapter's name. */
function row(win: Page, title: string, nth = 0) {
  return setTable(win)
    .locator(".track-table__row")
    .filter({ has: win.locator('[data-column="title"]', { hasText: new RegExp(`^(⚠ )?${title}$`) }) })
    .nth(nth);
}

/** Where a person clicks: the visible left part of the row, nothing scrolled first. */
async function at(win: Page, target: ReturnType<typeof row>, button: "left" | "right" = "left", clicks = 1) {
  const box = (await target.boundingBox())!;
  await win.mouse.click(box.x + 60, box.y + box.height / 2, { button, clickCount: clicks });
}

async function menu(win: Page, name: string) {
  await win.getByRole("menu").getByRole("menuitem", { name, exact: true }).click();
}

function inspector(win: Page) {
  return win.getByRole("complementary", { name: "Track inspector" });
}

function facts(win: Page) {
  return win.locator(".prepare-header__facts");
}

function startsOf(win: Page, title: string, nth = 0) {
  return row(win, title, nth).locator('[data-column="starts_at"]');
}

test.describe("the whole of Phase 10 (PREP-12)", () => {
  test.describe.configure({ timeout: 300_000 });

  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-journey-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  test("a Set prepared, played, saved, exported, reopened and warned about", async () => {
    let app = await launch(userDataDir, cuepointHome);
    try {
      let win = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(win);
      await win.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));

      // --- the library and a Collection with a repeat, through the bridge ------
      const xml = writeLibrary(workspace);
      const xmlBytes = readFileSync(xml);
      const started = await win.evaluate((file) => (window as never as Bridge).cuepoint.startLibraryImport({ xml_path: file }), xml);
      await finished(win, started.job_id);
      // Keys come from corrections or accepted matches, not Rekordbox (PAGES-15): type each one.
      await win.evaluate(async () => {
        const c = (window as never as Bridge).cuepoint;
        for (const track of (await c.browseLibrary({ limit: 50 })).tracks) {
          if (track.key) await c.setTrackOverrides({ trackId: track.id, key: track.key });
        }
      });
      await win.evaluate(async () => {
        const c = (window as never as Bridge).cuepoint;
        const ids: Record<string, number> = {};
        for (const track of (await c.browseLibrary({ limit: 50 })).tracks) ids[track.title] = track.id;
        const gigs = (await c.createCollection({ kind: "folder", name: "Gigs" })).collection.id;
        const crate = (await c.createCollection({ kind: "collection", name: "Crate", parent_id: gigs })).collection.id;
        await c.addTracksToCollection({
          collection_id: crate,
          track_ids: ["Warm One", "Warm Two", "Build", "Peak Jump", "Close"].map((t) => ids[t]),
        });
        await c.insertTrackInCollection({ collection_id: crate, track_id: ids["Warm One"], position: 5 });
      });
      await win.reload();
      await win.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
      await win.evaluate(async () => {
        const player = (window as never as Bridge).cuepoint.player;
        await player.setVolume(0);
      });

      // --- 1. a Set from the Collection ------------------------------------------
      await win.getByRole("link", { name: "Prepare", exact: true }).click();
      await win.getByRole("button", { name: "New Set from…" }).click();
      const source = win.getByRole("dialog", { name: "New Set from…" });
      await source.getByRole("combobox", { name: "Copy the tracks of" }).selectOption({ label: "Crate" });
      await source.getByRole("button", { name: "Continue…" }).click();
      const naming = win.getByRole("dialog", { name: "New Set from “Crate”" });
      await naming.getByRole("textbox", { name: "Name" }).fill("Friday");
      await naming.getByRole("combobox", { name: "In" }).selectOption({ label: "Gigs" });
      await naming.getByRole("button", { name: "Make the Set" }).click();
      await expect(win).toHaveURL(/#\/prepare\/\d+$/, { timeout: 30_000 });
      const setId = Number(/#\/prepare\/(\d+)$/.exec(win.url())![1]);
      await expect(row(win, "Close")).toBeVisible({ timeout: 30_000 });
      expect(await order(win, setId)).toEqual(["Warm One", "Warm Two", "Build", "Peak Jump", "Close", "Warm One"]);

      // --- 2. three chapters, one with a target and a range ------------------------
      await at(win, row(win, "Build"), "right");
      await menu(win, "Start a chapter here");
      await expect(row(win, "Chapter 2")).toBeVisible({ timeout: 15_000 });
      await at(win, row(win, "Close"), "right");
      await menu(win, "Start a chapter here");
      await expect(row(win, "Chapter 3")).toBeVisible({ timeout: 15_000 });
      await at(win, row(win, "Chapter 1"), "right");
      await menu(win, "Rename, targets and notes…");
      const chapter = win.getByRole("dialog", { name: "Chapter “Chapter 1”" });
      await chapter.getByRole("textbox", { name: "Name" }).fill("Warm-up");
      await chapter.getByRole("textbox", { name: "Target length" }).fill("8:00");
      await chapter.getByRole("textbox", { name: "Lowest BPM" }).fill("120");
      await chapter.getByRole("textbox", { name: "Highest BPM" }).fill("127");
      await chapter.getByRole("button", { name: "Save" }).click();
      await expect(row(win, "Warm-up")).toContainText("0:00 of 8:00", { timeout: 15_000 });
      const plan2 = (await readSet(win, setId)).plan;
      expect(plan2.chapters.map((c: { name: string }) => c.name)).toEqual(["Warm-up", "", ""]);
      expect([plan2.chapters[0].target_seconds, plan2.chapters[0].bpm_min, plan2.chapters[0].bpm_max]).toEqual([480, 120, 127]);
      // The Set's own notes, from the header's facts line.
      await win.getByRole("button", { name: "Notes…" }).click();
      const notes = win.getByRole("dialog", { name: "Notes for “Friday”" });
      await notes.getByLabel("Notes").fill("The Loft, 23:00 to 01:00");
      await notes.getByRole("button", { name: "Save" }).click();
      await expect(notes).toBeHidden({ timeout: 15_000 });
      await expect(win.getByRole("button", { name: "Notes…" })).toHaveAttribute("title", "The Loft, 23:00 to 01:00");
      expect((await readSet(win, setId)).plan.notes).toBe("The Loft, 23:00 to 01:00");

      // --- 3. times, a reorder, and the running time and "Starts" moving ------------
      async function time(title: string, inTime: string, outTime: string) {
        await at(win, row(win, title));
        const zone = inspector(win).getByRole("region", { name: "In this Set" });
        await expect(zone).toBeVisible({ timeout: 15_000 });
        await zone.getByRole("textbox", { name: "In", exact: true }).fill(inTime);
        const out = zone.getByRole("textbox", { name: "Out", exact: true });
        await out.fill(outTime);
        await out.press("Enter");
      }
      await time("Warm One", "0:30", "4:30");
      await expect(facts(win)).toContainText("4:00 planned · 5 untimed", { timeout: 15_000 });
      await time("Warm Two", "", "5:00");
      await expect(facts(win)).toContainText("9:00 planned · 4 untimed", { timeout: 15_000 });
      await expect(startsOf(win, "Build")).toHaveText("9:00");
      await expect(startsOf(win, "Warm Two")).toHaveText("4:00");
      // Warm Two dragged above Warm One: it opens now, and Warm One starts at 5:00.
      await row(win, "Warm Two").dragTo(row(win, "Warm One"), {
        sourcePosition: { x: 60, y: 8 },
        targetPosition: { x: 60, y: 4 },
      });
      await expect(startsOf(win, "Warm One")).toHaveText("5:00", { timeout: 15_000 });
      await expect(startsOf(win, "Warm Two")).toHaveText("0:00");
      await expect(startsOf(win, "Build")).toHaveText("9:00");
      expect((await order(win, setId)).slice(0, 2)).toEqual(["Warm Two", "Warm One"]);

      // --- 4. a gap from Suggestions, and a key warning accepted -------------------
      await at(win, row(win, "Warm Two"));
      const panel = win.getByRole("region", { name: "Add to the Set" });
      await expect(panel.getByRole("status", { name: /^Insert: Between “Warm Two” and “Warm One”/ })).toBeVisible();
      const suggestion = win.getByRole("table", { name: "Suggestions" }).locator(".track-table__row").first();
      await expect(suggestion).toBeVisible({ timeout: 30_000 });
      const suggested = ((await suggestion.locator('[data-column="title"]').textContent()) ?? "").replace("↻", "").trim();
      await at(win, suggestion);
      await panel.getByRole("button", { name: "Insert here" }).click();
      await expect(win.getByText(`Inserted “${suggested}” into “Friday”.`)).toBeVisible({ timeout: 15_000 });
      expect((await order(win, setId)).slice(0, 3)).toEqual(["Warm Two", suggested, "Warm One"]);

      await at(win, row(win, "Peak Jump"));
      const zone = inspector(win).getByRole("region", { name: "In this Set" });
      const clash = zone.getByRole("listitem").filter({ hasText: /Keys clash/ });
      await clash.getByRole("button", { name: "Acknowledge" }).click();
      await expect(facts(win)).toContainText("1 accepted", { timeout: 15_000 });
      await expect(clash.getByRole("button", { name: "Withdraw" })).toBeVisible();
      expect((await readSet(win, setId)).analysis.acknowledged).toBe(1);

      // --- 5. played from the third entry, the repeat in the queue ------------------
      const running = await order(win, setId);
      await at(win, row(win, running[2]), "left", 2);
      await expect
        .poll(async () =>
          win.evaluate(async () => (await (window as never as Bridge).cuepoint.player.getState()).queue.currentItem?.title ?? null),
        { timeout: 30_000 })
        .toBe(running[2]);
      const queue = await win.evaluate(async () => {
        const page = await (window as never as Bridge).cuepoint.player.queueWindow(0, 50);
        return page.items.map((item: { title: string }) => item.title);
      });
      expect(queue).toEqual(running);
      expect(queue.filter((title: string) => title === "Warm One")).toHaveLength(2);
      await win.evaluate(() => (window as never as Bridge).cuepoint.player.stop());

      // --- 6. set lists: text, CSV, M3U8, and copied ----------------------------------
      const lists = path.join(workspace, "lists");
      mkdirSync(lists);
      for (const [extension, form] of [
        ["txt", "a text"],
        ["csv", "a CSV"],
        ["m3u8", "an M3U8"],
      ] as const) {
        const file = path.join(lists, `Friday.${extension}`);
        await saveDialogAnswers(app, file);
        await win.getByRole("button", { name: "Export ▾" }).click();
        await menu(win, "Save set list…");
        await expect(win.getByText(new RegExp(`^Saved “Friday” as ${form} set list`))).toBeVisible({ timeout: 15_000 });
        expect(existsSync(file)).toBe(true);
      }
      const m3u8 = readFileSync(path.join(lists, "Friday.m3u8"), "utf-8");
      expect(m3u8.split("\n").filter((line) => line.endsWith("1.mp3"))).toHaveLength(2);
      await win.getByRole("button", { name: "Export ▾" }).click();
      await menu(win, "Copy set list");
      await expect(win.getByText("Copied the set list for “Friday”.")).toBeVisible({ timeout: 15_000 });
      const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
      // Windows' clipboard holds text with CRLF line ends, which Chromium writes
      // for any text put on it; the lines are what must match the file.
      expect(copied.replace(/\r\n/g, "\n")).toBe(
        readFileSync(path.join(lists, "Friday.txt"), "utf-8"),
      );

      // --- 7. exported to Rekordbox with the Set ticked ---------------------------------
      const exported = path.join(workspace, "out", "CuePoint Export.xml");
      mkdirSync(path.dirname(exported));
      await saveDialogAnswers(app, exported);
      await win.getByRole("button", { name: "Export ▾" }).click();
      await menu(win, "Export to Rekordbox…");
      const dialog = win.getByRole("dialog", { name: "Export to Rekordbox" });
      await expect(dialog.getByRole("checkbox", { name: /^Friday/ })).toBeChecked({ timeout: 30_000 });
      await expect(dialog.getByRole("list", { name: "Playlists to add" })).toContainText("7 tracks", { timeout: 30_000 });
      await dialog.getByRole("button", { name: "Choose…" }).click();
      await dialog.getByRole("button", { name: /^Export .*1 playlist$/ }).click();
      await dialog.getByRole("button", { name: "Done" }).click({ timeout: 60_000 });
      const written = readFileSync(exported, "utf-8");
      const friday = /<NODE Name="Friday" Type="1"[^>]*>([\s\S]*?)<\/NODE>/.exec(written);
      expect(friday).not.toBeNull();
      expect(friday![1].match(/<TRACK Key=/g)).toHaveLength(7);
      for (const kept of ["Warm-up", "8:00", "4:30", "The Loft"]) expect(written).not.toContain(kept);
      expect(readFileSync(xml).equals(xmlBytes)).toBe(true);

      // --- 8. a relaunch onto the Set, all of it intact --------------------------------
      const before = await readSet(win, setId);
      await app.close();
      app = await launch(userDataDir, cuepointHome);
      win = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(win);
      await expect(win).toHaveURL(new RegExp(`#/prepare/${setId}$`), { timeout: 30_000 });
      await expect(row(win, "Warm-up")).toBeVisible({ timeout: 30_000 });
      await expect(facts(win)).toContainText("1 accepted");
      await expect(win.getByRole("button", { name: "Notes…" })).toHaveAttribute("title", "The Loft, 23:00 to 01:00");
      expect(await readSet(win, setId)).toEqual(before);

      // --- 9. a refresh that deletes one of its tracks ---------------------------------
      writeLibrary(workspace, (id) => id !== 3);
      const later = statSync(xml).mtime.getTime() / 1000 + 5;
      utimesSync(xml, later, later);
      await win.getByRole("link", { name: "Library", exact: true }).click();
      await win.getByRole("button", { name: /Check Rekordbox for changes/i }).click();
      const preview = win.getByRole("dialog");
      await expect(preview.getByTestId("count-removed")).toHaveText("1", { timeout: 60_000 });
      await expect(preview).toContainText("1 in 1 Set");
      await expect(preview).toContainText("1 in 1 Collection");
    } finally {
      await app.close();
    }
  });

  test("a Set made from a Library selection keeps the table's order, not the clicks'", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const win = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(win);
      await win.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
      const xml = writeLibrary(workspace);
      const started = await win.evaluate((file) => (window as never as Bridge).cuepoint.startLibraryImport({ xml_path: file }), xml);
      await finished(win, started.job_id);
      await win.reload();
      await win.locator("main.app-main .screen").waitFor({ timeout: 30_000 });

      await win.getByRole("link", { name: "Library", exact: true }).click();
      const table = win.getByRole("table", { name: "Library tracks" });
      const titled = (title: string) =>
        table.locator('[role="row"][data-index]').filter({
          has: win.locator('[data-column="title"]', { hasText: new RegExp(`^${title}$`) }),
        });
      await expect(titled("Peak Jump")).toBeVisible({ timeout: 30_000 });
      const shown = await table.locator('[role="row"][data-index] [data-column="title"]').allTextContents();
      const picked = ["Peak Jump", "Warm Two", "Close"];
      // Clicked in an order the table does not show them in.
      await titled(picked[0]).click();
      await titled(picked[1]).click({ modifiers: ["ControlOrMeta"] });
      await titled(picked[2]).click({ modifiers: ["ControlOrMeta"] });
      await expect(win.locator(".cp-selection-actions__count")).toHaveText("3 tracks selected");
      await titled(picked[2]).click({ button: "right" });
      await win.getByRole("menuitem", { name: "New Set from the selection…" }).click();

      const dialog = win.getByRole("dialog", { name: "New Set from the 3 selected tracks" });
      await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("New Set");
      await dialog.getByRole("textbox", { name: "Name" }).fill("Picked");
      await dialog.getByRole("button", { name: "Make the Set" }).click();
      await expect(win.getByText("Made the Set “Picked” with 3 entries.")).toBeVisible({ timeout: 15_000 });

      const made = await win.evaluate(async () => {
        const c = (window as never as Bridge).cuepoint;
        const node = (await c.getCollections()).collections.find((n: { name: string; kind: string }) => n.name === "Picked");
        const entries = await c.sets.entries({ set_id: node.id });
        return { kind: node.kind, titles: entries.value.entries.map((e: { track: { title: string } }) => e.track.title) };
      });
      expect(made.kind).toBe("set");
      expect(made.titles).toEqual(shown.map((title) => title.trim()).filter((title) => picked.includes(title)));
      expect(made.titles).not.toEqual(picked);
    } finally {
      await app.close();
    }
  });
});
