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

test.describe("Motion with every kind on (PAGES-12)", () => {
  let userDataDir: string;

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), "cuepoint-e2e-"));
  });

  test.afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true });
  });

  /** Onboarding dismissed, every kind on (no stored overrides), the system not asking for less. */
  async function ready(window: Page): Promise<void> {
    await window.emulateMedia({ reducedMotion: "no-preference" });
    await window.evaluate(() => {
      localStorage.setItem("cuepoint-onboarding-complete", "1");
      localStorage.setItem("cuepoint-phase14-note-seen", "1");
      localStorage.removeItem("cuepoint-motion");
    });
    await window.reload();
    await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
  }

  test("a click on a closing dialog's backdrop lands on what is behind it at once", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await ready(window);
      await window.getByRole("navigation", { name: /main navigation/i }).getByRole("link", { name: "Settings" }).click();
      await expect(window.getByRole("checkbox", { name: "Button presses" })).toBeChecked({ timeout: 15_000 });

      // Watch for the leaving copy, so the test knows the exit really held an element.
      await window.evaluate(() => {
        const w = window as unknown as { __sawLeaving: boolean };
        w.__sawLeaving = false;
        new MutationObserver(() => {
          if (document.querySelector(".cp-modal__backdrop[data-leaving]")) w.__sawLeaving = true;
        }).observe(document.body, { subtree: true, childList: true, attributes: true });
      });

      const reset = window.getByRole("region", { name: "Motion" }).getByRole("button", { name: "Reset to defaults" });
      await reset.click();
      const dialog = window.getByRole("dialog");
      await expect(dialog).toBeVisible();

      // Cancel closes it. Focus goes back to the button that opened it, so that button is on screen,
      // behind the backdrop that is still fading. The very next click is on it.
      await dialog.getByRole("button", { name: "Cancel" }).click();
      const box = (await reset.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      const hit = await window.evaluate(
        ([px, py]) => {
          const element = document.elementFromPoint(px!, py!);
          return {
            leaving: document.querySelector(".cp-modal__backdrop[data-leaving]") !== null,
            behind: element !== null && element.closest(".cp-modal__backdrop") === null,
          };
        },
        [x, y],
      );
      // The exit is holding a copy, and a pointer over it reaches the page.
      expect(hit).toEqual({ leaving: true, behind: true });
      await window.mouse.click(x, y);
      // The click landed on the button behind: its dialog opens again.
      await expect(window.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
      expect(await window.evaluate(() => (window as unknown as { __sawLeaving: boolean }).__sawLeaving)).toBe(true);
      // And the leaving copy goes by itself, leaving the one new dialog.
      await expect(window.locator(".cp-modal__backdrop")).toHaveCount(1, { timeout: 2_000 });
    } finally {
      await app.close();
    }
  });

  test("a page change shows the new heading within one frame, stepping in without hiding it", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await ready(window);
      const result = await window.evaluate(async () => {
        const link = [...document.querySelectorAll<HTMLAnchorElement>("nav a")].find(
          (a) => a.getAttribute("aria-label") === "Settings",
        )!;
        const main = document.querySelector("main.app-main")!;
        const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        // Counted from the frame the route changes in, not from the click: how
        // long the click takes to become a route depends on the machine, and
        // the claim is that the page does not wait once it has (no data first).
        const hashBefore = location.hash;
        const inserted = new Promise<number>((resolve) => {
          let frames = 0;
          let routeFrame = -1;
          const tick = () => {
            frames += 1;
            if (routeFrame < 0 && location.hash !== hashBefore) routeFrame = frames;
            if (main.querySelector("h1")?.textContent === "Settings") resolve(frames - Math.max(routeFrame, 0));
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        link.click();
        const framesToHeading = await inserted;
        // ...and the one after it: the heading is on screen, the page is stepping in, nothing hidden.
        await frame();
        const heading = main.querySelector("h1") as HTMLElement;
        const screen = main.querySelector(":scope > .screen") as HTMLElement;
        const style = getComputedStyle(screen);
        return {
          hashChanged: location.hash !== hashBefore,
          framesToHeading,
          headingWidth: heading.getBoundingClientRect().width,
          phase: main.getAttribute("data-page-phase"),
          animation: style.animationName,
          opacity: Number(style.opacity),
          visibility: style.visibility,
        };
      });
      test.info().annotations.push({ type: "frames", description: JSON.stringify(result) });
      expect(result.hashChanged).toBe(true);
      // The heading is there in the frame the route changes in, or the next.
      expect(result.framesToHeading).toBeLessThanOrEqual(1);
      expect(result.headingWidth).toBeGreaterThan(0);
      expect(result.phase).toMatch(/^[ab]$/);
      expect(result.animation).toMatch(/cp-page-step-[ab], cp-page-fade-[ab]/);
      // It starts from half, so the heading is never hidden by the step.
      expect(result.opacity).toBeGreaterThanOrEqual(0.5);
      expect(result.visibility).toBe("visible");
    } finally {
      await app.close();
    }
  });

  test("with the Changing page switch off the page just changes", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await ready(window);
      await window.evaluate(() => localStorage.setItem("cuepoint-motion", JSON.stringify({ page: false })));
      await window.reload();
      await window.locator("main.app-main .screen").waitFor({ timeout: 30_000 });
      await window.getByRole("navigation", { name: /main navigation/i }).getByRole("link", { name: "Settings" }).click();
      await expect(window.locator("main.app-main h1")).toHaveText("Settings");
      const animation = await window.locator("main.app-main > .screen").evaluate((el) => getComputedStyle(el).animationName);
      expect(animation).toBe("none");
    } finally {
      await app.close();
    }
  });

  test("buttons step, and every running animation moves only transform and opacity, a fade linearly", async () => {
    const app = await launch(userDataDir);
    try {
      const window = await app.firstWindow({ timeout: 60_000 });
      await ready(window);
      await window.getByRole("navigation", { name: /main navigation/i }).getByRole("link", { name: "Settings" }).click();
      await expect(window.getByRole("checkbox", { name: "Button presses" })).toBeVisible({ timeout: 15_000 });
      const timings = await window.evaluate(() => {
        const button = document.querySelector(".cp-btn") as HTMLElement;
        const style = getComputedStyle(button);
        return { property: style.transitionProperty, timing: style.transitionTimingFunction };
      });
      expect(timings.property).toBe("transform");
      expect(timings.timing).toMatch(/steps\(1/);
      // Every running animation on the page moves only transform or opacity, and a fade is linear.
      const animations = await window.evaluate(() =>
        document.getAnimations().map((a) => {
          const effect = a.effect as KeyframeEffect;
          const props = new Set<string>();
          for (const frame of effect.getKeyframes()) for (const key of Object.keys(frame)) props.add(key);
          for (const skip of ["offset", "easing", "composite", "computedOffset"]) props.delete(skip);
          return { props: [...props], easing: effect.getTiming().easing };
        }),
      );
      for (const animation of animations) {
        for (const prop of animation.props) expect(["transform", "opacity"]).toContain(prop);
        if (animation.props.includes("opacity")) expect(animation.easing).toBe("linear");
      }
    } finally {
      await app.close();
    }
  });
});
