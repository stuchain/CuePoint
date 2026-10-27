/**
 * L9: the alignment rules measured in the running app, so a near miss of a few pixels is caught
 * where no unit test can see it (the page is laid out by Chromium, with the real fonts).
 *
 * L1 one left and one right edge per pane; L3 side-by-side panes share their lines; L4 a label and
 * the boxes under it share an edge; L7 a disclosure's title sits on the edge, its arrow in the inset.
 * A difference of 1 to 7 px is the miss these rules exist to stop, so every check allows only
 * half a pixel of rounding. Measured at 1x and 1.5x in the 1,264 x 735 page a Windows window leaves.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";
import { WINDOWS_INNER, setInnerSize } from "./windowSizes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const SCALE_KEY = "cuepoint-ui-lab-scale";
/** Rounding only: anything wider is a miss. */
const SLACK = 0.6;

type Bridge = { cuepoint: Record<string, (...args: never[]) => Promise<never>> & { sets: Record<string, (...args: never[]) => Promise<never>> } };

function writeExport(dir: string): string {
  const tracks = Array.from({ length: 12 }, (_, n) => {
    const i = n + 1;
    return (
      `<TRACK TrackID="${i}" Name="Track ${i}" Artist="Artist ${i}" Genre="House" Tonality="${(i % 4) + 7}A" ` +
      `AverageBpm="${(120 + i).toFixed(2)}" TotalTime="300" Location="file://localhost/m/${i}.mp3"/>`
    );
  });
  const list = (name: string, ids: number[]) =>
    `<NODE Name="${name}" Type="1" KeyType="0" Entries="${ids.length}">${ids.map((i) => `<TRACK Key="${i}"/>`).join("")}</NODE>`;
  const file = path.join(dir, "collection.xml");
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="12">
${tracks.join("\n")}
  </COLLECTION>
  <PLAYLISTS><NODE Type="0" Name="ROOT" Count="4">
    ${list("Friday", [1, 2, 3, 4, 5, 6])}
    ${list("Peak time", [7, 8, 9])}
    ${list("Closing", [10, 11, 12])}
    <NODE Type="0" Name="Gigs" Count="1">${list("Warm-up", [1, 2])}</NODE>
  </NODE></PLAYLISTS>
</DJ_PLAYLISTS>
`,
    "utf-8",
  );
  return file;
}

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: cuepointHome } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

/**
 * Where things sit, in page pixels. `text(selector)` is the left and right of the first line of
 * words inside each visible match, which is what a reader sees as the edge; `box(selector)` is the
 * element's own rectangle.
 */
async function measure(win: Page, texts: string[], boxes: string[]) {
  return win.evaluate(
    ([texts, boxes]) => {
      const shown = (el: Element) => {
        for (let a: Element | null = el; a; a = a.parentElement) {
          const cs = getComputedStyle(a);
          if (cs.display === "none" || cs.visibility === "hidden") return false;
        }
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
      };
      const words = (el: Element) => {
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walk.nextNode(); n; n = walk.nextNode()) {
          if (!(n.textContent ?? "").trim() || !n.parentElement || !shown(n.parentElement)) continue;
          const range = document.createRange();
          range.selectNodeContents(n);
          const line = [...range.getClientRects()].find((r) => r.width > 1);
          if (line) return { left: line.left, right: line.right, top: line.top };
        }
        return null;
      };
      const out: Record<string, { left: number; right: number; top: number; bottom: number }[]> = {};
      for (const s of texts) {
        out[s] = [...document.querySelectorAll(s)]
          .filter(shown)
          .map(words)
          .filter((w): w is { left: number; right: number; top: number } => w !== null)
          .map((w) => ({ ...w, bottom: w.top }));
      }
      for (const s of boxes) {
        out[s] = [...document.querySelectorAll(s)].filter(shown).map((el) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        });
      }
      return out;
    },
    [texts, boxes] as const,
  );
}

/** Every value within SLACK of the first. */
function oneEdge(label: string, values: number[]) {
  expect(values.length, `${label}: something to measure`).toBeGreaterThan(0);
  const spread = Math.max(...values) - Math.min(...values);
  expect(spread, `${label}: ${values.map((v) => v.toFixed(1)).join(", ")}`).toBeLessThanOrEqual(SLACK);
}

async function atScale(win: Page, scale: string) {
  await win.evaluate(([key, value]) => localStorage.setItem(key!, value!), [SCALE_KEY, scale]);
  await win.reload();
  await win.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
  await expect
    .poll(() => win.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--scale").trim()))
    .toBe(scale);
}

test.describe("Alignment (L9)", () => {
  test.describe.configure({ timeout: 240_000 });

  let userDataDir: string;
  let cuepointHome: string;
  let workspace: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
    workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-xml-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome, workspace]) rmSync(dir, { recursive: true, force: true });
  });

  test("the Library pane, Track details and Prepare's side panel each keep one edge, and the pane meets the table's lines", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const win = await app.firstWindow({ timeout: 60_000 });
      await waitForEngine(win);
      await win.evaluate(() => (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
      const started = await win.evaluate(
        (x) => (window as never as Bridge).cuepoint.startLibraryImport({ xml_path: x } as never) as Promise<{ job_id: string }>,
        writeExport(workspace),
      );
      await expect
        .poll(async () => (await win.evaluate((id) => (window as never as Bridge).cuepoint.getJob(id as never) as Promise<{ state: string }>, started.job_id)).state, {
          timeout: 90_000,
        })
        .toBe("succeeded");
      const setId: number = await win.evaluate(async () => {
        const c = (window as never as Bridge).cuepoint as never as {
          getLibraryPlaylists(): Promise<{ playlists: { name: string; id: number }[] }>;
          sets: { createFrom(a: unknown): Promise<{ value: { set: { id: number } } }> };
        };
        const friday = (await c.getLibraryPlaylists()).playlists.find((node) => node.name === "Friday")!;
        return (await c.sets.createFrom({ source: { kind: "playlist", id: friday.id } })).value.set.id;
      });
      await setInnerSize(app, win, WINDOWS_INNER);

      for (const scale of ["1", "1.5"]) {
        await atScale(win, scale);
        await win.getByRole("link", { name: "Library", exact: true }).click();
        const rows = win.locator(".library-screen .track-table__row");
        await expect(rows.first()).toBeVisible({ timeout: 30_000 });
        await expect(win.locator(".cp-library-pane").getByText("Peak time", { exact: true })).toBeVisible({ timeout: 30_000 });
        await win.mouse.move(0, 0);

        // --- L1: the Library pane's left and right edges ------------------------------------
        const pane = await measure(
          win,
          [
            ".cp-library-pane .cp-playlist-pane__title",
            '.cp-library-pane [role="treeitem"]:is([aria-level="1"], [aria-level="2"]) .cp-playlist-pane__name',
            ".cp-library-pane .cp-playlist-pane__count",
          ],
          ['.cp-library-pane [role="treeitem"][aria-level="2"]:not([aria-expanded]) > .cp-playlist-pane__icon'],
        );
        const [titles, names, counts, icons] = Object.values(pane);
        oneEdge(`${scale}x: section titles start on one edge`, titles!.map((t) => t.left));
        oneEdge(`${scale}x: a top-level row's icon starts under the section title`, [titles![0]!.left, ...icons!.map((i) => i.left)]);
        oneEdge(`${scale}x: top-level names start on one edge in every section`, names!.map((n) => n.left));
        oneEdge(`${scale}x: counts end on one edge in every section`, counts!.map((c) => c.right));

        // --- L3: the pane's lines are the table's lines -------------------------------------
        const lines = await win.evaluate(() => {
          const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
          const filter = r(".library-screen .cp-filter-bar");
          const header = r(".library-screen .track-table__header");
          const heads = [...document.querySelectorAll(".cp-library-pane .cp-playlist-pane > .cp-playlist-pane__head")].map(
            (h) => h.getBoundingClientRect().bottom,
          );
          const tableRows = [...document.querySelectorAll(".library-screen .track-table__row")].map((row) => row.getBoundingClientRect().bottom);
          return { all: r(".cp-library-pane__all").bottom, filter: filter.bottom, filterHeight: filter.height, header: header.bottom, heads, tableRows,
            bar: (() => {
              // The token is a round() expression, so read its used value from a probe.
              const probe = document.body.appendChild(document.createElement("div"));
              probe.style.height = "var(--toolbar-height)";
              const height = probe.getBoundingClientRect().height;
              probe.remove();
              return height;
            })() };
        });
        console.log(`L3 at ${scale}x:`, JSON.stringify({ ...lines, tableRows: lines.tableRows.length }));
        // A filter bar that wraps (a narrow table) is the one case that leaves the grid.
        if (lines.filterHeight <= lines.bar + 1) {
          expect(Math.abs(lines.all - lines.filter), `${scale}x: All tracks ends on the filter bar's line`).toBeLessThanOrEqual(SLACK);
          expect(Math.abs(lines.heads[0]! - lines.header), `${scale}x: the Collections head ends on the table header's line`).toBeLessThanOrEqual(SLACK);
          for (const head of lines.heads.slice(1)) {
            const nearest = Math.min(...lines.tableRows.map((y) => Math.abs(y - head)));
            expect(nearest, `${scale}x: a section head at ${head.toFixed(1)} ends on a table row's line`).toBeLessThanOrEqual(SLACK);
          }
        }

        // --- L1, L7: Track details keeps one left edge --------------------------------------
        await rows.first().click();
        const inspector = win.locator(".cp-inspector").first();
        await expect(inspector.locator(".cp-track-detail__title")).toBeVisible({ timeout: 15_000 });
        await win.mouse.move(0, 0);
        const details = await measure(
          win,
          [".cp-inspector__header", ".cp-inspector .cp-track-detail__title", ".cp-inspector .cp-track-section__title", ".cp-inspector .cp-track-detail__factlabel"],
          [],
        );
        const play = await inspector.getByRole("button", { name: "Play", exact: true }).first().evaluate((b) => {
          const range = document.createRange();
          range.selectNodeContents(b);
          const words = [...range.getClientRects()].filter((r) => r.width > 1 && r.width < b.getBoundingClientRect().width - 1);
          return Math.min(...words.map((r) => r.left));
        });
        oneEdge(`${scale}x: Track details: panel title, track title, Play, section titles and labels`, [
          ...Object.values(details).flatMap((list) => list.map((t) => t.left)),
          play,
        ]);

        // --- L1, L4: Prepare's side panel ---------------------------------------------------
        await win.evaluate((id) => (window.location.hash = `#/prepare/${id}`), setId);
        await expect(win.getByRole("table", { name: "Set entries" })).toBeVisible({ timeout: 30_000 });
        await expect(win.locator(".prepare-source__controls")).toBeVisible();
        const source = await measure(
          win,
          [".prepare-source__point", ".prepare-source .cp-tabs__tab:first-child"],
          [".prepare-source__select", ".prepare-source__controls .cp-btn", ".prepare-source__table"],
        );
        oneEdge(`${scale}x: Prepare's side panel: the line, the tabs and the boxes`, Object.values(source).map((list) => list[0]!.left));
      }
    } finally {
      await app.close();
    }
  });
});
