/**
 * Every action that earns a visible place has one, and it works from the keyboard (PAGES-13).
 *
 * `PHASE14_FLOWS.md`'s "FLW-1 as narrowed" table lists the actions a DJ reaches for often
 * and where each sits as a labelled button or a visible menu. This walks the table row by
 * row in the running app: the control is reached with Tab and the arrow keys (never a
 * right-click, never the menu bar), used with Enter, Space or F2, and its effect is read
 * back from the engine, the clipboard or the page. The second half is FLW-2: each function
 * that can be done from several places has one home, and the other places link to it.
 *
 * If a row's control cannot be reached, or does nothing, its test fails. Nothing here is
 * skipped to hide that; the two skips are the player's own (the two tests that need audio),
 * as in the other player specs.
 *
 * What a test selects first is chosen with the keyboard where the app has a key for it: the
 * trees of Collections, Sets and playlists take the arrow keys, then Enter or Space. The track
 * tables (the Library, a Set, Similar tracks) have no key that selects a row: Tab reaches the
 * table and Enter or F2 act on the row already chosen, but nothing moves the choice by
 * keyboard, so those tests choose their rows with a click and say so where they do (`pick`,
 * `pickEntry`). The action under test is always the one reached with the keyboard.
 *
 * One app runs for the whole file (the library is the same for every row), and each test
 * starts by going to the page it needs, so a failure in one row does not hide the next.
 * `CUEPOINT_HOME` and `--user-data-dir` are temporary directories: the real library is
 * never read or written.
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Locator,
  type Page,
} from "@playwright/test";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { waitForEngine } from "./engineReady";
import { NO_PLAYER, hasPlayer } from "./playerAvailable";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const TONE = path.resolve(DESKTOP_ROOT, "../../src/tests/fixtures/audio/tone.mp3");

type Bridge = Record<string, any>;

/** id, title, BPM, key. Keys are typed by the DJ (Beatport's key is the only other source). */
const TRACKS: [number, string, number, string][] = [
  [1, "Warm One", 124, "8A"],
  [2, "Warm Two", 125, "9A"],
  [3, "Build", 126, "8A"],
  [4, "Peak Jump", 128, "8B"],
  [5, "Close", 124.5, "8A"],
  [6, "Bridge Spare", 124.8, "9A"],
  [7, "Other Spare", 123, "8A"],
];

const fileUrl = (file: string) => "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");

function writeLibrary(dir: string): string {
  const music = path.join(dir, "music");
  mkdirSync(music, { recursive: true });
  const rows = TRACKS.map(([id, title, bpm, key]) => {
    const file = path.join(music, `${id}.mp3`);
    if (!existsSync(file)) copyFileSync(TONE, file);
    return (
      `<TRACK TrackID="${id}" Name="${title}" Artist="Ada" Genre="House" Tonality="${key}" ` +
      `AverageBpm="${bpm.toFixed(2)}" TotalTime="300" Location="${fileUrl(file)}"/>`
    );
  });
  const members = (ids: number[]) => ids.map((id) => `<TRACK Key="${id}"/>`).join("");
  const xml = path.join(dir, "collection.xml");
  writeFileSync(
    xml,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.8.5" Company="AlphaTheta"/>
  <COLLECTION Entries="${rows.length}">
${rows.join("\n")}
  </COLLECTION>
  <PLAYLISTS><NODE Type="0" Name="ROOT" Count="2">
    <NODE Name="Warmup" Type="1" Entries="3">${members([1, 2, 3])}</NODE>
    <NODE Name="Peak" Type="1" Entries="2">${members([3, 4])}</NODE>
  </NODE></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return xml;
}

// ------------------------------------------------------------------ seeding

function python(): string {
  if (process.env.CUEPOINT_PYTHON) return process.env.CUEPOINT_PYTHON;
  const root = path.resolve(DESKTOP_ROOT, "../..");
  const local =
    process.platform === "win32"
      ? path.join(root, ".venv", "Scripts", "python.exe")
      : path.join(root, ".venv", "bin", "python");
  // CI installs the engine's packages into the runner's own Python, with no .venv.
  if (existsSync(local)) return local;
  return process.platform === "win32" ? "python" : "python3";
}

/** The rows the matcher writes when it accepts a candidate, for one track, as a test needs them. */
const SEED_MATCH = `
import json, sys
from cuepoint.services import interfaces
from cuepoint.services.bootstrap import bootstrap_services
from cuepoint.utils.di_container import get_container

bootstrap_services()
container = get_container()
tracks = container.resolve(interfaces.ITrackRepository)
database = container.resolve(interfaces.IDatabaseService)
title, genre = sys.argv[1], sys.argv[2]
track_id = {t.title: t.id for t in tracks.list_all()}[title]
with database.transaction(join_existing=True) as conn:
    attempt = conn.execute(
        "INSERT INTO match_attempts (track_id, started_at, finished_at, outcome, input_json)"
        " VALUES (?, 't', 't', 'matched', '{}')", (track_id,)).lastrowid
    candidate = conn.execute(
        "INSERT INTO match_candidates (attempt_id, rank, beatport_track_id, url, genre, score,"
        " guard_ok, is_winner) VALUES (?, 0, ?, ?, ?, 96, 1, 1)",
        (attempt, f"bp{track_id}", f"https://www.beatport.com/track/t/{track_id}", genre)).lastrowid
    conn.execute(
        "INSERT OR REPLACE INTO track_match (track_id, state, decided_by, attempt_id,"
        " candidate_id, decided_at) VALUES (?, 'accepted', 'auto', ?, ?, 't')",
        (track_id, attempt, candidate))
`;

function seedAcceptedMatch(cuepointHome: string, title: string, values: { genre: string }) {
  execFileSync(python(), ["-c", SEED_MATCH, title, values.genre], {
    env: { ...process.env, CUEPOINT_HOME: cuepointHome, PYTHONPATH: path.resolve(DESKTOP_ROOT, "../../src") },
    stdio: "inherit",
  });
}

// ------------------------------------------------------------------ keyboard

/** Whether the element is the one with focus. */
const isFocused = (handle: NonNullable<Awaited<ReturnType<Locator["elementHandle"]>>>) =>
  handle.evaluate((element) => element === document.activeElement);

/**
 * Reach a control the way a keyboard user does: Tab through the page, and the arrow keys
 * along a toolbar, down a tree (which Tab enters once each) or between radio buttons. Fails,
 * naming the control, if it is not reached.
 */
async function reach(win: Page, target: Locator, what: string, max = 200) {
  const handle = await target.elementHandle({ timeout: 15_000 });
  if (!handle) throw new Error(`${what} is not on the page`);
  for (let presses = 0; presses < max; presses += 1) {
    if (await isFocused(handle)) return;
    const where = await handle.evaluate((element) => {
      const active = document.activeElement;
      const bar = element.closest('[role="toolbar"]');
      const group = (node: Element | null) => (node instanceof HTMLInputElement && node.type === "radio" ? node.name : null);
      const radio = group(element) !== null && group(element) === group(active);
      return {
        // Radio buttons: Tab lands on the chosen one, the arrow keys go to the others.
        radioDown: radio && Boolean(active!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING),
        radioUp: radio && Boolean(active!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING),
        along: bar !== null && bar.contains(active),
        // A tree is one Tab stop; the arrow keys go from node to node.
        down:
          element.closest('[role="tree"]')?.contains(active) === true && Boolean(active!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING),
        up:
          element.closest('[role="tree"]')?.contains(active) === true && Boolean(active!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING),
        // Whether the control comes before the focus in the page, so Shift+Tab is the short way.
        before: active !== null && active !== document.body && Boolean(active.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING),
      };
    });
    await win.keyboard.press(where.down || where.radioDown ? "ArrowDown" : where.up || where.radioUp ? "ArrowUp" : where.along ? "ArrowRight" : where.before ? "Shift+Tab" : "Tab");
  }
  throw new Error(`${what} cannot be reached with Tab and the arrow keys (${max} presses)`);
}

/** Reach a control and press it. */
async function use(win: Page, target: Locator, what: string, key = "Enter") {
  // A dimmed control is not one to press; wait for the page to enable it.
  await expect(target, `${what} is enabled`).toBeEnabled({ timeout: 15_000 });
  await reach(win, target, what);
  await win.keyboard.press(key);
}

/**
 * In an open menu, arrow down to the entry named and press it. The menu keeps focus on itself
 * and marks the entry it is on, so that is what is read.
 */
async function choose(win: Page, name: string | RegExp, max = 30) {
  await expect(win.getByRole("menu").last()).toBeVisible({ timeout: 10_000 });
  for (let presses = 0; presses < max; presses += 1) {
    const at = await win.evaluate(() => {
      const active = [...document.querySelectorAll(".cp-track-menu__item--active")].pop();
      return (active?.textContent ?? "").replace("▸", "").trim();
    });
    const hit = typeof name === "string" ? at === name : name.test(at);
    if (hit) {
      await win.keyboard.press("Enter");
      return;
    }
    await win.keyboard.press("ArrowDown");
  }
  throw new Error(`no menu entry ${String(name)} reached with the arrow keys`);
}

// ----------------------------------------------------------------- the app

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

async function finished(win: Page, jobId: string) {
  await expect
    .poll(async () => (await win.evaluate((id) => (window as never as Bridge).cuepoint.getJob(id), jobId)).state, {
      timeout: 90_000,
    })
    .toBe("succeeded");
}

/** Go to a page by its route and wait for it. */
async function go(win: Page, route: string) {
  await win.evaluate((hash) => {
    location.hash = hash;
  }, route);
  await win.locator("main.app-main .screen").first().waitFor({ timeout: 30_000 });
}

/** The queue as titles, and where the playing one sits in it. */
async function queueState(win: Page): Promise<{ titles: string[]; at: number; playing: string | null }> {
  return win.evaluate(async () => {
    const player = (window as never as Bridge).cuepoint.player;
    const [page, state] = await Promise.all([player.queueWindow(0, 200), player.getState()]);
    return {
      titles: page.items.map((item: { title: string }) => item.title),
      at: state.queue.currentIndex as number,
      playing: (state.queue.currentItem?.title ?? null) as string | null,
    };
  });
}

/** How many jobs of a kind the app has run, and how many are still going. */
async function jobsOf(win: Page, type: string): Promise<number> {
  return win.evaluate(async (kind) => {
    const list = await (window as never as Bridge).cuepoint.listJobs({ state: "all", limit: 200 });
    return list.jobs.filter((job: { type: string }) => job.type === kind).length;
  }, type);
}

/** Make something in the bridge, then reload so the page reads it. */
async function viaBridge<T>(win: Page, work: () => Promise<T>): Promise<T> {
  const done = await win.evaluate(work);
  await win.reload();
  await win.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  return done;
}

const collectionsTree = (win: Page) => win.getByRole("tree", { name: "Collections" });
/** A node of the Collections tree, by its name. */
const treeNode = (win: Page, name: string) =>
  collectionsTree(win).getByRole("treeitem").filter({ has: win.getByText(name, { exact: true }) });
/** Choose a tree node with the keyboard: the arrow keys to it, then Enter. */
const chooseNode = (win: Page, node: Locator, what: string) => use(win, node, what);
const treeBar = (win: Page) => win.getByRole("toolbar", { name: "Selected Collection or Set" });

/** Type a name into the row a create left open, and press Enter. */
async function nameIt(win: Page, name: string) {
  const field = win.locator(".cp-playlist-pane__rename");
  await expect(field).toBeVisible({ timeout: 10_000 });
  await field.fill(name);
  await field.press("Enter");
  await expect(field).toBeHidden();
}

/** A Set made through the bridge from library tracks (by title), and its id. */
async function makeSet(win: Page, name: string, titles: string[]): Promise<number> {
  return win.evaluate(
    async ({ setName, wanted }) => {
      const c = (window as never as Bridge).cuepoint;
      const ids = new Map<string, number>();
      for (const track of (await c.browseLibrary({ limit: 50 })).tracks) ids.set(track.title, track.id);
      const made = await c.sets.createFrom({
        source: { kind: "selection", track_ids: wanted.map((title) => ids.get(title)) },
        name: setName,
      });
      return made.value.set.id as number;
    },
    { setName: name, wanted: titles },
  );
}

async function readSet(win: Page, setId: number) {
  return win.evaluate(async (id) => {
    const sets = (window as never as Bridge).cuepoint.sets;
    const [plan, entries] = await Promise.all([sets.plan({ set_id: id }), sets.entries({ set_id: id })]);
    return {
      chapters: plan.value.chapters as { id: number; name: string; position: number }[],
      entries: entries.value.entries as { entry_id: number; position: number; in_seconds: number | null; out_seconds: number | null; track: { title: string } }[],
    };
  }, setId);
}

/** Open a Set from another page, as the tree's Open in Prepare does. */
async function openSet(win: Page, setId: number) {
  await go(win, "#/library");
  await go(win, `#/prepare/${setId}`);
  await expect(win.getByRole("table", { name: "Set entries" })).toBeVisible({ timeout: 30_000 });
}

const setTitles = async (win: Page, setId: number) => (await readSet(win, setId)).entries.map((entry) => entry.track.title);

const setTable = (win: Page) => win.getByRole("table", { name: "Set entries" });

/** A Set row by its title; a chapter's heading carries its buttons in the same cell. */
function setRow(win: Page, title: string, nth = 0) {
  return setTable(win)
    .locator(".track-table__row")
    .filter({ has: win.locator('[data-column="title"]', { hasText: new RegExp(`^(⚠ )?${title}(Edit↑↓×)?$`) }) })
    .nth(nth);
}

/**
 * Select a Set row with a click at its left part, where nothing is an editor. The table has
 * no key that moves the selection (see the note at the top), so this is the one mouse step.
 */
async function pickEntry(win: Page, title: string, nth = 0) {
  const box = (await setRow(win, title, nth).boundingBox())!;
  await win.mouse.click(box.x + 60, box.y + box.height / 2);
}

const toolbar = (win: Page) => win.getByRole("toolbar", { name: "Selected tracks" });
const libraryTable = (win: Page) => win.getByRole("table", { name: "Library tracks" });
const libraryRow = (win: Page, title: string) =>
  libraryTable(win)
    .locator('[role="row"][data-index]')
    .filter({ has: win.locator('[data-column="title"]', { hasText: new RegExp(`^${title}$`) }) });

/**
 * Select Library rows with a click (the selection is the input; the action is the test). The
 * table has no key that moves the selection: Tab reaches it, but arrow keys and Space do
 * nothing there, so the row is chosen with the mouse.
 */
async function pick(win: Page, ...titles: string[]) {
  for (const [index, title] of titles.entries()) {
    await libraryRow(win, title).click({ modifiers: index === 0 ? [] : ["ControlOrMeta"] });
  }
  await expect(win.locator(".library-toolbar__count")).toContainText(`${titles.length} selected`);
}

async function openLibrary(win: Page) {
  await go(win, "#/library");
  // The page keeps the Collection or Set that was open last; the rows below are the whole library's.
  await chooseNode(win, win.getByRole("treeitem", { name: /^All tracks/ }), "All tracks");
  await expect(libraryRow(win, "Warm One")).toBeVisible({ timeout: 30_000 });
  // Nothing selected, as every row starts.
  const clear = toolbar(win).getByRole("button", { name: "Clear selection" });
  if ((await clear.getAttribute("aria-disabled")) !== "true") await clear.click();
}

test.describe("FLW-1: every action in the table has a visible place that works from the keyboard", () => {
  test.describe.configure({ timeout: 180_000 });

  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;
  let app: ElectronApplication;
  let win: Page;

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-places-"));
    app = await launch(userDataDir, cuepointHome);
    win = await app.firstWindow({ timeout: 60_000 });
    await waitForEngine(win);
    await win.evaluate(() => {
      localStorage.setItem("cuepoint-onboarding-complete", "1");
      localStorage.setItem("cuepoint-phase14-note-seen", "1");
      localStorage.setItem("cuepoint-first-steps-done", "1");
    });
    const xml = writeLibrary(workspace);
    const started = await win.evaluate((file) => (window as never as Bridge).cuepoint.startLibraryImport({ xml_path: file }), xml);
    await finished(win, started.job_id);
    await win.evaluate(async () => {
      const c = (window as never as Bridge).cuepoint;
      for (const track of (await c.browseLibrary({ limit: 50 })).tracks) {
        if (track.key) await c.setTrackOverrides({ trackId: track.id, key: track.key });
      }
      await c.player.setVolume(0);
    });
    await win.reload();
    await win.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  });

  test.afterAll(async () => {
    await app?.close();
    for (const dir of [userDataDir, cuepointHome, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  test("Play, Play next and Add to queue: the selection bar's Play, and Track details", async () => {
    test.skip(!hasPlayer, NO_PLAYER);
    await openLibrary(win);

    // The bar's Play ▸ holds all three. Playing one row plays the view behind it (DEC-012), so
    // the queue starts as the whole table; Play next then puts one more entry right after the
    // playing one, and Add to queue puts one at the end.
    const playMenu = () => toolbar(win).getByRole("button", { name: "Play", exact: true });
    await pick(win, "Warm One");
    await use(win, playMenu(), "the bar's Play");
    await choose(win, "Play");
    await expect.poll(async () => (await queueState(win)).playing, { timeout: 30_000 }).toBe("Warm One");

    let length = (await queueState(win)).titles.length;
    await pick(win, "Build");
    await use(win, playMenu(), "the bar's Play");
    await choose(win, "Add to queue");
    await expect.poll(async () => (await queueState(win)).titles.length, { timeout: 15_000 }).toBe(length + 1);
    expect((await queueState(win)).titles.at(-1)).toBe("Build");
    length += 1;

    await pick(win, "Close");
    await use(win, playMenu(), "the bar's Play");
    await choose(win, "Play next");
    await expect.poll(async () => (await queueState(win)).titles.length, { timeout: 15_000 }).toBe(length + 1);
    let queue = await queueState(win);
    expect(queue.titles[queue.at + 1]).toBe("Close");
    length += 1;

    // Track details has the same three as buttons.
    const details = win.getByRole("complementary", { name: "Track details" });
    await pick(win, "Warm Two");
    await use(win, details.getByRole("button", { name: "Add to queue", exact: true }), "Track details' Add to queue");
    await expect.poll(async () => (await queueState(win)).titles.length, { timeout: 15_000 }).toBe(length + 1);
    expect((await queueState(win)).titles.at(-1)).toBe("Warm Two");
    length += 1;
    await pick(win, "Bridge Spare");
    await use(win, details.getByRole("button", { name: "Play next", exact: true }), "Track details' Play next");
    await expect.poll(async () => (await queueState(win)).titles.length, { timeout: 15_000 }).toBe(length + 1);
    queue = await queueState(win);
    expect(queue.titles[queue.at + 1]).toBe("Bridge Spare");
    await pick(win, "Other Spare");
    await use(win, details.getByRole("button", { name: "Play", exact: true }), "Track details' Play");
    // Track details' Play plays that one track, so the queue is now just it (the fixture's files
    // last about a second, so it may already have finished).
    await expect.poll(async () => (await queueState(win)).titles, { timeout: 30_000 }).toEqual(["Other Spare"]);
    await win.evaluate(() => (window as never as Bridge).cuepoint.player.stop());
  });

  test("Copy and Show in folder: the selection bar's More, and Show in folder in Track details", async () => {
    await openLibrary(win);
    await app.evaluate(({ shell }) => {
      const shown: string[] = [];
      (globalThis as unknown as { __shown: string[] }).__shown = shown;
      shell.showItemInFolder = (file: string) => void shown.push(file);
    });
    const shownFiles = () => app.evaluate(() => (globalThis as unknown as { __shown: string[] }).__shown);

    await pick(win, "Build");
    const more = () => toolbar(win).getByRole("button", { name: "More", exact: true });
    await use(win, more(), "the bar's More");
    await choose(win, "Copy");
    await expect.poll(() => app.evaluate(({ clipboard }) => clipboard.readText()), { timeout: 15_000 }).toContain("Build");

    await use(win, more(), "the bar's More");
    await choose(win, "Show in folder");
    await expect.poll(shownFiles, { timeout: 15_000 }).toHaveLength(1);
    expect((await shownFiles())[0]).toMatch(/3\.mp3$/);

    // Show in folder is in Track details too.
    await pick(win, "Close");
    const details = win.getByRole("complementary", { name: "Track details" });
    await use(win, details.getByRole("button", { name: "Show in folder", exact: true }), "Track details' Show in folder");
    await expect.poll(shownFiles, { timeout: 15_000 }).toHaveLength(2);
    expect((await shownFiles())[1]).toMatch(/5\.mp3$/);
  });

  test("Similar tracks: Track details, and the selection bar's Explore", async () => {
    await openLibrary(win);
    await pick(win, "Build");
    const details = win.getByRole("complementary", { name: "Track details" });
    await use(win, details.getByRole("link", { name: "Similar tracks" }).or(details.getByRole("button", { name: "Similar tracks" })).first(), "Track details' Similar tracks");
    await expect(win).toHaveURL(/#\/discover\/similar\/3$/, { timeout: 15_000 });

    await openLibrary(win);
    await pick(win, "Close");
    await use(win, toolbar(win).getByRole("button", { name: "Explore", exact: true }), "the bar's Explore");
    await choose(win, "Similar tracks");
    await expect(win).toHaveURL(/#\/discover\/similar\/5$/, { timeout: 15_000 });
  });

  test("Add to Collection, Add to Set and New Set from these: the selection bar's Organize", async () => {
    const made = await viaBridge(win, async () => {
      const c = (window as never as Bridge).cuepoint;
      const crate = (await c.createCollection({ kind: "collection", name: "Organize crate" })).collection.id;
      const set = (await c.createCollection({ kind: "set", name: "Organize set" })).collection.id;
      return { crate, set };
    });
    await openLibrary(win);
    const organize = () => toolbar(win).getByRole("button", { name: "Organize", exact: true });
    const entriesOf = (id: number) =>
      win.evaluate(async (collectionId) => {
        const page = await (window as never as Bridge).cuepoint.getCollectionEntries({ collectionId });
        return page.entries.length as number;
      }, id);

    await pick(win, "Warm One", "Warm Two");
    await use(win, organize(), "the bar's Organize");
    await choose(win, "Add to Collection…");
    const picker = win.getByRole("dialog");
    await picker.getByRole("textbox").fill("Organize crate");
    await win.keyboard.press("ArrowDown");
    await win.keyboard.press("Enter");
    await expect.poll(() => entriesOf(made.crate), { timeout: 15_000 }).toBe(2);

    await pick(win, "Build");
    await use(win, organize(), "the bar's Organize");
    await choose(win, "Add to Set…");
    await win.getByRole("dialog").getByRole("textbox").fill("Organize set");
    await win.keyboard.press("ArrowDown");
    await win.keyboard.press("Enter");
    await expect
      .poll(
        () =>
          win.evaluate(async (id) => (await (window as never as Bridge).cuepoint.sets.entries({ set_id: id })).value.entries.length as number, made.set),
        { timeout: 15_000 },
      )
      .toBe(1);

    await pick(win, "Close", "Peak Jump");
    await use(win, organize(), "the bar's Organize");
    await choose(win, "New Set from these…");
    const dialog = win.getByRole("dialog", { name: "New Set from the 2 selected tracks" });
    await dialog.getByRole("textbox", { name: "Name" }).fill("From the bar");
    await reach(win, dialog.getByRole("button", { name: "Make the Set" }), "Make the Set");
    await win.keyboard.press("Enter");
    await expect(win.getByText("Made the Set “From the bar” with 2 entries.")).toBeVisible({ timeout: 15_000 });
  });

  test("New Collection, New Set and New folder: the labelled buttons over the tree", async () => {
    await openLibrary(win);
    const names = () =>
      win.evaluate(async () => (await (window as never as Bridge).cuepoint.getCollections()).collections.map((n: { name: string; kind: string }) => `${n.kind}:${n.name}`));
    await use(win, win.getByRole("button", { name: "New Collection", exact: true }), "New Collection");
    await nameIt(win, "Opening crate");
    await use(win, win.getByRole("button", { name: "New Set", exact: true }), "New Set");
    await nameIt(win, "Opening set");
    await use(win, win.getByRole("button", { name: "New folder", exact: true }), "New folder");
    await nameIt(win, "Opening folder");
    await expect.poll(names, { timeout: 15_000 }).toEqual(
      expect.arrayContaining(["collection:Opening crate", "set:Opening set", "folder:Opening folder"]),
    );
    for (const name of ["Opening crate", "Opening set", "Opening folder"]) {
      await expect(collectionsTree(win).getByText(name)).toBeVisible();
    }
  });

  test("Rename, Duplicate, Delete, Open in Prepare, Save set list and Export to Rekordbox: the bar under the tree", async () => {
    await viaBridge(win, async () => {
      const c = (window as never as Bridge).cuepoint;
      await c.createCollection({ kind: "collection", name: "Bar crate" });
      await c.createCollection({ kind: "set", name: "Bar set" });
    });
    await openLibrary(win);
    const names = () =>
      win.evaluate(async () => (await (window as never as Bridge).cuepoint.getCollections()).collections.map((n: { name: string }) => n.name) as string[]);
    const node = (name: string) => treeNode(win, name);

    // With nothing selected the bar is there, and disabled.
    await expect(treeBar(win)).toBeVisible();

    await chooseNode(win, node("Bar crate"), "the Bar crate node");
    await use(win, treeBar(win).getByRole("button", { name: "Rename", exact: true }), "Rename");
    await nameIt(win, "Bar crate renamed");
    await expect.poll(names, { timeout: 15_000 }).toContain("Bar crate renamed");

    // Export to Rekordbox… opens the export.
    await use(win, treeBar(win).getByRole("button", { name: "Export to Rekordbox…", exact: true }), "Export to Rekordbox…");
    const exporting = win.getByRole("dialog", { name: "Export to Rekordbox" });
    await expect(exporting).toBeVisible({ timeout: 15_000 });
    await win.keyboard.press("Escape");
    await expect(exporting).toBeHidden();

    await use(win, treeBar(win).getByRole("button", { name: "Delete", exact: true }), "Delete");
    const confirm = win.getByRole("dialog", { name: /^Delete / });
    await expect(confirm).toBeVisible();
    await reach(win, confirm.getByRole("button", { name: "Delete", exact: true }), "the confirm's Delete");
    await win.keyboard.press("Enter");
    await expect.poll(names, { timeout: 15_000 }).not.toContain("Bar crate renamed");

    // A Set: Duplicate, Open in Prepare and Save set list…
    await chooseNode(win, node("Bar set"), "the Bar set node");
    await use(win, treeBar(win).getByRole("button", { name: "Duplicate", exact: true }), "Duplicate");
    await expect.poll(async () => (await names()).filter((name) => name.startsWith("Bar set")).length, { timeout: 15_000 }).toBe(2);
    await use(win, treeBar(win).getByRole("button", { name: "Open in Prepare", exact: true }), "Open in Prepare");
    await expect(win).toHaveURL(/#\/prepare\/\d+$/, { timeout: 15_000 });

    await openLibrary(win);
    await chooseNode(win, node("Bar set"), "the Bar set node");
    const file = path.join(workspace, "Bar set.txt");
    await app.evaluate(({ dialog }, chosen) => {
      (dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async () => ({ canceled: false, filePath: chosen });
    }, file);
    await use(win, treeBar(win).getByRole("button", { name: "Save set list…", exact: true }), "Save set list…");
    await expect.poll(() => existsSync(file), { timeout: 15_000 }).toBe(true);
  });

  test("Import, Check Rekordbox for changes and Export to Rekordbox: the Library header", async () => {
    await openLibrary(win);
    const header = win.locator('[data-slot="library-header"]');

    // Check Rekordbox for changes: the file has not changed, and the page says so.
    await use(win, header.getByRole("button", { name: "Check Rekordbox for changes" }), "Check Rekordbox for changes");
    const unchanged = win.getByRole("dialog", { name: "Nothing has changed" });
    await expect(unchanged).toBeVisible({ timeout: 30_000 });
    await win.keyboard.press("Escape");
    await expect(unchanged).toBeHidden();

    // Export to Rekordbox…
    await use(win, header.getByRole("button", { name: "Export to Rekordbox…" }), "Export to Rekordbox…");
    const exporting = win.getByRole("dialog", { name: "Export to Rekordbox" });
    await expect(exporting).toBeVisible({ timeout: 15_000 });
    await win.keyboard.press("Escape");
    await expect(exporting).toBeHidden();

    // Import another file…, answered with the same file (the file chooser is the system's).
    const xml = path.join(workspace, "collection.xml");
    await app.evaluate(({ dialog }, chosen) => {
      (dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({ canceled: false, filePaths: [chosen] });
    }, xml);
    const imports = await jobsOf(win, "library_import");
    await use(win, header.getByRole("button", { name: "Import another file…" }), "Import another file…");
    await expect.poll(() => jobsOf(win, "library_import"), { timeout: 60_000 }).toBeGreaterThan(imports);
  });

  test("Edit values, Use Beatport's values and Save changes into the files: Clean's Fix values", async () => {
    await go(win, "#/clean");
    await use(win, win.getByRole("tab", { name: /^Fix values/ }), "the Fix values tab");
    await use(win, win.getByRole("radio", { name: "The whole library" }), "The whole library", "Space");
    await expect(win.getByRole("status").filter({ hasText: "7 tracks" })).toBeVisible({ timeout: 30_000 });
    const fix = win.getByRole("tabpanel", { name: "Fix values" });
    const genres = () =>
      win.evaluate(async () => {
        const page = await (window as never as Bridge).cuepoint.browseLibrary({ limit: 50 });
        return [...new Set(page.tracks.map((track: { effective_genre: string }) => track.effective_genre))] as string[];
      });
    expect(await genres()).toEqual(["House"]);
    const titlesWithGenre = (genre: string) =>
      win.evaluate(async (wanted) => {
        const page = await (window as never as Bridge).cuepoint.browseLibrary({ limit: 50 });
        return page.tracks.filter((track: { effective_genre: string }) => track.effective_genre === wanted).map((track: { title: string }) => track.title) as string[];
      }, genre);

    // Edit values…
    await use(win, fix.getByRole("button", { name: "Edit values…" }), "Edit values…");
    const editor = win.getByRole("dialog", { name: "Edit values" });
    await expect(editor).toBeVisible();
    await editor.getByRole("textbox", { name: "Genre value" }).fill("Deep House");
    await reach(win, editor.getByRole("button", { name: "Apply" }), "Apply");
    await win.keyboard.press("Enter");
    await expect(editor).toBeHidden({ timeout: 30_000 });
    await expect.poll(genres, { timeout: 30_000 }).toEqual(["Deep House"]);

    // Use Beatport's values…: with Beatport's genre accepted for one track, applying it
    // changes that track's genre and leaves the rest (the match is seeded, as the matcher would).
    seedAcceptedMatch(cuepointHome, "Warm One", { genre: "Tech House" });
    await win.reload();
    await win.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
    await use(win, win.getByRole("tab", { name: /^Fix values/ }), "the Fix values tab");
    await use(win, win.getByRole("radio", { name: "The whole library" }), "The whole library", "Space");
    await expect(win.getByRole("status").filter({ hasText: "7 tracks" })).toBeVisible({ timeout: 30_000 });
    await use(win, fix.getByRole("button", { name: "Use Beatport's values…" }), "Use Beatport's values…");
    const beatport = win.getByRole("dialog", { name: "Use Beatport's values" });
    await expect(beatport).toContainText("7 tracks");
    await use(win, beatport.getByRole("checkbox", { name: "Genre" }), "Genre", "Space");
    await reach(win, beatport.getByRole("button", { name: "Apply" }), "Apply");
    await win.keyboard.press("Enter");
    await expect(beatport).toBeHidden({ timeout: 30_000 });
    await expect.poll(genres, { timeout: 30_000 }).toEqual(expect.arrayContaining(["Tech House", "Deep House"]));
    expect(await titlesWithGenre("Tech House")).toEqual(["Warm One"]);

    // Save changes into the files…: a preview reads the files without writing them.
    await use(win, fix.getByRole("button", { name: "Save changes into the files…" }), "Save changes into the files…");
    const files = win.getByRole("dialog", { name: "Save changes into the files" });
    await expect(files).toContainText("7 tracks");
    await reach(win, files.getByRole("button", { name: "Preview" }), "Preview");
    await win.keyboard.press("Enter");
    await expect(files.getByRole("button", { name: /^Write/ })).toBeVisible({ timeout: 60_000 });
    await win.keyboard.press("Escape");
  });

  test("Start matching: Clean's header", async () => {
    await go(win, "#/clean");
    const before = await jobsOf(win, "clean_match");
    await use(win, win.getByRole("button", { name: "Match tracks…" }), "Match tracks…");
    const matching = win.getByRole("dialog", { name: "Match tracks" });
    await expect(matching).toBeVisible();
    await use(win, matching.getByRole("button", { name: "Start matching" }), "Start matching");
    await expect(matching).toBeHidden({ timeout: 30_000 });
    await expect.poll(() => jobsOf(win, "clean_match"), { timeout: 30_000 }).toBeGreaterThan(before);
    // Nothing here reaches Beatport for real: stop what started.
    await win.evaluate(async () => {
      const c = (window as never as Bridge).cuepoint;
      for (const job of (await c.listJobs({ state: "active" })).jobs) await c.cancelJob(job.id);
    });
  });

  test("Move up, Move down, Start a chapter here, Repeat after and Remove: Prepare's entry buttons", async () => {
    const setId = await makeSet(win, "Entry buttons", ["Warm One", "Warm Two", "Build", "Peak Jump"]);
    await openSet(win, setId);
    await expect(setRow(win, "Build")).toBeVisible({ timeout: 30_000 });
    const entries = win.getByRole("group", { name: "Selected entries" });
    const names = ["Move up", "Move down", "Start a chapter here", "Repeat after", "Remove"];

    // Always shown, and disabled until an entry is selected (DEC-209).
    for (const name of names) await expect(entries.getByRole("button", { name, exact: true })).toBeDisabled();

    const order = () => setTitles(win, setId);
    const first = await order();

    await pickEntry(win, first[1]);
    await use(win, entries.getByRole("button", { name: "Move down", exact: true }), "Move down");
    await expect.poll(order, { timeout: 15_000 }).toEqual([first[0], first[2], first[1], first[3]]);
    await use(win, entries.getByRole("button", { name: "Move up", exact: true }), "Move up");
    await expect.poll(order, { timeout: 15_000 }).toEqual(first);

    await use(win, entries.getByRole("button", { name: "Repeat after", exact: true }), "Repeat after");
    await expect.poll(async () => (await order()).length, { timeout: 15_000 }).toBe(5);
    expect((await order()).filter((title) => title === first[1])).toHaveLength(2);

    await pickEntry(win, first[3]);
    await use(win, entries.getByRole("button", { name: "Start a chapter here", exact: true }), "Start a chapter here");
    await expect.poll(async () => (await readSet(win, setId)).chapters.length, { timeout: 15_000 }).toBe(2);

    // The page draws a heading for each chapter once the Set has two, which moves every row down:
    // wait for that before choosing a row by its place.
    await expect(setTable(win).locator(".prepare-heading")).toHaveCount(2, { timeout: 15_000 });
    await pickEntry(win, first[0]);
    await use(win, entries.getByRole("button", { name: "Remove", exact: true }), "Remove");
    await expect.poll(async () => (await order()).length, { timeout: 15_000 }).toBe(4);
    expect(await order()).not.toContain(first[0]);
  });

  test("Edit, move and delete a chapter: the chapter heading's buttons", async () => {
    const setId = await makeSet(win, "Chapter buttons", ["Warm One", "Warm Two", "Build", "Peak Jump"]);
    await win.evaluate(async (id) => {
      const sets = (window as never as Bridge).cuepoint.sets;
      const entries = (await sets.entries({ set_id: id })).value.entries;
      await sets.splitChapter({ entry_id: entries[2].entry_id, name: "Peak" });
    }, setId);
    await openSet(win, setId);
    await expect(setRow(win, "Peak")).toBeVisible({ timeout: 30_000 });
    const chapterNames = async () => (await readSet(win, setId)).chapters.sort((a, b) => a.position - b.position).map((chapter) => chapter.name);
    expect(await chapterNames()).toEqual(["", "Peak"]);

    const press = (heading: string, name: string) =>
      use(win, setRow(win, heading).getByRole("button", { name }), name);

    await press("Peak", "Move chapter up");
    await expect.poll(chapterNames, { timeout: 15_000 }).toEqual(["Peak", ""]);
    await press("Peak", "Move chapter down");
    await expect.poll(chapterNames, { timeout: 15_000 }).toEqual(["", "Peak"]);

    await press("Peak", "Edit chapter");
    const dialog = win.getByRole("dialog", { name: /^Chapter / });
    await dialog.getByRole("textbox", { name: "Name" }).fill("Climb");
    await reach(win, dialog.getByRole("button", { name: "Save" }), "Save");
    await win.keyboard.press("Enter");
    await expect.poll(chapterNames, { timeout: 15_000 }).toEqual(["", "Climb"]);

    await press("Climb", "Delete chapter");
    const confirm = win.getByRole("dialog", { name: /^Delete the chapter/ });
    await reach(win, confirm.getByRole("button", { name: "Delete chapter" }), "the confirm's Delete chapter");
    await win.keyboard.press("Enter");
    await expect.poll(async () => (await readSet(win, setId)).chapters.length, { timeout: 15_000 }).toBe(1);
  });

  test("In and Out times: the Set table", async () => {
    const setId = await makeSet(win, "Times", ["Warm One", "Warm Two", "Build"]);
    await openSet(win, setId);
    await expect(setRow(win, "Build")).toBeVisible({ timeout: 30_000 });
    // Select the entry with a click, then F2 starts the cell, Tab moves from In to Out, Enter saves.
    await pickEntry(win, "Warm Two");
    await win.keyboard.press("F2");
    await win.getByRole("textbox", { name: /^Mix in for/ }).fill("0:30");
    await win.keyboard.press("Tab");
    await win.getByRole("textbox", { name: /^Mix out for/ }).fill("4:30");
    await win.keyboard.press("Enter");
    await expect
      .poll(async () => (await readSet(win, setId)).entries.find((entry) => entry.track.title === "Warm Two"), { timeout: 15_000 })
      .toMatchObject({ in_seconds: 30, out_seconds: 270 });
    await expect(win.locator(".prepare-header__facts")).toContainText("4:00 planned", { timeout: 15_000 });
  });

  test("The selection bar on Similar tracks: always shown, disabled until a suggestion is selected", async () => {
    test.skip(!hasPlayer, NO_PLAYER);
    const seed = await win.evaluate(async () => {
      const page = await (window as never as Bridge).cuepoint.browseLibrary({ limit: 50 });
      return page.tracks.find((track: { title: string }) => track.title === "Build").id as number;
    });
    await go(win, "#/library");
    await go(win, `#/discover/similar/${seed}`);
    const bar = win.getByRole("toolbar", { name: "Selected tracks" });
    await expect(bar).toBeVisible({ timeout: 30_000 });
    const play = bar.getByRole("button", { name: "Play", exact: true });
    await expect(play).toHaveAttribute("aria-disabled", "true");
    await expect(play).toHaveAttribute("title", "Select tracks first");
    await expect(win.getByRole("button", { name: "Actions…" })).toHaveCount(0);

    const rows = win.getByRole("table", { name: "Similar tracks" }).locator('[role="row"][data-index]');
    await expect(rows.first()).toBeVisible({ timeout: 30_000 });
    await rows.first().click();
    await expect(play).not.toHaveAttribute("aria-disabled", "true");
    const length = (await queueState(win)).titles.length;
    await use(win, play, "the bar's Play");
    await choose(win, "Add to queue");
    await expect.poll(async () => (await queueState(win)).titles.length, { timeout: 15_000 }).toBe(length + 1);
    await win.evaluate(() => (window as never as Bridge).cuepoint.player.stop());
  });

  test("The keys of one or several playlists: the Keys page in the sidebar", async () => {
    await openLibrary(win);
    await use(win, win.getByRole("link", { name: "Keys" }), "the Keys link in the sidebar");
    await expect(win.getByRole("heading", { name: "Keys", level: 1 })).toBeVisible({ timeout: 15_000 });

    const list = win.getByRole("group", { name: "Keys in these sources" });
    const countOf = (code: string) => list.getByRole("button", { name: new RegExp(`^${code},`) }).locator(".keys-counts__count");
    // The whole library to start: 8A on 1, 3, 5 and 7; 9A on 2 and 6; 8B on 4.
    await expect(countOf("8A")).toHaveText("4", { timeout: 30_000 });
    await expect(countOf("9A")).toHaveText("2");

    // Two playlists ticked with the keyboard: Warmup (1, 2, 3) and Peak (3, 4) hold 4 tracks, track 3 once.
    const sources = win.getByRole("group", { name: "Sources" });
    for (const name of ["Warmup", "Peak"]) {
      await reach(win, sources.getByRole("checkbox", { name }), `the ${name} checkbox`);
      await win.keyboard.press("Space");
    }
    await expect(win.getByRole("status").filter({ hasText: "in 2 playlists" })).toHaveText("4 tracks in 2 playlists", { timeout: 30_000 });
    await expect(countOf("8A")).toHaveText("2");
    await expect(countOf("9A")).toHaveText("1");
    await expect(countOf("8B")).toHaveText("1");
  });
});

test.describe("FLW-2: each function has one home, and the other places link to it", () => {
  test.describe.configure({ timeout: 180_000 });

  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;
  let app: ElectronApplication;
  let win: Page;

  test.beforeAll(async () => {
    test.setTimeout(240_000);
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-homes-"));
    app = await launch(userDataDir, cuepointHome);
    win = await app.firstWindow({ timeout: 60_000 });
    await waitForEngine(win);
    await win.evaluate(() => {
      localStorage.setItem("cuepoint-onboarding-complete", "1");
      localStorage.setItem("cuepoint-phase14-note-seen", "1");
      localStorage.setItem("cuepoint-first-steps-done", "1");
    });
    const started = await win.evaluate((file) => (window as never as Bridge).cuepoint.startLibraryImport({ xml_path: file }), writeLibrary(workspace));
    await finished(win, started.job_id);
    await win.evaluate(async () => {
      const c = (window as never as Bridge).cuepoint;
      for (const track of (await c.browseLibrary({ limit: 50 })).tracks) {
        if (track.key) await c.setTrackOverrides({ trackId: track.id, key: track.key });
      }
    });
    await win.reload();
    await win.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  });

  test.afterAll(async () => {
    await app?.close();
    for (const dir of [userDataDir, cuepointHome, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  test("Matching many tracks is Clean's window; the Library's Beatport menu opens it", async () => {
    // The home: Clean's header.
    await go(win, "#/clean");
    await use(win, win.getByRole("button", { name: "Match tracks…" }), "Clean's Match tracks…");
    await expect(win.getByRole("dialog", { name: "Match tracks" })).toBeVisible();
    await win.keyboard.press("Escape");

    // The link: the Library's selection bar.
    await openLibrary(win);
    await pick(win, "Warm One", "Warm Two");
    await use(win, toolbar(win).getByRole("button", { name: "Beatport", exact: true }), "the bar's Beatport");
    await choose(win, "Match tracks…");
    await expect(win).toHaveURL(/#\/clean/, { timeout: 15_000 });
    const matching = win.getByRole("dialog", { name: "Match tracks" });
    await expect(matching).toBeVisible({ timeout: 15_000 });
    await expect(matching).toContainText("2 tracks");
    await win.keyboard.press("Escape");
  });

  test("Editing many tracks is Clean's Fix values; Track details edits one and links there for several", async () => {
    // One track: the editor is Track details'.
    await openLibrary(win);
    await pick(win, "Build");
    const details = win.getByRole("complementary", { name: "Track details" });
    await use(win, details.getByRole("button", { name: "Edit values…" }), "Track details' Edit values…");
    await expect(win.getByRole("dialog", { name: "Edit values" })).toBeVisible({ timeout: 15_000 });
    await win.keyboard.press("Escape");

    // Several: Track details links to Fix values.
    await pick(win, "Warm One", "Warm Two");
    await use(win, details.getByRole("link", { name: "Edit values for 2 tracks…" }).or(details.getByRole("button", { name: "Edit values for 2 tracks…" })).first(), "Track details' Edit values for 2 tracks…");
    await expect(win).toHaveURL(/#\/clean/, { timeout: 15_000 });
    await expect(win.getByRole("tab", { name: /^Fix values/ })).toHaveAttribute("aria-selected", "true");
    await expect(win.getByRole("dialog", { name: "Edit values" })).toBeVisible({ timeout: 15_000 });
    await win.keyboard.press("Escape");

    // And so does the selection bar's Fix.
    await openLibrary(win);
    await pick(win, "Warm One", "Warm Two");
    await use(win, toolbar(win).getByRole("button", { name: "Fix", exact: true }), "the bar's Fix");
    await choose(win, "Edit values…");
    await expect(win).toHaveURL(/#\/clean/, { timeout: 15_000 });
    await expect(win.getByRole("dialog", { name: "Edit values" })).toBeVisible({ timeout: 15_000 });
    await win.keyboard.press("Escape");
  });

  test("Export to Rekordbox is the Library's and the tree's, and Prepare's for a Set; never the menu bar", async () => {
    // One dialog from the Library header, the tree's bar and Prepare's Export menu.
    await openLibrary(win);
    const exporting = win.getByRole("dialog", { name: "Export to Rekordbox" });
    await use(win, win.locator('[data-slot="library-header"]').getByRole("button", { name: "Export to Rekordbox…" }), "the header's Export to Rekordbox…");
    await expect(exporting).toBeVisible({ timeout: 15_000 });
    await win.keyboard.press("Escape");
    await expect(exporting).toBeHidden();

    const made = await win.evaluate(async () => {
      const c = (window as never as Bridge).cuepoint;
      return (await c.createCollection({ kind: "collection", name: "Home crate" })).collection.id as number;
    });
    expect(made).toBeGreaterThan(0);
    await win.reload();
    await win.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
    await chooseNode(win, treeNode(win, "Home crate"), "the Home crate node");
    await use(win, treeBar(win).getByRole("button", { name: "Export to Rekordbox…" }), "the tree's Export to Rekordbox…");
    await expect(exporting).toBeVisible({ timeout: 15_000 });
    await win.keyboard.press("Escape");
    await expect(exporting).toBeHidden();

    const setId = await makeSet(win, "Home set", ["Warm One", "Warm Two"]);
    await openSet(win, setId);
    await use(win, win.getByRole("button", { name: "Export ▾" }), "Prepare's Export");
    await choose(win, "Export to Rekordbox…");
    await expect(exporting).toBeVisible({ timeout: 15_000 });
    await win.keyboard.press("Escape");

    // Not in the menu bar (DEC-087): no entry in any menu says so.
    const labels = await app.evaluate(({ Menu }) => {
      const found: string[] = [];
      const walk = (items: Electron.MenuItem[]) => {
        for (const item of items) {
          found.push(item.label);
          if (item.submenu) walk(item.submenu.items);
        }
      };
      walk(Menu.getApplicationMenu()?.items ?? []);
      return found;
    });
    expect(labels.length).toBeGreaterThan(5);
    expect(labels.filter((label) => /export to rekordbox/i.test(label))).toEqual([]);
  });

  test("Checking every file is Clean's; the Library's entry runs the same check", async () => {
    const idle = () =>
      expect
        .poll(async () => win.evaluate(async () => (await (window as never as Bridge).cuepoint.listJobs({ state: "active", limit: 50 })).jobs.length as number), { timeout: 60_000 })
        .toBe(0);
    const checks = () => jobsOf(win, "file_check");

    // The home: Clean's Missing files tab starts the check of every file.
    await go(win, "#/clean");
    await use(win, win.getByRole("tab", { name: /^Missing files/ }), "the Missing files tab");
    const started = await checks();
    await use(win, win.getByRole("button", { name: "Check every file" }).first(), "Clean's Check every file");
    await expect.poll(checks, { timeout: 30_000 }).toBe(started + 1);
    await idle();

    // The link: the Library's Fix menu offers it too, and what it starts is the same kind of check.
    await openLibrary(win);
    await pick(win, "Warm One");
    await use(win, toolbar(win).getByRole("button", { name: "Fix", exact: true }), "the bar's Fix");
    await choose(win, "Check the files are still there");
    await expect.poll(checks, { timeout: 30_000 }).toBe(started + 2);
    await idle();
  });

  test("The keys of playlists are the Keys page's; the Library's Key list links to it", async () => {
    await openLibrary(win);
    await chooseNode(win, win.getByRole("treeitem", { name: /^Warmup/ }), "the Warmup playlist");
    const keyFilter = win.getByRole("button", { name: /^Key/ }).first();
    await use(win, keyFilter, "the Key filter");
    const open = win.getByRole("button", { name: "See these on the Keys page" });
    await use(win, open, "See these on the Keys page");
    await expect(win).toHaveURL(/#\/keys/, { timeout: 15_000 });
    await expect(win.getByRole("group", { name: "Sources" }).getByRole("checkbox", { name: "Warmup" })).toBeChecked({ timeout: 15_000 });
  });
  test("Organizing is the Library's; the pages that list tracks link to it", async () => {
    // Similar tracks plays and explores, and offers none of the Library's organizing: it links there.
    const seed = await win.evaluate(async () => {
      const page = await (window as never as Bridge).cuepoint.browseLibrary({ limit: 50 });
      return page.tracks.find((track: { title: string }) => track.title === "Build").id as number;
    });
    await go(win, "#/library");
    await go(win, `#/discover/similar/${seed}`);
    const bar = win.getByRole("toolbar", { name: "Selected tracks" });
    await expect(bar).toBeVisible({ timeout: 30_000 });
    await expect(bar.getByRole("button", { name: /^(Organize|Add to Collection)/ })).toHaveCount(0);
    await use(win, win.getByRole("button", { name: "Open in Library" }), "Similar tracks' Open in Library");
    await expect(win).toHaveURL(/#\/library$/, { timeout: 15_000 });
    await expect(libraryTable(win)).toBeVisible({ timeout: 30_000 });
    // And the home has the group the link leads to.
    await expect(toolbar(win).getByRole("button", { name: "Organize", exact: true })).toBeVisible();
  });

  test("Sets are Prepare's; the Library's tree links to it", async () => {
    const setId = await makeSet(win, "Linked set", ["Warm One", "Warm Two"]);
    await win.reload();
    await win.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
    await openLibrary(win);
    await chooseNode(win, treeNode(win, "Linked set"), "the Linked set node");
    await use(win, treeBar(win).getByRole("button", { name: "Open in Prepare", exact: true }), "Open in Prepare");
    await expect(win).toHaveURL(new RegExp(`#/prepare/${setId}$`), { timeout: 15_000 });
    await expect(setTable(win)).toBeVisible({ timeout: 30_000 });
    // The Library does not edit a Set's chapters or times: Prepare owns them.
    await expect(win.getByRole("group", { name: "Selected entries" })).toBeVisible();
  });
});
