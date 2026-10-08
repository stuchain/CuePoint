/**
 * Motion's groundwork (PAGES-02): a toast's entrance obeys its switch and the
 * system's Reduce motion setting. The toast comes from Settings → Motion →
 * Reset to defaults, which confirms with a toast carrying Undo.
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

function launch(userDataDir: string): Promise<ElectronApplication> {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: path.join(userDataDir, "cuepoint-home"),
  } as Record<string, string>;
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({
    cwd: DESKTOP_ROOT,
    args: [".", `--user-data-dir=${userDataDir}`],
    env,
  });
}

/** Dismisses onboarding, optionally stores motion switches, and opens Settings. */
async function openSettings(window: Page, motion?: Record<string, boolean>): Promise<void> {
  await window.evaluate((stored) => {
    (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.setItem("cuepoint-phase14-note-seen", "1"));
    if (stored) localStorage.setItem("cuepoint-motion", JSON.stringify(stored));
  }, motion);
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  await window
    .getByRole("navigation", { name: /main navigation/i })
    .getByRole("link", { name: "Settings" })
    .click();
  await expect(window.getByRole("checkbox", { name: "Button presses" })).toBeVisible({
    timeout: 15_000,
  });
}


test.describe("Motion switches and the system setting", () => {
  let userDataDir: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
  });

  test.afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  /** The Motion section's own Reset, found by its section. */
  async function motionReset(window: Page): Promise<string> {
    const section = window.getByRole("region", { name: "Motion" });
    await section.getByRole("button", { name: "Reset to defaults" }).click();
    await window.getByRole("button", { name: "Reset", exact: true }).click();
    const toast = window.locator(".cp-toast").first();
    await expect(toast).toBeVisible();
    return toast.evaluate((el) => getComputedStyle(el).animationName);
  }

  test("a toast has no animation under the system's Reduce motion", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await window.emulateMedia({ reducedMotion: "reduce" });
      await openSettings(window);
      await expect(window.getByText(/Reduce motion setting: on, so nothing moves/)).toBeVisible();
      expect(await motionReset(window)).toBe("none");
    } finally {
      await app.close();
    }
  });

  test("a toast slides in with the switch on and the system not asking", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await window.emulateMedia({ reducedMotion: "no-preference" });
      await openSettings(window);
      // Reset leaves "Opening and closing panels and dialogs" on, and the toast is its entrance.
      expect(await motionReset(window)).toBe("cp-toast-in, cp-toast-fade");
    } finally {
      await app.close();
    }
  });

  test("a toast has no animation with its switch off", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await window.emulateMedia({ reducedMotion: "no-preference" });
      await openSettings(window);
      await window.getByRole("checkbox", { name: "Opening and closing panels and dialogs" }).uncheck();
      // Motion's own Reset would turn the switch back on, so the toast comes from Appearance's.
      await window.getByRole("button", { name: "Reset to defaults" }).first().click();
      await window.getByRole("button", { name: "Reset", exact: true }).click();
      const toast = window.locator(".cp-toast").first();
      await expect(toast).toBeVisible();
      expect(await toast.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
    } finally {
      await app.close();
    }
  });
});
