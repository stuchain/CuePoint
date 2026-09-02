/**
 * Shell navigation in a packaged-mode build (SHELL-03).
 *
 * These exist because of a defect that shipped unnoticed: the app was built
 * with `BrowserRouter` while production loads the renderer from a `file://`
 * URL, so no route ever matched and the content area was empty on every screen.
 * The only E2E test asserted the navigation element and a link — both rendered
 * outside `<Routes>` — so it passed throughout. **Every test here asserts screen
 * content**, which is the assertion whose absence let that hide.
 *
 * Each launch gets its own `--user-data-dir`, so a run never reads or writes the
 * real CuePoint profile, and the restart test controls exactly what is stored.
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
  const env = { ...process.env, NODE_ENV: "production" } as Record<string, string>;
  // Inherited from a developer shell this makes electron run as plain Node, and
  // the app never starts.
  delete env.ELECTRON_RUN_AS_NODE;

  return electron.launch({
    cwd: DESKTOP_ROOT,
    args: [".", `--user-data-dir=${userDataDir}`],
    env,
  });
}

/**
 * A fresh profile shows the onboarding dialog, whose backdrop swallows clicks.
 * Dismissing it through storage keeps these tests about navigation. The reload
 * is also worth something on its own: reloading used to fail outright, because
 * in-app navigation rewrote the file:// URL to a path that does not exist.
 */
async function dismissOnboarding(window: Page): Promise<void> {
  await window.evaluate(() => localStorage.setItem("cuepoint-onboarding-complete", "1"));
  await window.reload();
  await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
}

test.describe("Application shell navigation", () => {
  let userDataDir: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
  });

  test.afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  test("renders a screen on first paint", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      // Attachment, not visibility: on a first run the onboarding dialog covers
      // the screen, and what failed before was that no screen existed at all.
      await expect(window.locator("main.app-main .screen")).toBeAttached({ timeout: 30_000 });
      await expect(window.locator("main.app-main")).toContainText(
        /Select a tool to get started/i,
      );
    } finally {
      await app.close();
    }
  });

  test("navigates to another destination and renders its screen", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await dismissOnboarding(window);

      await window.getByRole("navigation", { name: /main navigation/i })
        .getByRole("link", { name: "Settings" })
        .click();

      await expect(window.getByText(/Beatport token/i)).toBeVisible({ timeout: 15_000 });
    } finally {
      await app.close();
    }
  });

  test("global search reaches the engine and comes back (SHELL-04)", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await dismissOnboarding(window);
      // The engine sidecar starts asynchronously; searching before it is up
      // would test the wrong thing.
      await expect(window.locator(".cp-status__engine--ok")).toBeVisible({ timeout: 60_000 });

      await window.getByRole("combobox", { name: /search library/i }).fill("deadmau5");

      // Deliberately data-independent: this machine's library may hold anything
      // or nothing, so assert the round trip *resolved* rather than what it
      // found. Any of these three is a working search; "Search failed" is not,
      // and neither is being stuck on "Searching…".
      const panel = window.locator(".cp-global-search__panel");
      await expect(panel).toBeVisible({ timeout: 15_000 });
      await expect(
        panel.locator(
          ".cp-global-search__summary, .cp-global-search__note",
        ),
      ).toHaveText(/result|No tracks match|No library yet/i, { timeout: 15_000 });

      // The bug this test exists for: the IPC channel and the client method
      // both existed, but `EngineSupervisor` never forwarded the call, so the
      // whole path failed only in the running app.
      await expect(window.getByText(/Search failed/i)).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test("remembers the inspector's width and visibility across a restart (DEC-018)", async () => {
    const first = await launch(userDataDir);
    try {
      const window = await first.firstWindow({ timeout: 60_000 });
      await dismissOnboarding(window);

      const panel = window.getByRole("complementary", { name: /track inspector/i });
      await expect(panel).toBeVisible({ timeout: 15_000 });
      const before = (await panel.boundingBox())!.width;

      // Drag the handle 120px left. Only a real pointer proves this works: the
      // component tests can exercise the keyboard path but not a drag.
      const handle = window.getByRole("separator", { name: /resize track inspector/i });
      const box = (await handle.boundingBox())!;
      await window.mouse.move(box.x + box.width / 2, box.y + 100);
      await window.mouse.down();
      await window.mouse.move(box.x + box.width / 2 - 120, box.y + 100, { steps: 10 });
      await window.mouse.up();

      await expect
        .poll(async () => Math.round((await panel.boundingBox())!.width))
        .toBe(Math.round(before) + 120);
    } finally {
      await first.close();
    }

    // Same profile: only what was stored can bring the width back.
    const second = await launch(userDataDir);
    try {
      const window = await second.firstWindow({ timeout: 60_000 });
      const panel = window.getByRole("complementary", { name: /track inspector/i });
      await expect(panel).toBeVisible({ timeout: 30_000 });
      expect(Math.round((await panel.boundingBox())!.width)).toBe(440);

      // Hiding gives the space back, and is remembered too.
      await window.getByRole("button", { name: /hide track inspector/i }).click();
      await expect(panel).toHaveCount(0);
    } finally {
      await second.close();
    }

    const third = await launch(userDataDir);
    try {
      const window = await third.firstWindow({ timeout: 60_000 });
      await expect(
        window.getByRole("button", { name: /show track inspector/i }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        window.getByRole("complementary", { name: /track inspector/i }),
      ).toHaveCount(0);
    } finally {
      await third.close();
    }
  });

  test("reopens on the last-visited destination after a restart (DEC-027)", async () => {
    const first = await launch(userDataDir);
    try {
      const window = await first.firstWindow({ timeout: 60_000 });
      await dismissOnboarding(window);
      await window.getByRole("navigation", { name: /main navigation/i })
        .getByRole("link", { name: "inCrate" })
        .click();
      await expect(window.getByText(/CuePoint \/ inCrate/i)).toBeVisible({ timeout: 15_000 });
    } finally {
      await first.close();
    }

    // Same profile directory, so whatever the first launch stored is all the
    // second one has to go on.
    const second = await launch(userDataDir);
    try {
      const window = await second.firstWindow({ timeout: 60_000 });
      await expect(window.getByText(/CuePoint \/ inCrate/i)).toBeVisible({ timeout: 30_000 });
    } finally {
      await second.close();
    }
  });
});
