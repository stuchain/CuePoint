/**
 * What the accessibility specs share (HARDEN-08, DEC-186): a launched app with a library loaded, the
 * look a spec asks for (theme, text size, motion), and the seven destinations.
 *
 * Each launch gets its own `--user-data-dir` and `CUEPOINT_HOME`, so a run never reads or writes the real
 * CuePoint library. The file dialog cannot be clicked from Playwright, so the import is started through the
 * same bridge method the button calls.
 */
import { expect, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";
import { launchElectron } from "./support/launchApp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DESKTOP_ROOT = path.resolve(__dirname, "..");

/** The five built-in themes, by the id the app stores. */
export const THEMES = ["neoDark", "retro16", "qtEvolved", "clubNeon", "mutedPro"] as const;
export type Theme = (typeof THEMES)[number];

/** Extra small (1×) and Medium (1.5×, the default). */
export const SCALES = [1, 1.5] as const;

/** The destinations, in the sidebar's order, with the heading each opens on. */
export const DESTINATIONS = [
  { link: "Library", heading: "Library" },
  { link: "Clean", heading: "Clean" },
  { link: "Keys", heading: "Keys" },
  { link: "Discover", heading: "Discover" },
  { link: "Prepare", heading: "Prepare" },
  { link: "Statistics", heading: "Statistics" },
  { link: "Settings", heading: "Settings" },
] as const;

export interface Workspace {
  userDataDir: string;
  cuepointHome: string;
  workspace: string;
  cleanup(): void;
}

export function makeWorkspace(): Workspace {
  const userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
  const cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
  const workspace = mkdtempSync(path.join(tmpdir(), "cuepoint-xml-"));
  return {
    userDataDir,
    cuepointHome,
    workspace,
    cleanup() {
      for (const dir of [userDataDir, cuepointHome, workspace]) rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A small Rekordbox export: `count` tracks, two genres, and one playlist of four. */
export function writeExport(dir: string, count = 40): string {
  const entries = Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    return (
      `<TRACK TrackID="${id}" Name="Track ${id}" Artist="Artist ${String(1000 - id).padStart(4, "0")}" ` +
      `Genre="${id % 3 === 0 ? "Techno" : "House"}" Tonality="${(id % 12) + 1}A" AverageBpm="${120 + (id % 20)}.00" Year="2024" ` +
      `TotalTime="360" BitRate="320" Rating="204" PlayCount="${id % 5}" Album="Album ${id}" Label="Label" ` +
      `Comment="note ${id}" Location="file://localhost/m/${id}.mp3"/>`
    );
  }).join("\n");
  const members = [5, 2, 8, 1].map((id) => `<TRACK Key="${id}"/>`).join("");
  const file = path.join(dir, "collection.xml");
  writeFileSync(
    file,
    `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <COLLECTION Entries="${count}">
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

export function launch(ws: Workspace): Promise<ElectronApplication> {
  const env = { ...process.env, NODE_ENV: "production", CUEPOINT_HOME: ws.cuepointHome } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  // The one launch helper (HARDEN-09): the packaged app when `CUEPOINT_E2E_EXECUTABLE` names one.
  return launchElectron({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${ws.userDataDir}`], env });
}

export interface Look {
  theme?: Theme;
  scale?: number;
  /** "reduced" sets the system's Reduce motion; "on" leaves it as the system has it. */
  motion?: "on" | "reduced";
}

/** Sets the look in storage and the media emulation, then reloads so the app starts in it. */
export async function setLook(window: Page, look: Look): Promise<void> {
  await window.emulateMedia({ reducedMotion: look.motion === "reduced" ? "reduce" : "no-preference" });
  await window.evaluate(({ theme, scale }) => {
    localStorage.setItem("cuepoint-onboarding-complete", "1");
    localStorage.setItem("cuepoint-phase14-note-seen", "1");
    if (theme) localStorage.setItem("cuepoint-ui-lab-theme", theme);
    if (scale) localStorage.setItem("cuepoint-ui-lab-scale", String(scale));
  }, { theme: look.theme, scale: look.scale });
  await window.reload();
  await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
}

/** A desk-sized window with the first run done and the engine answering. */
export async function ready(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1440, 900);
  });
  await setLook(window, {});
  await waitForEngine(window);
  return window;
}

export async function importCollection(window: Page, xmlPath: string): Promise<void> {
  const started = await window.evaluate((file) => window.cuepoint!.startLibraryImport!({ xml_path: file }), xmlPath);
  await expect
    .poll(async () => (await window.evaluate((id) => window.cuepoint!.getJob!(id), started.job_id))!.state, {
      timeout: 90_000,
    })
    .toBe("succeeded");
  // The Library reads the library when it loads: an import made through the bridge is seen on the next load.
  await window.reload();
  await window.locator("main.app-main .screen:visible").waitFor({ timeout: 30_000 });
}

/** Opens a destination from the sidebar and waits until its page has stopped loading and moving. */
export async function openDestination(window: Page, destination: (typeof DESTINATIONS)[number]): Promise<void> {
  await window.getByRole("navigation", { name: /main navigation/i }).getByRole("link", { name: destination.link, exact: true }).click();
  await expect(window.getByRole("heading", { name: destination.heading, level: 1 })).toBeVisible({ timeout: 30_000 });
  if (destination.link === "Library") {
    await expect(window.getByRole("grid", { name: "Library tracks" })).toBeVisible({ timeout: 30_000 });
    await expect(window.getByTestId("library-track-count")).toBeVisible();
  }
  // A page that is still reading shows a loading line; wait for it to go.
  await expect(window.locator("main.app-main .cp-loading:visible")).toHaveCount(0, { timeout: 30_000 });
  await settle(window);
}

/** Lets finite animations and transitions finish, so a colour is read at rest and not half-faded. */
export async function settle(window: Page): Promise<void> {
  await window.evaluate(async () => {
    const finished = Promise.all(
      document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined)),
    );
    await Promise.race([finished, new Promise((resolve) => setTimeout(resolve, 1500))]);
  });
  // Park the pointer away from anything that lights on hover.
  await window.mouse.move(0, 0);
}
