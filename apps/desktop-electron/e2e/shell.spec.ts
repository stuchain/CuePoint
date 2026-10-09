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
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chooseMenuItem, menuItems } from "./appMenu";
import { waitForEngine } from "./engineReady";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const TONE = path.join(REPO_ROOT, "src", "tests", "fixtures", "audio", "tone.mp3");
const SCALE_KEY = "cuepoint-ui-lab-scale";

function launch(userDataDir: string): Promise<ElectronApplication> {
  // The engine's home lives inside the profile, so a restart within a test sees
  // the same library and the test never reads the real `~/.cuepoint`, whose
  // collections and tracks change what the keyboard walk reaches.
  const env = {
    ...process.env,
    NODE_ENV: "production",
    CUEPOINT_HOME: path.join(userDataDir, "cuepoint-home"),
  } as Record<string, string>;
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
  await window.evaluate(() => (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.setItem("cuepoint-phase14-note-seen", "1")));
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
      // With nothing remembered, home is the Library (DEC-100), not Tools'
      // landing page.
      await expect(
        window.getByRole("navigation", { name: /main navigation/i }).getByRole("link", {
          name: "Library",
          exact: true,
        }),
      ).toHaveAttribute("aria-current", "page");
      expect(new URL(window.url()).hash).toBe("#/library");
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

      await expect(window.getByLabel("Beatport token")).toBeVisible({ timeout: 15_000 });
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
      await waitForEngine(window);

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
      await expect(window.getByText(/didn't work/i)).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test("remembers the inspector's width and visibility across a restart (DEC-018)", async () => {
    const first = await launch(userDataDir);
    try {
      const window = await first.firstWindow({ timeout: 60_000 });
      await dismissOnboarding(window);

      const panel = window.getByRole("complementary", { name: /track details/i });
      await expect(panel).toBeVisible({ timeout: 15_000 });
      const before = (await panel.boundingBox())!.width;

      // Drag the handle 120px left. Only a real pointer proves this works: the
      // component tests can exercise the keyboard path but not a drag.
      const handle = window.getByRole("separator", { name: /resize track details/i });
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
      const panel = window.getByRole("complementary", { name: /track details/i });
      await expect(panel).toBeVisible({ timeout: 30_000 });
      expect(Math.round((await panel.boundingBox())!.width)).toBe(440);

      // Hiding gives the space back, and is remembered too.
      await window.getByRole("button", { name: /hide track details/i }).click();
      await expect(panel).toHaveCount(0);
    } finally {
      await second.close();
    }

    const third = await launch(userDataDir);
    try {
      const window = await third.firstWindow({ timeout: 60_000 });
      await expect(
        window.getByRole("button", { name: /show track details/i }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        window.getByRole("complementary", { name: /track details/i }),
      ).toHaveCount(0);
    } finally {
      await third.close();
    }
  });

  test("remembers a collapsed sidebar across a restart (DEC-022)", async () => {
    const first = await launch(userDataDir);
    try {
      const window = await first.firstWindow({ timeout: 60_000 });
      await dismissOnboarding(window);
      const nav = window.getByRole("navigation", { name: /main navigation/i });
      await expect(nav).toHaveAttribute("data-collapsed", "false");

      await window.getByRole("button", { name: /collapse sidebar/i }).click();
      await expect(nav).toHaveAttribute("data-collapsed", "true");
    } finally {
      await first.close();
    }

    const second = await launch(userDataDir);
    try {
      const window = await second.firstWindow({ timeout: 60_000 });
      const nav = window.getByRole("navigation", { name: /main navigation/i });
      await expect(nav).toHaveAttribute("data-collapsed", "true", { timeout: 30_000 });

      // Every destination is still reachable with labels hidden — the state
      // DEC-022 chose, where an icon is all there is to go on.
      for (const label of ["Library", "Collections", "Clean", "Discover", "Statistics", "Settings"]) {
        await expect(nav.getByRole("link", { name: label, exact: true })).toBeVisible();
      }
    } finally {
      await second.close();
    }
  });

  test("the whole shell is operable from the keyboard (SHELL-10)", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await dismissOnboarding(window);

      // Tab from the top and record where focus goes, until the status strip's
      // Activity button — the last shell region. Every region has to appear on
      // the way, or some part of the app is mouse-only. Walked to a stop rather
      // than a count: a count had to change with every page a phase enabled
      // (Collections, Clean, Discover), and a stop still fails on focus lost to
      // the body or a region skipped. Bounded, so a trap fails rather than hangs.
      const reached: string[] = [];
      for (let i = 0; i < 40 && !reached.join("|").includes("Activity"); i += 1) {
        await window.keyboard.press("Tab");
        reached.push(
          await window.evaluate(() => {
            const el = document.activeElement;
            if (!el || el === document.body) return "BODY";
            return `${el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 18) ?? ""}`;
          }),
        );
      }
      expect(reached).not.toContain("BODY");
      expect(reached.join("|")).toMatch(/Search library/);
      expect(reached.join("|")).toMatch(/sidebar/);
      expect(reached.join("|")).toMatch(/track details/i);
      expect(reached.join("|")).toMatch(/Activity/);

      // The bindings the shortcuts dialog promises.
      await window.keyboard.press("Control+b");
      await expect(
        window.getByRole("navigation", { name: /main navigation/i }),
      ).toHaveAttribute("data-collapsed", "true");
      await window.keyboard.press("Control+b");

      await window.keyboard.press("Control+i");
      await expect(
        window.getByRole("button", { name: /show track details/i }),
      ).toBeVisible();
      await window.keyboard.press("Control+i");

      await window.keyboard.press("Control+k");
      await expect(window.getByRole("combobox", { name: /search library/i })).toBeFocused();

      await window.keyboard.press("Control+Shift+a");
      const dialog = window.getByRole("dialog", { name: /activity/i });
      await expect(dialog).toBeVisible();
      // Escape closes it — nothing did before SHELL-10.
      await window.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test("reopens on the last-visited destination after a restart (DEC-027)", async () => {
    const first = await launch(userDataDir);
    try {
      const window = await first.firstWindow({ timeout: 60_000 });
      await dismissOnboarding(window);
      await window.getByRole("navigation", { name: /main navigation/i })
        .getByRole("link", { name: "Discover" })
        .click();
      await expect(
        window.getByRole("navigation", { name: /main navigation/i }).getByRole("link", {
          name: "Discover",
        }),
      ).toHaveAttribute("aria-current", "page", { timeout: 15_000 });
    } finally {
      await first.close();
    }

    // Same profile directory, so whatever the first launch stored is all the
    // second one has to go on.
    const second = await launch(userDataDir);
    try {
      const window = await second.firstWindow({ timeout: 60_000 });
      await expect(
        window.getByRole("navigation", { name: /main navigation/i }).getByRole("link", {
          name: "Discover",
        }),
      ).toHaveAttribute("aria-current", "page", { timeout: 30_000 });
      expect(new URL(window.url()).hash).toBe("#/discover");
    } finally {
      await second.close();
    }
  });

  test("reopens a remembered Tools or inCrate on the page that replaced it (DEC-100)", async () => {
    // What an older build left stored: its home, Tools, or inCrate.
    for (const [stored, hash] of [
      ["incrate", "#/discover"],
      ["tools", "#/library"],
    ] as const) {
      const first = await launch(userDataDir);
      try {
        const window = await first.firstWindow({ timeout: 60_000 });
        await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
        await window.evaluate((id) => {
          (localStorage.setItem("cuepoint-onboarding-complete", "1"), localStorage.setItem("cuepoint-phase14-note-seen", "1"));
          localStorage.setItem("cuepoint-ui-shell-last-destination", id);
        }, stored);
      } finally {
        await first.close();
      }

      const second = await launch(userDataDir);
      try {
        const window = await second.firstWindow({ timeout: 60_000 });
        await expect
          .poll(() => new URL(window.url()).hash, { timeout: 30_000 })
          .toBe(hash);
        await expect(window.locator("main.app-main .screen")).toBeAttached();
      } finally {
        await second.close();
      }
    }
  });

  /** A small Rekordbox export with real files, imported through the bridge. */
  async function importLibrary(window: Page, dir: string): Promise<void> {
    const music = path.join(dir, "music");
    mkdirSync(music, { recursive: true });
    const tracks: string[] = [];
    const keys: string[] = [];
    for (let i = 1; i <= 8; i += 1) {
      const file = path.join(music, `${String(i).padStart(2, "0")}.mp3`);
      copyFileSync(TONE, file);
      const location = "file://localhost/" + file.replace(/\\/g, "/").replace(/^\/+/, "");
      tracks.push(
        `<TRACK TrackID="${i}" Name="Moonlight ${String(i).padStart(2, "0")}" Artist="Artist ${i}" ` +
          `Genre="House" Tonality="${i}A" AverageBpm="${120 + i}.00" TotalTime="1" Location="${location}"/>`,
      );
      keys.push(`<TRACK Key="${i}"/>`);
    }
    const xml = path.join(dir, "collection.xml");
    writeFileSync(
      xml,
      `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.8.5" Company="AlphaTheta"/>
  <COLLECTION Entries="8">
${tracks.join("\n")}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="Friday" Type="1" KeyType="0" Entries="8">${keys.join("")}</NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`,
      "utf-8",
    );
    const started = await window.evaluate(
      (xmlPath) =>
        (
          window as never as {
            cuepoint: { startLibraryImport: (p: { xml_path: string }) => Promise<{ job_id: string }> };
          }
        ).cuepoint.startLibraryImport({ xml_path: xmlPath }),
      xml,
    );
    await expect
      .poll(
        async () =>
          (
            await window.evaluate(
              (id) =>
                (window as never as { cuepoint: { getJob: (i: string) => Promise<{ state: string }> } }).cuepoint.getJob(id),
              started.job_id,
            )
          ).state,
        { timeout: 90_000 },
      )
      .toBe("succeeded");
  }

  test("searching for a track and pressing Enter opens it, selected, in the Library (HDR-1)", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await dismissOnboarding(window);
      await waitForEngine(window);
      await importLibrary(window, userDataDir);
      await window.getByRole("link", { name: "Settings", exact: true }).click();

      const search = window.getByRole("combobox", { name: /search library/i });
      await search.fill("moonlight 07");
      await expect(window.getByRole("listbox", { name: /search results/i })).toBeVisible({ timeout: 15_000 });
      await expect(
        window.getByRole("listbox", { name: /search results/i }).getByRole("option"),
      ).toHaveCount(1);
      await search.press("Enter");

      await expect(
        window.getByRole("navigation", { name: /main navigation/i }).getByRole("link", { name: "Library", exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(window.locator(".library-screen .track-table__row[aria-selected='true']")).toContainText(
        "Moonlight 07",
        { timeout: 30_000 },
      );
      await expect(window.getByRole("complementary", { name: /track details/i })).toContainText("Moonlight 07", {
        timeout: 30_000,
      });
      // The panel closed on the way out.
      await expect(window.getByRole("listbox")).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test("the panel closes when you click elsewhere (HDR-2)", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await dismissOnboarding(window);
      await waitForEngine(window);
      await importLibrary(window, userDataDir);

      await window.getByRole("combobox", { name: /search library/i }).fill("moonlight");
      await expect(window.getByRole("listbox")).toBeVisible({ timeout: 15_000 });
      // The status strip is below the panel, which covers the top of the page.
      await window.locator(".app-shell__status").click({ position: { x: 4, y: 4 } });
      await expect(window.getByRole("listbox")).toHaveCount(0);
    } finally {
      await app.close();
    }
  });

  test("one menu bar, CuePoint's: File, Edit, View and Help, and no zoom (FLW-20)", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await dismissOnboarding(window);
      await waitForEngine(window);
      // The renderer reports its sizes once it starts; the Size menu is built from them.
      await expect.poll(async () => (await menuItems(app)).some((item) => item.id === "size:2")).toBe(true);

      const items = await menuItems(app);
      const labels = items.map((item) => item.label);
      for (const label of ["File", "Edit", "View", "Help", "Import another file…", "Track details", "Privacy"]) {
        expect(labels, label).toContain(label);
      }
      expect(items.filter((item) => /zoom/i.test(item.role) || /zoom/i.test(item.label))).toEqual([]);
      // Nothing is drawn in the window.
      await expect(window.getByRole("button", { name: "Help", exact: true })).toHaveCount(0);
      expect(items.find((item) => item.id === "size:1.5")?.checked).toBe(true);
    } finally {
      await app.close();
    }
  });

  test("View → Size → Large sets 2×, Settings shows it, and Ctrl+0 returns to 1.5× (FLW-20)", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await dismissOnboarding(window);
      await waitForEngine(window);
      const scale = () => window.evaluate(() => document.documentElement.dataset.scale);
      expect(await scale()).toBe("1.5");
      await expect.poll(async () => (await menuItems(app)).some((item) => item.id === "size:2")).toBe(true);

      await chooseMenuItem(app, "size:2");

      await expect.poll(scale).toBe("2");
      expect(await window.evaluate((key) => localStorage.getItem(key), SCALE_KEY)).toBe("2");
      // The menu ticks the new size.
      await expect
        .poll(async () => (await menuItems(app)).find((item) => item.id === "size:2")?.checked)
        .toBe(true);
      await window.getByRole("link", { name: "Settings", exact: true }).click();
      await expect(window.getByLabel("Size of text and controls")).toHaveValue("2", { timeout: 15_000 });

      // Ctrl+0, Ctrl+= and Ctrl+- are the accelerators of Default size, Bigger and Smaller, and
      // those items step the setting; none of them zooms the page. Neither Playwright's key
      // presses nor a synthesized input event reach a native accelerator, so each item is
      // chosen as the accelerator would choose it.
      const items = await menuItems(app);
      expect(items.find((item) => item.id === "size-default")?.accelerator).toBe("CmdOrCtrl+0");
      expect(items.find((item) => item.id === "size-bigger")?.accelerator).toBe("CmdOrCtrl+=");
      expect(items.find((item) => item.id === "size-smaller")?.accelerator).toBe("CmdOrCtrl+-");

      await chooseMenuItem(app, "size-default");
      await expect.poll(scale).toBe("1.5");
      await expect(window.getByLabel("Size of text and controls")).toHaveValue("1.5");
      await chooseMenuItem(app, "size-bigger");
      await expect.poll(scale).toBe("2");
      await chooseMenuItem(app, "size-smaller");
      await chooseMenuItem(app, "size-smaller");
      await expect.poll(scale).toBe("1");
      expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getZoomFactor())).toBe(1);
    } finally {
      await app.close();
    }
  });

  test("Help → Privacy opens Settings at Privacy, and View → Sidebar toggles the sidebar (FLW-20)", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await dismissOnboarding(window);
      await waitForEngine(window);

      await chooseMenuItem(app, "privacy");
      await expect(window.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible({ timeout: 15_000 });
      await expect(window.locator("#settings-privacy")).toBeVisible();

      const nav = window.getByRole("navigation", { name: /main navigation/i });
      await expect(nav).toHaveAttribute("data-collapsed", "false");
      await chooseMenuItem(app, "toggle-sidebar");
      await expect(nav).toHaveAttribute("data-collapsed", "true");
    } finally {
      await app.close();
    }
  });
});
