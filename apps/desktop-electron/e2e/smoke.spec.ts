import { test, expect } from "@playwright/test";
import { _electron as electron } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

test.describe("Electron desktop smoke (TC-UI-001)", () => {
  test("app launches and shows main navigation", async () => {
    // Its own profile directory: the app persists UI state, and a test run
    // should not read or write the real CuePoint profile.
    const userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-smoke-"));
    const env = { ...process.env, NODE_ENV: "production" } as Record<string, string>;
    // Inherited from a developer shell this makes electron run as plain Node,
    // and the app never starts. `shell.spec.ts` drops it for the same reason.
    delete env.ELECTRON_RUN_AS_NODE;

    const app = await electron.launch({
      cwd: DESKTOP_ROOT,
      args: [".", `--user-data-dir=${userDataDir}`],
      env,
    });

    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await expect(window).toHaveTitle(/CuePoint/i, { timeout: 30_000 });
      await expect(
        window.getByRole("navigation", { name: /main navigation/i }),
      ).toBeVisible({ timeout: 15_000 });
      // Scoped to the navigation, and exact: a page can carry its own link of
      // the same name, and which page the app opens on depends on stored state.
      // Clean, because matching lives there since inKey retired (DEC-071).
      const nav = window.getByRole("navigation", { name: /main navigation/i });
      await expect(nav.getByRole("link", { name: "Clean", exact: true })).toBeVisible();
      await expect(nav.getByRole("link", { name: "inKey", exact: true })).toHaveCount(0);
      // The navigation renders outside <Routes>, so asserting it alone passed
      // even while no route matched and the content area was empty. Assert the
      // screen too.
      await expect(window.locator("main.app-main .screen")).toBeVisible({ timeout: 15_000 });
    } finally {
      await app.close();
      rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});
