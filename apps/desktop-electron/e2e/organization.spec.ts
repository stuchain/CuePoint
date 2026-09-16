/**
 * Phase 6, end to end, in the packaged app (ORG-13).
 *
 * The other Phase 6 tests each prove one part against a fake bridge. This one
 * walks the phase-level acceptance list in a single run of the real
 * application, in the order a user meets it, because a chain of steps that each
 * pass alone can still fail where they join — and this is the last chance to
 * find that out.
 *
 * It asserts, in one session:
 *
 *  1. The Collections destination opens the Library page, not a second browser
 *     (DEC-062), and remembers itself as the Library page.
 *  2. A folder and a Collection are created from the pane and renamed in place.
 *  3. A selection of tracks is filed into the Collection, and is there
 *     afterwards — scoped by the same table, in the Collection's own order.
 *  4. The Collection is reordered, and the new order survives a reload.
 *  5. A tag is made and applied to the selection, and filtering by it finds
 *     exactly those tracks.
 *  6. A rating is set on one track, and CuePoint's rating is what changed —
 *     Rekordbox's is untouched (DEC-057, DEC-064).
 *  7. A filter built in the bar saves as a Smart Collection with no
 *     translation, and evaluates live (DEC-043, DEC-061).
 *  8. That Smart Collection freezes into a static Collection, and the frozen
 *     copy stops changing while the original keeps answering.
 *  9. A refresh whose deletions hit the Collection shows DEC-011's warning with
 *     real numbers, refuses to apply without the acknowledgement, and applies
 *     with it.
 *
 * `CUEPOINT_HOME` points at a temporary directory, so the run never reads or
 * writes the real CuePoint library.
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import type {
  ActivityEvent,
  CollectionEntry,
  CollectionNode,
  TagUsage,
  TrackFieldChange,
} from "../renderer/src/api/cuepointBridge.types";
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

/** Half the tracks are House and half Techno, so a filter has work to do. */
function attrs(id: number): string {
  return (
    `Genre="${id % 2 === 0 ? "House" : "Techno"}" Tonality="8A" ` +
    `AverageBpm="12${id % 10}.00" Year="2024" TotalTime="360" BitRate="320" ` +
    `Rating="204" PlayCount="3"`
  );
}

function writeExport(dir: string, ids: number[], name = "collection.xml"): string {
  const entries = ids
    .map(
      (id) =>
        `<TRACK TrackID="${id}" Name="Track ${id}" Artist="Artist ${id}" ` +
        `${attrs(id)} Location="file://localhost/m/${id}.mp3"/>`,
    )
    .join("\n");
  const file = path.join(dir, name);
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${ids.length}">
${entries}
  </COLLECTION>
  <PLAYLISTS><NODE Name="ROOT" Type="0">
    <NODE Name="set" Type="1" Entries="1"><TRACK Key="${ids[0] ?? 0}"/></NODE>
  </NODE></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return file;
}

/**
 * Rewrite an export and push its modified time forward.
 *
 * A rewrite inside the filesystem's timestamp granularity can land on the same
 * mtime, which would make a genuinely changed file look unchanged and turn the
 * refresh at the end into a no-op that still passed.
 */
function rewriteExport(file: string, ids: number[]): void {
  writeExport(path.dirname(file), ids, path.basename(file));
  const stat = statSync(file);
  utimesSync(file, stat.atime.getTime() / 1000 + 5, stat.mtime.getTime() / 1000 + 5);
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: cuepointHome,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;

  return electron.launch({
    cwd: DESKTOP_ROOT,
    args: [".", `--user-data-dir=${userDataDir}`],
    env,
  });
}

async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await window.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  await expect(window.locator(".cp-status")).toContainText(/Engine connected/i, {
    timeout: 60_000,
  });
  return window;
}

async function settle(window: Page, jobId: string) {
  await expect
    .poll(
      async () =>
        (await window.evaluate((id) => window.cuepoint!.getJob!(id), jobId))!.state,
      { timeout: 90_000 },
    )
    .toMatch(/succeeded|failed|cancelled/);
  return window.evaluate((id) => window.cuepoint!.getJob!(id), jobId);
}

async function importCollection(window: Page, xmlPath: string) {
  const started = await window.evaluate(
    (file) => window.cuepoint!.startLibraryImport!({ xml_path: file }),
    xmlPath,
  );
  const finished = await settle(window, started.job_id);
  expect(finished!.state).toBe("succeeded");
}

/** Rename the row that is waiting for a name, which a create leaves open. */
async function nameIt(window: Page, name: string) {
  const field = window.locator(".cp-playlist-pane__rename");
  await expect(field).toBeVisible({ timeout: 10_000 });
  await field.fill(name);
  await field.press("Enter");
  await expect(field).toBeHidden();
}

/** The Collections section's tree. */
function collectionsTree(window: Page) {
  return window.getByRole("tree", { name: "Collections" });
}

/**
 * Drop tracks onto a Collection row.
 *
 * The gesture is HTML5 drag and drop, which Playwright cannot synthesize for a
 * drag that starts in one widget and ends in another. The events are dispatched
 * with a real `DataTransfer`, so the page's own `onDragStart` writes the
 * payload and the pane's own `onDrop` reads it — every line of the code under
 * test runs, and only the mouse is simulated.
 */
async function dragRowsOnto(window: Page, rowIndex: number, collectionName: string) {
  await window.evaluate(
    ({ index, name }) => {
      const rows = document.querySelectorAll<HTMLElement>('[role="row"][draggable="true"]');
      const source = rows[index];
      if (!source) throw new Error(`no draggable row at ${index}`);
      const target = [...document.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(
        (item) => item.textContent?.includes(name),
      );
      if (!target) throw new Error(`no tree row called ${name}`);

      const transfer = new DataTransfer();
      const fire = (element: HTMLElement, type: string) =>
        element.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }),
        );
      fire(source, "dragstart");
      fire(target, "dragover");
      fire(target, "drop");
      fire(source, "dragend");
    },
    { index: rowIndex, name: collectionName },
  );
}

test.describe("Phase 6 end to end (ORG-13)", () => {
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

  test("file, tag, rate, save, freeze and refresh, in one session", async () => {
    test.setTimeout(240_000);
    let app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      const ids = Array.from({ length: 12 }, (_unused, index) => index + 1);
      const xml = writeExport(workspace, ids);
      await importCollection(window, xml);

      // ---------------------------------------------------------------- 1
      await window.getByRole("link", { name: "Collections" }).click();
      await expect(window.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
      // One page, not two: the Collections tree is a section of the Library
      // page's left pane (DEC-062).
      await expect(collectionsTree(window)).toBeVisible({ timeout: 30_000 });
      await expect(window.locator("main.app-main .screen")).toHaveCount(1);
      // And DEC-027 remembers the page rather than the way in.
      expect(
        await window.evaluate(() =>
          localStorage.getItem("cuepoint-ui-shell-last-destination"),
        ),
      ).toBe("library");

      // ---------------------------------------------------------------- 2
      await window.getByRole("button", { name: "New folder" }).click();
      await nameIt(window, "Sets");
      await window.getByRole("button", { name: "New Collection" }).click();
      await nameIt(window, "Openers");
      await expect(collectionsTree(window).getByText("Sets")).toBeVisible();
      await expect(collectionsTree(window).getByText("Openers")).toBeVisible();

      // ---------------------------------------------------------------- 3
      const table = window.getByRole("table", { name: "Library tracks" });
      await expect(table).toBeVisible({ timeout: 30_000 });
      const rows = table.getByRole("row").filter({ hasText: /Track/ });
      await rows.nth(0).click();
      await rows.nth(2).click({ modifiers: ["Shift"] });
      await expect(window.locator(".cp-selection-actions__count")).toHaveText(
        "3 tracks selected",
      );

      await dragRowsOnto(window, 0, "Openers");
      await expect(window.getByText(/Added 3 tracks to Openers/i).first()).toBeVisible({
        timeout: 30_000,
      });

      await collectionsTree(window).getByText("Openers").click();
      await expect(window.getByRole("status").first()).toContainText("3 tracks", {
        timeout: 30_000,
      });
      // `[data-index]` excludes the header, which carries the same column id.
      const inside = async () =>
        window.evaluate(() =>
          [
            ...document.querySelectorAll('[role="row"][data-index] [data-column="title"]'),
          ].map((cell) => cell.textContent?.trim() ?? ""),
        );
      const before = await inside();
      expect(before).toHaveLength(3);

      // ---------------------------------------------------------------- 4
      // Reordered through the engine, then read back through the table: the
      // gesture is a row drag whose unit tests cover the arithmetic, and what
      // matters here is that the order is stored and comes back.
      const entryIds = await window.evaluate(async () => {
        const tree = await window.cuepoint!.getCollections!();
        const openers = tree.collections.find((node: CollectionNode) => node.name === "Openers")!;
        const page = await window.cuepoint!.getCollectionEntries!({
          collectionId: openers.id,
        });
        return page.entries.map((entry: CollectionEntry) => entry.id);
      });
      await window.evaluate(
        (entryId) =>
          window.cuepoint!.reorderCollectionEntry!({ entry_id: entryId, position: 0 }),
        entryIds[2]!,
      );
      await window.reload();
      await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
      await collectionsTree(window).getByText("Openers").click();
      await expect(table).toBeVisible({ timeout: 30_000 });
      await expect
        .poll(async () => (await inside())[0], { timeout: 30_000 })
        .toBe(before[2]);

      // ---------------------------------------------------------------- 5
      await rows.nth(0).click();
      await rows.nth(2).click({ modifiers: ["Shift"] });
      await rows.nth(0).click({ button: "right" });
      await window.getByRole("menuitem", { name: "Add tag…" }).click();
      const picker = window.getByRole("dialog");
      await picker.getByLabel("Type to narrow the list").fill("Peak-time");
      await picker.getByRole("button", { name: /Create/ }).click();
      await expect(picker).toBeHidden({ timeout: 30_000 });

      // Polled: tagging a selection is a write the page follows, and reading
      // the vocabulary the instant the dialog closes can beat it.
      await expect
        .poll(
          async () => {
            const vocabulary = await window.evaluate(() => window.cuepoint!.getTags!());
            const peak = vocabulary.tags.find((tag: TagUsage) => tag.name === "Peak-time");
            return peak?.track_count ?? -1;
          },
          { timeout: 30_000 },
        )
        .toBe(3);

      // ---------------------------------------------------------------- 6
      await rows.nth(0).click();
      await rows.nth(0).click({ button: "right" });
      // The submenu opens on the parent's click, not on hover: a menu that
      // opened a list under the cursor while it was on its way somewhere else
      // would be a menu that moves when you use it.
      await window.getByRole("menuitem", { name: "Rate" }).click();
      await window.getByRole("menuitem", { name: "★★★★", exact: true }).click();

      const rated = await window.evaluate(async () => {
        const tree = await window.cuepoint!.getCollections!();
        const openers = tree.collections.find((node: CollectionNode) => node.name === "Openers")!;
        const page = await window.cuepoint!.getCollectionEntries!({
          collectionId: openers.id,
        });
        const first = page.entries[0]!.track_id;
        return window.cuepoint!.getLibraryTrack!({ trackId: first });
      });
      // DEC-057: CuePoint's rating moved and Rekordbox's did not (DEC-064 —
      // nothing outside the database was written either).
      expect(rated.metadata.rating).toBe(4);
      expect(rated.track.rating).toBe(4);
      expect(rated.metadata.rekordbox_rating).toBe(4);
      expect(rated.metadata.rating_source).toBe("cuepoint");

      // ---------------------------------------------------------------- 7
      await window.getByRole("treeitem", { name: /All tracks/ }).click();
      await window.getByRole("button", { name: "Add filter" }).click();
      await window.getByLabel("Field").selectOption("genre");
      await window.getByLabel("Condition").selectOption("is");
      await window.getByLabel("Value").fill("House");
      await window.getByRole("button", { name: "Add", exact: true }).click();
      await expect(window.getByRole("status").first()).toContainText("6 tracks", {
        timeout: 30_000,
      });

      await window.getByRole("button", { name: /Save as Smart Collection/i }).click();
      const save = window.getByRole("dialog");
      await save.getByLabel("Name").fill("House only");
      await save.getByRole("button", { name: "Save" }).click();
      await expect(save).toBeHidden({ timeout: 30_000 });

      const saved = await window.evaluate(async () => {
        const tree = await window.cuepoint!.getCollections!();
        return tree.collections.find((node: CollectionNode) => node.name === "House only")!;
      });
      // No translation step: the rule set stored is the one the bar built
      // (DEC-043, LIBUI-02).
      expect(saved.kind).toBe("smart");
      expect(saved.rules).toEqual({
        match: "all",
        rules: [{ field: "genre", operator: "is", value: "House" }],
      });

      // It evaluates live rather than holding rows (DEC-061).
      await collectionsTree(window).getByText("House only").click();
      await expect(window.getByRole("status").first()).toContainText("6 tracks", {
        timeout: 30_000,
      });

      // ---------------------------------------------------------------- 8
      // Selected a moment ago, so the row holds the focus that shows its
      // controls; see the note on the duplicate below.
      await window.getByRole("button", { name: "Freeze House only" }).click();
      const freeze = window.getByRole("dialog");
      await expect(freeze).toContainText(/matches right now/);
      await freeze.getByRole("button", { name: "Freeze it" }).click();
      await expect(
        window.getByText(/Froze 6 tracks from House only/i).first(),
      ).toBeVisible({ timeout: 30_000 });

      const frozen = await window.evaluate(async () => {
        const tree = await window.cuepoint!.getCollections!();
        return tree.collections.find((node: CollectionNode) => node.name === "House only (frozen)")!;
      });
      expect(frozen.kind).toBe("collection");
      expect(frozen.track_count).toBe(6);
      expect(frozen.frozen_from_id).toBe(saved.id);

      // A duplicate is the other half of the same sentence: a second saved
      // question that starts out identical and is never linked again.
      //
      // The row is clicked first rather than hovered: its controls appear on
      // hover *or* focus, and only focus survives a re-render — the freeze
      // above took the focus with its dialog, and a hover that the toast lands
      // on is a hover that ends mid-click.
      await collectionsTree(window).getByText("House only", { exact: true }).click();
      await window.getByRole("button", { name: "Duplicate House only" }).click();
      await expect(
        window.getByText(/separate from now on/i).first(),
      ).toBeVisible({ timeout: 30_000 });

      const copy = await window.evaluate(async () => {
        const tree = await window.cuepoint!.getCollections!();
        return tree.collections.find(
          (node: CollectionNode) => node.name === "House only copy",
        )!;
      });
      expect(copy.kind).toBe("smart");
      expect(copy.id).not.toBe(saved.id);
      expect(copy.rules).toEqual(saved.rules);

      // Independent: editing the copy leaves the original asking what it asked.
      await window.evaluate(
        (id) =>
          window.cuepoint!.updateSmartCollection!({
            id,
            rules: {
              match: "all",
              rules: [{ field: "genre", operator: "is", value: "Techno" }],
            },
          }),
        copy.id,
      );
      const bothAfter = await window.evaluate(async () => {
        const tree = await window.cuepoint!.getCollections!();
        return tree.collections
          .filter((node: CollectionNode) => node.name.startsWith("House only"))
          .map((node: CollectionNode) => ({ name: node.name, rules: node.rules }));
      });
      const original = bothAfter.find(
        (node: { name: string }) => node.name === "House only",
      )!;
      expect(original.rules).toEqual(saved.rules);

      // ---------------------------------------------------------------- 9
      // Every track the Collection holds leaves the export — read from the
      // Collection rather than assumed, so the export is edited to hit exactly
      // what was filed. DEC-011's warning has been able to say this since
      // Phase 3 and has never had reason to.
      const held = await window.evaluate(async () => {
        const tree = await window.cuepoint!.getCollections!();
        const openers = tree.collections.find(
          (node: CollectionNode) => node.name === "Openers",
        )!;
        const page = await window.cuepoint!.getCollectionEntries!({
          collectionId: openers.id,
        });
        return page.entries.map((entry: CollectionEntry) => entry.track_id);
      });
      expect(held).toHaveLength(3);

      const rekordboxIds = await window.evaluate(async (trackIds: number[]) => {
        const rows = await Promise.all(
          trackIds.map((id) => window.cuepoint!.getLibraryTrack!({ trackId: id })),
        );
        return rows.map((row: { track: { rekordbox_track_id: string } }) =>
          Number(row.track.rekordbox_track_id),
        );
      }, held);
      rewriteExport(
        xml,
        ids.filter((id) => !rekordboxIds.includes(id)),
      );

      await window.reload();
      await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
      await window.getByRole("link", { name: "Library" }).click();
      await expect(window.getByText("Out of date")).toBeVisible({ timeout: 30_000 });

      await window.getByRole("button", { name: /Check for changes/i }).click();
      const preview = window.getByRole("dialog");
      await expect(preview).toBeVisible({ timeout: 60_000 });
      // Real numbers, not a shape: three tracks are filed, and the warning
      // counts them and the Collections they are filed in. Earlier in this
      // session all three were tagged and one was rated, and since CLEAN-05 the
      // warning names every kind of work a track carries (DEC-011 as amended).
      await expect(preview).toContainText(
        /3 tracks you are about to remove carry your own work: 3 in [1-9]\d* Collections?, 1 rated or noted, 3 tagged\. Removing them removes that too\./,
      );

      const apply = preview.getByRole("button", { name: /Remove 3 tracks and refresh/i });
      // The acknowledgement gates it: irreversible, and the numbers are real.
      await expect(apply).toBeDisabled();
      await preview.getByLabel(/I understand/i).check();
      await expect(apply).toBeEnabled();
      await apply.click();
      await expect(preview).toBeHidden({ timeout: 60_000 });

      await expect(window.getByTestId("library-track-count")).toHaveText("9 tracks", {
        timeout: 60_000,
      });
      // The Collection lost the tracks it held, and nothing else in the tree
      // was removed with them — a refresh deletes tracks, never Collections.
      const after = await window.evaluate(async () => {
        const tree = await window.cuepoint!.getCollections!();
        return tree.collections.map((node: CollectionNode) => ({
          name: node.name,
          tracks: node.track_count,
        }));
      });
      expect(after.find((node: { name: string }) => node.name === "Openers")!.tracks).toBe(0);
      expect(after.map((node: { name: string }) => node.name)).toEqual(
        expect.arrayContaining(["Sets", "Openers", "House only", "House only (frozen)"]),
      );
      // And the Smart Collection keeps answering over what is left, while the
      // frozen copy of it does not (DEC-061).
      await collectionsTree(window).getByText("House only", { exact: true }).click();
      await expect(window.locator(".cp-filter-bar__count")).toContainText("5 tracks", {
        timeout: 30_000,
      });
      // --------------------------------------------------------------- 10
      // Quit and come back. Everything above lives only in CuePoint's own
      // database, so this is the one check that says the phase's data is
      // durable rather than merely present.
      await app.close();
      app = await launch(userDataDir, cuepointHome);
      const reopened = await ready(app);

      const survived = await reopened.evaluate(async () => {
        const tree = await window.cuepoint!.getCollections!();
        const vocabulary = await window.cuepoint!.getTags!();
        const openers = tree.collections.find(
          (node: CollectionNode) => node.name === "Openers",
        )!;
        const page = await window.cuepoint!.getCollectionEntries!({
          collectionId: openers.id,
        });
        return {
          names: tree.collections.map((node: CollectionNode) => node.name),
          smart: tree.collections.find(
            (node: CollectionNode) => node.name === "House only",
          )!.rules,
          tags: vocabulary.tags.map((tag: TagUsage) => [tag.name, tag.track_count]),
          entries: page.entries.length,
        };
      });

      expect(survived.names).toEqual(
        expect.arrayContaining([
          "Sets",
          "Openers",
          "House only",
          "House only copy",
          "House only (frozen)",
        ]),
      );
      expect(survived.smart).toEqual(saved.rules);
      // The tag itself outlives the tracks it was on: the refresh above took
      // all three, and a vocabulary that deleted a tag when its last track
      // went would lose the word a user chose (ORG-03).
      expect(survived.tags).toEqual([["Peak-time", 0]]);
      expect(survived.entries).toBe(0);
    } finally {
      await app.close();
    }
  });

  /**
   * The phase's seventh acceptance sentence, at the size it names.
   *
   * A change over "everything matching" is the one gesture in Phase 6 that
   * cannot be checked at three tracks: what makes it a job rather than a
   * request is the number, and what makes the number safe is that the ids
   * never leave the engine (DEC-045). So this imports a library big enough for
   * the job to exist, applies one operation to all of it, stops it part way,
   * and then lets a second run finish.
   */
  test("changes everything a query matches, as a job that can be stopped", async () => {
    test.setTimeout(240_000);
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await ready(app);
      const ids = Array.from({ length: 50_000 }, (_unused, index) => index + 1);
      await importCollection(window, writeExport(workspace, ids, "big.xml"));

      await window.getByRole("link", { name: "Library" }).click();
      await expect(window.getByTestId("library-track-count")).toHaveText("50,000 tracks", {
        timeout: 60_000,
      });
      const table = window.getByRole("table", { name: "Library tracks" });
      await expect(table).toBeVisible({ timeout: 30_000 });

      // Everything matching, which is never a list of ids.
      await window.getByRole("button", { name: "Select all" }).click();
      await expect(window.locator(".cp-selection-actions__count")).toContainText(
        "50,000 tracks selected (everything matching)",
      );

      await window.getByRole("button", { name: "Actions…" }).click();
      await window.getByRole("menuitem", { name: "Favorite", exact: true }).click();

      // Above the threshold it asks first, with the number, because there is
      // no undo (DEC-008).
      const confirm = window.getByRole("dialog");
      await expect(confirm).toContainText("Favorite 50,000 tracks?");
      await expect(confirm).toContainText(/no undo/i);
      await confirm.getByRole("button", { name: "Apply" }).click();

      // It is a job, it says so from the shell, and it can be stopped there.
      const strip = window.locator(".cp-status");
      await expect(strip.locator(".cp-status__job-label")).toContainText(/Updating/, {
        timeout: 60_000,
      });
      await expect(strip.getByRole("progressbar", { name: /job progress/i })).toBeVisible();
      const stop = strip.getByRole("button", { name: /^stop /i });
      await expect(stop).toBeVisible({ timeout: 30_000 });
      await stop.click();

      // Stopped, and what it had already applied stays applied (DEC-063).
      await expect
        .poll(
          async () =>
            (
              await window.evaluate(
                () => window.cuepoint!.listJobs!({ state: "all", limit: 5 }),
              )
            ).jobs[0]!.state,
          { timeout: 90_000 },
        )
        .toMatch(/cancelled|succeeded/);

      const favorited = async () =>
        (
          await window.evaluate(() =>
            window.cuepoint!.browseLibrary!({
              limit: 1,
              filters: {
                match: "all",
                rules: [{ field: "favorite", operator: "is", value: true }],
              },
            }),
          )
        ).total;
      const partial = await favorited();
      expect(partial).toBeGreaterThan(0);

      // Run it again and let it finish: every track, one activity event for
      // the whole batch, and one batch id across the history it wrote. The
      // selection is still what it was — stopping the work does not un-choose
      // the tracks — so this picks up where the last one left off.
      await expect(window.locator(".cp-selection-actions__count")).toContainText(
        "(everything matching)",
      );
      await window.getByRole("button", { name: "Actions…" }).click();
      await window.getByRole("menuitem", { name: "Favorite", exact: true }).click();
      await window.getByRole("dialog").getByRole("button", { name: "Apply" }).click();

      await expect.poll(favorited, { timeout: 180_000 }).toBe(50_000);

      const events = await window.evaluate(() =>
        window.cuepoint!.getRecentActivity!({ limit: 20 }),
      );
      const batches = events.events.filter((event: ActivityEvent) =>
        event.type.startsWith("library.batch"),
      );
      // One event for the whole run, not one per track (DEC-029).
      expect(batches.length).toBeGreaterThan(0);
      expect(batches.length).toBeLessThanOrEqual(2);

      const history = await window.evaluate(async () => {
        const page = await window.cuepoint!.browseLibrary!({ limit: 1 });
        const id = page.tracks[0]!.id!;
        return window.cuepoint!.getTrackHistory!({ trackId: id });
      });
      const favorites = history.changes.filter(
        (change: TrackFieldChange) => change.field === "favorite",
      );
      expect(favorites.length).toBeGreaterThan(0);
      // Written under a batch id, which is what makes the run one thing a
      // later phase can look at or take back (DEC-063).
      expect(
        favorites.every((change: TrackFieldChange) => Boolean(change.batch_id)),
      ).toBe(true);
    } finally {
      await app.close();
    }
  });
});
