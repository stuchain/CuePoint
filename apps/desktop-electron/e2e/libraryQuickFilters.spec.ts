/**
 * The quick filters, and saving a view that keeps its playlist (PAGES-05B).
 *
 * Opens a playlist, narrows it with the Key / BPM buttons in the filter row,
 * sees the chip, saves the result as a Smart Collection, and reopens it with
 * the playlist still part of the rule.
 *
 * KEY: a CuePoint key is the user's own, else the accepted Beatport match's, and
 * Rekordbox's key is never used (DEC-201). This spec has no Beatport source, so
 * it sets the user's own key (8A) on two Warmup tracks through the bridge, which
 * counts as the resolved key, and drives Key ▾ -> 8A. A second test checks the filter row's layout at a
 * 1280x800 window.
 */
import {
  test,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";
import { pressFilterRowAction } from "./filterRow";
import { launchElectron } from "./support/launchApp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");


interface TrackSpec {
  id: number;
  bpm: number;
  genre: string;
  artist: string;
}

function writeExport(dir: string, tracks: TrackSpec[], name = "collection.xml"): string {
  const entries = tracks
    .map(
      (track) =>
        `<TRACK TrackID="${track.id}" Name="Track ${track.id}" Artist="${track.artist}" ` +
        `Genre="${track.genre}" Tonality="8A" AverageBpm="${track.bpm}.00" Year="2024" ` +
        `TotalTime="360" BitRate="320" Rating="204" PlayCount="3" ` +
        `Album="Album ${track.id}" Label="Label" Comment="note ${track.id}" ` +
        `Location="file://localhost/m/${track.id}.mp3"/>`,
    )
    .join("\n");

  // The playlist is deliberately not in id order: a set list is an order, and
  // "opens as arranged" has to be distinguishable from "opens sorted".
  const members = [tracks[4], tracks[1], tracks[7], tracks[0]]
    .filter(Boolean)
    .map((track) => `<TRACK Key="${track!.id}"/>`)
    .join("");

  const file = path.join(dir, name);
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${tracks.length}">
${entries}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0">
    <NODE Name="Warmup" Type="1" Entries="4">${members}</NODE>
  </NODE></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return file;
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: cuepointHome,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;

  return launchElectron({
    cwd: DESKTOP_ROOT,
    args: [".", `--user-data-dir=${userDataDir}`],
    env,
  });
}

async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  // A desk-sized window. The default in a headless run is small enough that
  // the playlist pane, filter bar and selection strip take the whole height,
  // which is a layout question of its own and not what this test is asking.
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
  });
  await window.evaluate(() => ((localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.getItem("cuepoint-ui-lab-scale") === "1.25" && localStorage.removeItem("cuepoint-ui-lab-scale")), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
  await window.reload();
  await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
  return window;
}

async function openLibrary(window: Page) {
  await window.getByRole("link", { name: "Library" }).click();
  await expect(window.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
}

async function importCollection(window: Page, xmlPath: string) {
  const started = await window.evaluate(
    (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
    xmlPath,
  );
  await expect
    .poll(
      async () =>
        (await window.evaluate((id) => window.cuepoint!.getJob!(id), started.job_id))!.state,
      { timeout: 90_000 },
    )
    .toBe("succeeded");
  // The Library is home (DEC-100), so it is already open, and it reads the
  // library when it loads: an import made behind its back, through the bridge,
  // is seen on the next load — as it would be after a relaunch.
  await window.reload();
  await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
}


const TRACKS: TrackSpec[] = Array.from({ length: 12 }, (_, index) => ({
  id: index + 1,
  bpm: 120 + index + 1,
  genre: "House",
  artist: `Artist ${index + 1}`,
}));

async function visibleTitles(window: Page): Promise<string[]> {
  return window
    .locator('.track-table__row [data-column="title"]')
    .allInnerTexts()
    .then((values) => values.map((value) => value.trim()).filter(Boolean));
}

test.describe("Quick filters (PAGES-05B)", () => {
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

  test("filters an open playlist, saves it, and reopens it with the playlist kept", async () => {
    test.setTimeout(240_000);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await importCollection(window, writeExport(workspace, TRACKS));
      await openLibrary(window);
      await expect(window.getByTestId("library-track-count")).toContainText("12 tracks", {
        timeout: 30_000,
      });

      // Open the playlist: tracks 5, 2, 8 and 1 (BPM 125, 122, 128, 121).
      await window
        .getByRole("tree", { name: "Playlists" })
        .getByText("Warmup", { exact: true })
        .click();
      await expect
        .poll(async () => (await visibleTitles(window)).length, { timeout: 30_000 })
        .toBe(4);

      // The user's own key is the resolved key: tracks 5 and 2 are 8A.
      await window.evaluate(async () => {
        const c = window.cuepoint!;
        for (const trackId of await trackIdsOf(["Track 5", "Track 2"])) {
          await c.setTrackOverrides!({ trackId, key: "8A" });
        }
        async function trackIdsOf(titles: string[]): Promise<number[]> {
          const found = await c.browseLibrary!({ limit: 200 });
          return found.tracks
            .filter((track: { title: string }) => titles.includes(track.title))
            .map((track: { id: number }) => track.id);
        }
      });

      await window.locator(".cp-quick").getByRole("button", { name: /^Key\b/ }).click();
      // P8: the Key filter is a grid of chips; the tick is a hidden box inside the chip's label.
      await window.locator("label.cp-quick__key").filter({ has: window.getByRole("checkbox", { name: /^8A/ }) }).click();
      await window.keyboard.press("Escape");

      const chips = window.getByRole("list", { name: "Active filters" });
      await expect(chips).toContainText("8A", { timeout: 30_000 });
      await expect
        .poll(async () => (await visibleTitles(window)).sort(), { timeout: 30_000 })
        .toEqual(["Track 2", "Track 5"]);

      // Save it; the open playlist is added as an In playlist rule.
      await pressFilterRowAction(window, /Save as Smart Collection/i);
      const save = window.getByRole("dialog");
      await save.getByLabel("Name").fill("Warmup mid tempo");
      await save.getByRole("button", { name: "Save" }).click();
      await expect(save).toBeHidden({ timeout: 30_000 });

      const saved = await window.evaluate(async () => {
        const tree = await window.cuepoint!.getCollections!();
        return tree.collections.find(
          (node: { name: string }) => node.name === "Warmup mid tempo",
        )!;
      });
      expect(saved.kind).toBe("smart");
      const fields = (saved.rules as { rules: { field: string }[] }).rules.map((r) => r.field);
      expect(fields).toContain("in_playlist");
      expect(fields).toContain("key");

      // Leave, then reopen it from the Collections tree.
      await window
        .getByRole("tree", { name: "Everything" })
        .getByText("All tracks", { exact: true })
        .click();
      await window
        .getByRole("tree", { name: "Collections" })
        .getByText("Warmup mid tempo")
        .click();
      await expect
        .poll(async () => (await visibleTitles(window)).sort(), { timeout: 30_000 })
        .toEqual(["Track 2", "Track 5"]);
    } finally {
      await app.close();
    }
  });

  test("keeps the filter row on screen at 1280x800 and 1.5x, and at 2x and 3x", async () => {
    test.setTimeout(240_000);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setSize(1280, 800);
      });
      await importCollection(window, writeExport(workspace, TRACKS));
      await openLibrary(window);
      /** The widest row: the open playlist, a BPM chip and a Genre chip. */
      const narrow = async (withPlaylist: boolean) => {
        // At the largest sizes the playlist pane has no room; the row is then
        // measured with the chips alone.
        if (withPlaylist) {
          await window
            .getByRole("tree", { name: "Playlists" })
            .getByText("Warmup", { exact: true })
            .click();
          await expect
            .poll(async () => (await visibleTitles(window)).length, { timeout: 30_000 })
            .toBe(4);
        }

        // A BPM chip and a Genre chip beside the open playlist: the widest row.
        // At the largest sizes the window is a few hundred points tall and the
        // header overlaps the row, so the controls are pressed without a mouse.
        const press = (target: ReturnType<Page["locator"]>) =>
          withPlaylist ? target.click() : target.dispatchEvent("click");
        // W1: a row too narrow for Key, BPM and Genre folds them into one Filters menu.
        const quick = async (name: RegExp) => {
          const direct = window.locator(".cp-quick").getByRole("button", { name });
          if (await direct.count()) return press(direct);
          await press(window.locator(".cp-quick").getByRole("button", { name: /^Filters/ }));
          await press(window.getByRole("menuitem", { name }));
        };
        await quick(/^BPM\b/);
        const bpm = window.getByRole("dialog", { name: "BPM" });
        await bpm.getByLabel("From").fill("121");
        await bpm.getByLabel("To").fill("128");
        await press(bpm.getByRole("button", { name: "Apply" }));
        await quick(/^Genre\b/);
        await press(window.getByRole("checkbox", { name: /^House/ }));
        await window.keyboard.press("Escape");
        await expect(
          window.getByRole("list", { name: "Active filters" }),
        ).toContainText("Genre", { timeout: 30_000 });
      };
      await narrow(true);
      const chips = window.getByRole("list", { name: "Active filters" });

      /** Whether the box is inside the window, left and right. */
      const inside = async (locator: ReturnType<Page["locator"]>) => {
        const box = await locator.boundingBox();
        const width = await window.evaluate(() => document.documentElement.clientWidth);
        return box !== null && box.x >= 0 && box.x + box.width <= width + 1;
      };
      const reachable = async () => {
        const first = chips.getByRole("listitem").first();
        const more = window.locator(".cp-filter-bar__chips-wrap").getByRole("button", { name: /^Show (all|less)/ });
        const seen = (await inside(first)) || ((await more.count()) > 0 && (await inside(more)));
        expect(seen, "the first chip or +N more is on screen").toBe(true);
        // On the row, or in the menu the row folds them into (W1): More, or Filters past that.
        for (const name of [/Save as Smart Collection/, /^Select all$/]) {
          const button = window.getByRole("button", { name });
          const menu = window.locator(".library-screen .cp-filter-bar__row").getByRole("button", { name: /^(More|Filters)/ });
          const shown = (await button.count()) > 0 ? button : menu.last();
          expect(await inside(shown), `${name} or the menu holding it is on screen`).toBe(true);
        }
      };

      expect(
        await window.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--scale").trim()),
      ).toBe("1.5");
      await reachable();

      for (const scale of [2, 3]) {
        await window.evaluate((value) => localStorage.setItem("cuepoint-ui-lab-scale", String(value)), scale);
        await window.reload();
        await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
        await openLibrary(window);
        await narrow(false);
        const spill = await window.evaluate(() => {
          const screen = [...document.querySelectorAll<HTMLElement>("main.app-main .screen")].find((el) => el.getClientRects().length > 0)!;
          return Math.max(
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
            screen.scrollWidth - screen.clientWidth,
          );
        });
        expect(spill, `the Library does not scroll sideways at ${scale}×`).toBeLessThanOrEqual(0);
      }
    } finally {
      await app.close();
    }
  });
});
