/**
 * The first run (PAGES-11, DEC-132): a fresh install shows the guide, its
 * import action reaches the Library's import, and a second launch does not
 * show it again.
 *
 * Each launch gets its own `--user-data-dir` and `CUEPOINT_HOME`, so a run
 * never reads or writes the real CuePoint library. The native file chooser is
 * not clickable from here, so the main process's dialog is replaced with one
 * that counts how often it was asked.
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

function launch(userDataDir: string, cuepointHome: string): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: cuepointHome,
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ cwd: DESKTOP_ROOT, args: [".", `--user-data-dir=${userDataDir}`], env });
}

async function firstWindow(app: ElectronApplication): Promise<Page> {
  const window = await app.firstWindow({ timeout: 60_000 });
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  await waitForEngine(window);
  return window;
}

/** Replace the file chooser with one that answers "cancelled" and counts the asks. */
async function countFileChoices(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ dialog }) => {
    const counter = globalThis as unknown as { __fileChoices: number };
    counter.__fileChoices = 0;
    dialog.showOpenDialog = (async () => {
      counter.__fileChoices += 1;
      return { canceled: true, filePaths: [] };
    }) as typeof dialog.showOpenDialog;
  });
}

const fileChoices = (app: ElectronApplication) =>
  app.evaluate(() => (globalThis as unknown as { __fileChoices: number }).__fileChoices);

test.describe("The first-run guide (PAGES-11)", () => {
  let userDataDir: string;
  let cuepointHome: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
    cuepointHome = mkdtempSync(path.join(tmpdir(), "cuepoint-home-"));
  });

  test.afterEach(() => {
    for (const dir of [userDataDir, cuepointHome]) rmSync(dir, { recursive: true, force: true });
  });

  test("a fresh install shows the guide, its import reaches the Library, and the second launch does not show it", async () => {
    const first = await launch(userDataDir, cuepointHome);
    try {
      const window = await firstWindow(first);
      await countFileChoices(first);

      const guide = window.getByRole("dialog", { name: "Getting started" });
      await expect(guide).toBeVisible();
      await expect(guide.getByText("Step 1 of 5")).toBeVisible();

      // A stray click on the backdrop does not end it.
      await window.locator(".cp-modal__backdrop").click({ position: { x: 5, y: 5 } });
      await expect(guide).toBeVisible();

      await guide.getByRole("button", { name: "Next" }).click();
      await guide.getByRole("button", { name: "Next" }).click();
      await expect(guide.getByText("Step 3 of 5")).toBeVisible();
      await guide.getByRole("button", { name: "Import your Rekordbox collection…" }).click();

      await expect(guide).toBeHidden();
      await expect.poll(() => fileChoices(first)).toBe(1);
      await expect(window.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
    } finally {
      await first.close();
    }

    // The second launch of the same profile: no guide, and no update note either.
    const second = await launch(userDataDir, cuepointHome);
    try {
      const window = await firstWindow(second);
      await expect(window.getByRole("heading", { name: "Library", level: 1 })).toBeVisible();
      await expect(window.getByRole("dialog")).toHaveCount(0);
    } finally {
      await second.close();
    }
  });

  test("the empty Library lists the first steps", async () => {
    const app = await launch(userDataDir, cuepointHome);
    try {
      const window = await firstWindow(app);
      await window.getByRole("dialog", { name: "Getting started" }).getByRole("button", { name: "Skip" }).click();
      const steps = window.getByRole("list", { name: "First steps" });
      await expect(steps.getByRole("listitem")).toHaveCount(4);
      await expect(steps.getByRole("listitem").first()).toHaveAttribute("data-done", "false");
    } finally {
      await app.close();
    }
  });
});
