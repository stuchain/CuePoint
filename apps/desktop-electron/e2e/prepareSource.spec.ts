/**
 * The Prepare page's source panel and lanes, end to end (PREP-11).
 *
 * The real app over the real engine: a Set of ten tracks with a tempo jump in
 * it, beside a library of thirty. It fills a gap from Suggestions with "Insert
 * here" and sees the selection follow what went in; asks for each side's own
 * list at a gap nothing bridges; drags a track from the Library tab onto the
 * Set; clicks a lane's column to select its entry; and reloads onto the tab and
 * the lanes it left open. Every check reads the Set back from the engine,
 * because what the page drew is not what was written.
 *
 * Pointer gestures go where a person would put them: a row is clicked on its
 * visible part, never scrolled into view by Playwright first (PREP-10's spec).
 *
 * `CUEPOINT_E2E_EXECUTABLE` runs it against a packaged build.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const TONE = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio", "tone.mp3");

type Bridge = Record<string, any>;

/** Ten tracks in the Set; a jump into track 5 that nothing in the library bridges. */
const SET_TRACKS = 10;
const LIBRARY_TRACKS = 30;

function bpmOf(i: number): number {
  if (i === 5) return 150;
  return 122 + (i % 7);
}

function keyOf(i: number): string {
  if (i === 5) return "3B";
  return `${(i % 4) + 7}${i % 2 ? "A" : "B"}`;
}

const location = (file: string) => "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");

function writeLibrary(dir: string): string {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const tracks: string[] = [];
  const keys: string[] = [];
  for (let i = 1; i <= LIBRARY_TRACKS; i += 1) {
    const name = `Track ${String(i).padStart(2, "0")}`;
    const file = path.join(music, `${String(i).padStart(2, "0")}.mp3`);
    copyFileSync(TONE, file);
    tracks.push(
      `<TRACK TrackID="${i}" Name="${name}" Artist="Artist ${i}" Genre="House" ` +
        `Tonality="${keyOf(i)}" AverageBpm="${bpmOf(i).toFixed(2)}" TotalTime="300" Location="${location(file)}"/>`,
    );
    if (i <= SET_TRACKS) keys.push(`<TRACK Key="${i}"/>`);
  }
  const xml = path.join(dir, "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.8.5" Company="AlphaTheta"/>
  <COLLECTION Entries="${LIBRARY_TRACKS}">
${tracks.join("\n")}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="Friday" Type="1" KeyType="0" Entries="${SET_TRACKS}">${keys.join("")}</NODE>
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

/** The Set's running order as the engine has it: each entry's title, in order. */
async function runningOrder(win: Page, setId: number): Promise<{ id: number; title: string }[]> {
  return win.evaluate(async (id) => {
    const answer = await (window as never as Bridge).cuepoint.sets.entries({ set_id: id });
    return answer.value.entries.map((entry: { entry_id: number; track: { title: string } }) => ({
      id: entry.entry_id,
      title: entry.track.title,
    }));
  }, setId);
}

/** A table's row by the title it shows. */
function rowTitled(win: Page, table: string, title: string) {
  return win
    .getByRole("table", { name: table })
    .locator(".track-table__row")
    .filter({ has: win.locator(`[data-column="title"]`, { hasText: title }) })
    .first();
}

/** Click a row where a person would: its visible left part, nothing scrolled first. */
async function clickRow(win: Page, row: ReturnType<typeof rowTitled>) {
  const box = (await row.boundingBox())!;
  await win.mouse.click(box.x + 40, box.y + box.height / 2);
}

function point(win: Page) {
  return win.getByRole("region", { name: "Add to the Set" }).getByRole("status", { name: /^Inserting: / });
}

test.describe("the Prepare page's source panel and lanes (PREP-11)", () => {
  test.describe.configure({ timeout: 300_000 });

  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-source-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  test("fills a Set from Suggestions and the library, and draws its shape", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const win = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(win);
      await win.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));

      const started = await win.evaluate(
        (xml) => (window as never as Bridge).cuepoint.startLibraryImport({ xml_path: xml }),
        writeLibrary(workspace),
      );
      await finished(win, started.job_id);
      // Keys come from corrections or accepted matches, not Rekordbox (PAGES-15): type each one.
      await win.evaluate(async () => {
        const c = (window as never as Bridge).cuepoint;
        for (const track of (await c.browseLibrary({ limit: 200 })).tracks) {
          if (track.key) await c.setTrackOverrides({ trackId: track.id, key: track.key });
        }
      });
      const setId: number = await win.evaluate(async () => {
        const c = (window as never as Bridge).cuepoint;
        const friday = (await c.getLibraryPlaylists()).playlists.find((node: { name: string }) => node.name === "Friday");
        const made = await c.sets.createFrom({ source: { kind: "playlist", id: friday.id } });
        const id = made.value.set.id;
        const entries = (await c.sets.plan({ set_id: id })).value.entries;
        await c.sets.splitChapter({ entry_id: entries[6].entry_id, name: "Peak" });
        return id;
      });

      await win.reload();
      await win.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
      await win.getByRole("link", { name: "Prepare", exact: true }).click();
      await expect(win).toHaveURL(new RegExp(`#/prepare/${setId}$`), { timeout: 30_000 });
      await expect(win.getByRole("table", { name: "Set entries" })).toBeVisible({ timeout: 30_000 });

      // --- the end of the Set, with nothing selected ----------------------------
      await expect(point(win)).toHaveAccessibleName("Inserting: after “Track 10”, at the end of the Set, in Peak");

      // --- a gap from Suggestions, and the selection follows what went in ------
      await clickRow(win, rowTitled(win, "Set entries", "Track 02"));
      await expect(point(win)).toHaveAccessibleName(/^Inserting: between “Track 02” and “Track 03”/);
      const suggestions = win.getByRole("table", { name: "Suggestions" }).locator(".track-table__row");
      await expect(suggestions.first()).toBeVisible({ timeout: 30_000 });
      const first = suggestions.first();
      const title = ((await first.locator('[data-column="title"]').textContent()) ?? "").replace("↻", "").trim();
      await clickRow(win, first);
      await win.getByRole("button", { name: "Insert here" }).click();
      await expect(win.getByText(`Inserted “${title}” into “Friday”.`)).toBeVisible({ timeout: 15_000 });
      await expect.poll(async () => (await runningOrder(win, setId)).map((entry) => entry.title).slice(0, 4)).toEqual([
        "Track 01",
        "Track 02",
        title,
        "Track 03",
      ]);
      await expect(point(win)).toHaveAccessibleName(new RegExp(`^Inserting: between “${title}” and “Track 03”`));

      // --- a gap nothing bridges, and each side's own list ----------------------
      await clickRow(win, rowTitled(win, "Set entries", "Track 04"));
      const panel = win.getByRole("region", { name: "Add to the Set" });
      await expect(panel.getByText(/Nothing fits between “Track 04” \(126 BPM\) and “Track 05” \(150 BPM\)/)).toBeVisible({
        timeout: 30_000,
      });
      await panel.getByRole("button", { name: "Fit before “Track 05”" }).click();
      await expect(panel.getByText("Fitting before “Track 05” only")).toBeVisible({ timeout: 30_000 });
      await panel.getByRole("button", { name: "Fit both sides" }).click();
      await expect(panel.getByRole("button", { name: "Fit after “Track 04”" })).toBeVisible({ timeout: 30_000 });

      // --- the Library tab: a search, and a drag onto the Set ------------------
      await panel.getByRole("tab", { name: "Library" }).click();
      await panel.getByRole("searchbox", { name: "Search" }).fill("Track 21");
      // The search waits for typing to stop, so the whole library shows first: drag
      // only once the list has narrowed, or the rows move under the pointer.
      const libraryRows = win.getByRole("table", { name: "Library tracks to add" }).locator(".track-table__row");
      await expect(libraryRows).toHaveCount(1, { timeout: 30_000 });
      const found = rowTitled(win, "Library tracks to add", "Track 21");
      await expect(found).toBeVisible({ timeout: 30_000 });
      const target = rowTitled(win, "Set entries", "Track 07");
      await found.dragTo(target, { sourcePosition: { x: 30, y: 8 }, targetPosition: { x: 30, y: 4 } });
      await expect(win.getByText("Inserted 1 track into “Friday”.")).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(async () => {
          const order = (await runningOrder(win, setId)).map((entry) => entry.title);
          return order.slice(order.indexOf("Track 07") - 1, order.indexOf("Track 07") + 1);
        })
        .toEqual(["Track 21", "Track 07"]);

      // --- the lanes: open, and a column selects its entry -----------------------
      await win.getByRole("button", { name: "View ▾" }).click();
      await win.getByRole("menuitem", { name: "Show tempo and key lanes" }).click();
      const lanes = win.getByRole("group", { name: "Tempo and key lanes" });
      await expect(lanes).toBeVisible();
      await expect(lanes.locator('[data-relation="clash"]').first()).toBeAttached();
      const order = await runningOrder(win, setId);
      const ninth = order.find((entry) => entry.title === "Track 09")!;
      await lanes.locator(`[data-entry="${ninth.id}"]`).click();
      const inspector = win.getByRole("complementary", { name: "Track details" });
      await expect(inspector.getByText(`Entry ${order.indexOf(ninth) + 1}, in Peak`)).toBeVisible({ timeout: 15_000 });
      await expect(point(win)).toHaveAccessibleName(/^Inserting: between “Track 09” and “Track 10”, in Peak$/);

      // --- a reload keeps the tab and the lanes -------------------------------------
      await win.reload();
      await expect(win.getByRole("table", { name: "Set entries" })).toBeVisible({ timeout: 30_000 });
      await expect(win.getByRole("group", { name: "Tempo and key lanes" })).toBeVisible();
      await expect(
        win.getByRole("region", { name: "Add to the Set" }).getByRole("tab", { name: "Library" }),
      ).toHaveAttribute("aria-selected", "true");
    } finally {
      await app.close();
    }
  });
});
