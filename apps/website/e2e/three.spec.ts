import { chromium, expect, test, type Page } from "@playwright/test";

/**
 * SITE-05's 3D runtime, in a real browser on /styleguide/three/ (preview builds only).
 *
 * The page has a scene in the first screen and a second one far down. A scene starts only after the
 * page has loaded, the browser is idle, the visitor has done something (a key press is the quietest
 * thing the tests can do) and the scene is within a screen. Where WebGL is needed it comes from
 * SwiftShader, Chromium's software renderer, which the software-GL gate would block: capableDevice() opts in
 * through the preview-only __cuepointStageConfig, fakes 8 cores and 8 GB, and lowers the frame-rate floor
 * so a busy test machine does not stop the scene. The tests of those rules switch them back.
 */
const PAGE = "styleguide/three/";
const SCENE = "[data-scene]";
const CANVAS = "[data-scene] canvas";
const START_MARK = "cuepoint:3d-start";
const RELEASED_KEY = "cuepoint:stage-released";

async function expectOk(page: Page, path: string) {
  const response = await page.goto(path);
  expect(response?.ok(), `GET /${path} must succeed (is another site on the port?)`).toBe(true);
}

async function capableDevice(page: Page, config: { minFps?: number; allowSoftwareGL?: boolean } = {}) {
  await page.addInitScript((cfg) => {
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
    Object.defineProperty(navigator, "deviceMemory", { value: 8, configurable: true });
    window.__cuepointStageConfig = { minFps: 1, allowSoftwareGL: true, ...cfg };
  }, config);
}

/** Loads the page and does the quietest possible thing a visitor does: press a key. */
async function openScenePage(page: Page) {
  await expectOk(page, PAGE);
  await page.keyboard.press("Shift");
}

const first = (page: Page) => page.locator(SCENE).first();

/** The 3D chunk has been fetched and its start marked (it happens at idle, before any gesture). */
async function prefetched(page: Page, ms = 4000): Promise<boolean> {
  return page
    .waitForFunction((m) => performance.getEntriesByName(m).length > 0, START_MARK, { timeout: ms })
    .then(() => true, () => false);
}

async function expectStillShown(page: Page) {
  const still = first(page).locator(".still img:visible");
  await expect(still).toHaveCount(1);
  await expect(still).toHaveJSProperty("complete", true);
  expect(await still.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
}

async function frames(page: Page): Promise<number> {
  return page.evaluate(() => window.__cuepointStage?.frames ?? -1);
}

const debug = (page: Page) => page.evaluate(() => window.__cuepointStage);

test.describe("the 3D test scene", () => {
  test("is a small pixel image with fixed width and height; only the visible theme's still is fetched; no canvas in the HTML", async ({
    page,
    request,
  }) => {
    const html = await (await request.get(PAGE)).text();
    expect(html).not.toContain("<canvas");
    const stills: string[] = [];
    page.on("request", (r) => {
      if (/cubes-\w+\.[\w-]+\.png/.test(r.url())) stills.push(r.url());
    });
    await expectOk(page, PAGE);
    const img = first(page).locator(".still img").first();
    await expect(img).toHaveAttribute("width", "320");
    await expect(img).toHaveAttribute("height", "180");
    await expect(img).toHaveAttribute("fetchpriority", "high");
    await expectStillShown(page);
    expect(await first(page).locator(".still img:visible").evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBe(320);
    expect(await first(page).locator(".still img:visible").evaluate((i) => getComputedStyle(i).imageRendering)).toBe("pixelated");
    // the other themes' images are lazy and hidden: never downloaded
    expect(stills.length).toBe(1);
    expect(stills[0]).toContain("neoDark");
  });

  test("does not start without the visitor doing anything, and starts when they do", async ({ page }) => {
    await capableDevice(page);
    await expectOk(page, PAGE);
    expect(await prefetched(page)).toBe(true);
    await page.waitForTimeout(1500);
    await expect(page.locator(CANVAS)).toHaveCount(0);
    await expect(first(page)).toHaveAttribute("data-scene-state", "waiting");
    await page.keyboard.press("Shift");
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 20_000 });
  });

  test("does not start a scene that is far away; the one in view starts", async ({ page }) => {
    await capableDevice(page);
    await openScenePage(page);
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 20_000 });
    await expect(first(page)).toHaveAttribute("data-scene-state", "running");
    await expect(page.locator(SCENE).nth(1)).toHaveAttribute("data-scene-state", "waiting");
  });

  test("with WebGL, the canvas appears over the still and the still stays under it", async ({ page }) => {
    await capableDevice(page);
    await openScenePage(page);
    const canvas = page.locator(CANVAS);
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    await expect(canvas).toHaveAttribute("aria-hidden", "true");
    await expect(first(page)).toHaveAttribute("data-scene-state", "running");
    await expectStillShown(page);

    // the canvas covers the still exactly, and is on top of it
    const [c, s] = await Promise.all([canvas.boundingBox(), first(page).locator(".still img:visible").boundingBox()]);
    expect(Math.abs(c!.width - s!.width)).toBeLessThanOrEqual(4);
    expect(Math.abs(c!.height - s!.height)).toBeLessThanOrEqual(4);
    const topmost = await page.evaluate(() => {
      const r = document.querySelector("[data-scene] canvas")!.getBoundingClientRect();
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.tagName;
    });
    expect(topmost).toBe("CANVAS");
    // the canvas has real pixels, and a whole number of device pixels per scene pixel
    const size = await page.evaluate(() => {
      const el = document.querySelector("[data-scene] canvas") as HTMLCanvasElement;
      return { w: el.width, h: el.height, len: el.toDataURL("image/png").length };
    });
    expect(size.len).toBeGreaterThan(500);
    expect(size.w % 4).toBe(0);
    expect((await debug(page))?.status).toBe("running");
  });

  test("the 3D chunk is requested after the page has loaded", async ({ page }) => {
    await capableDevice(page);
    await openScenePage(page);
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 20_000 });
    const order = await page.evaluate((m) => {
      const mark = performance.getEntriesByName(m)[0]!.startTime;
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const entry = performance.getEntriesByType("resource").find((e) => /entry\.[\w-]+\.js/.test(e.name));
      return { mark, load: nav.loadEventEnd, entry: entry?.startTime ?? -1 };
    }, START_MARK);
    expect(order.mark).toBeGreaterThanOrEqual(order.load);
    expect(order.entry).toBeGreaterThanOrEqual(order.mark);
  });

  test("scrolling changes the picture, and the loop sleeps when no scene is on screen", async ({ page }) => {
    await capableDevice(page);
    await openScenePage(page);
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => frames(page), { timeout: 15_000 }).toBeGreaterThan(30);
    await page.waitForTimeout(2500); // past the probe: only changes render

    const before = await frames(page);
    await page.mouse.wheel(0, 200);
    await expect.poll(() => frames(page)).toBeGreaterThan(before);

    // between the two scenes: nothing is within the screen
    await page.evaluate(() => document.getElementById("between")!.scrollIntoView({ block: "center" }));
    await page.waitForTimeout(900);
    const asleep = await frames(page);
    await page.waitForTimeout(700);
    expect(await frames(page)).toBe(asleep);
  });

  test("a theme change recolors the scene", async ({ page }) => {
    await capableDevice(page);
    await openScenePage(page);
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    const before = await frames(page);
    await page.locator('[data-theme-switch] [data-theme-choice="clubNeon"]').click();
    await expect.poll(() => frames(page)).toBeGreaterThan(before);
  });

  test("slow frames step the quality down: shadows off, then bigger pixels", async ({ page }) => {
    await capableDevice(page);
    // about 12 frames a second, and the page keeps scrolling so every frame renders
    await page.addInitScript(() => {
      window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 80);
      let d = 1;
      window.setInterval(() => window.scrollBy(0, (d = -d) * 2), 40);
    });
    await openScenePage(page);
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 20_000 });
    await expect.poll(async () => (await debug(page))?.pixelSize, { timeout: 60_000 }).toBeGreaterThan(4);
    const state = await debug(page);
    expect(state?.shadowSize).toBe(0);
    expect(state?.status).toBe("running");
  });

  test("a software renderer is blocked: no import, no canvas, the still is shown", async ({ page }) => {
    await capableDevice(page, { allowSoftwareGL: false });
    await openScenePage(page);
    expect(await prefetched(page, 2500)).toBe(false);
    await page.waitForTimeout(500);
    await expect(page.locator(CANVAS)).toHaveCount(0);
    await expect(first(page)).toHaveAttribute("data-scene-state", "still");
    expect(await page.evaluate(() => performance.getEntriesByType("resource").some((e) => /entry\.[\w-]+\.js/.test(e.name)))).toBe(false);
    await expectStillShown(page);
  });

  test("with WebGL disabled by the browser, no canvas and the still is shown", async ({ baseURL }) => {
    const browser = await chromium.launch({
      ...(process.env["PW_CHROMIUM_PATH"] ? { executablePath: process.env["PW_CHROMIUM_PATH"] } : {}),
      args: ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"],
    });
    try {
      const page = await (await browser.newContext(baseURL ? { baseURL } : {})).newPage();
      await capableDevice(page);
      await openScenePage(page);
      await page.waitForTimeout(1500);
      await expect(page.locator(CANVAS)).toHaveCount(0);
      await expectStillShown(page);
    } finally {
      await browser.close();
    }
  });

  test("with getContext overridden to fail, the scene stops and the still is shown", async ({ page }) => {
    await capableDevice(page);
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl/i.test(type)) return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof original;
    });
    await openScenePage(page);
    await expect(first(page)).toHaveAttribute("data-scene-state", "stopped", { timeout: 10_000 });
    await expect(page.locator(CANVAS)).toHaveCount(0);
    await expectStillShown(page);
  });

  test("with reduced motion, nothing is loaded for 3D, no canvas and the still is shown", async ({ page }) => {
    await capableDevice(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openScenePage(page);
    expect(await prefetched(page, 2500)).toBe(false);
    await expect(page.locator(CANVAS)).toHaveCount(0);
    await expectStillShown(page);
  });

  test("reduced motion turned on while the 3D runs stops it", async ({ page }) => {
    await capableDevice(page);
    await openScenePage(page);
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 20_000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.locator(CANVAS)).toHaveCount(0);
    const state = await debug(page);
    expect(state?.status).toBe("stopped");
    expect(state?.reason).toBe("reduced-motion");
    expect(state?.contextLost).toBe(true);
    await expectStillShown(page);
  });

  test("reduced motion turned on before a gesture cancels the start", async ({ page }) => {
    await capableDevice(page);
    await expectOk(page, PAGE);
    expect(await prefetched(page)).toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForTimeout(300); // the browser reports the change to the page a moment later
    await page.keyboard.press("Shift");
    await page.waitForTimeout(1500);
    await expect(page.locator(CANVAS)).toHaveCount(0);
    await expect(first(page)).toHaveAttribute("data-scene-state", "still");
  });

  test("with saveData on, nothing is loaded for 3D, no canvas and the still is shown", async ({ page }) => {
    await capableDevice(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "connection", { value: { saveData: true, effectiveType: "4g" }, configurable: true });
    });
    await openScenePage(page);
    expect(await prefetched(page, 2500)).toBe(false);
    await expect(page.locator(CANVAS)).toHaveCount(0);
    await expectStillShown(page);
  });

  test("on a small device (2 cores), no 3D", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "hardwareConcurrency", { value: 2, configurable: true });
      Object.defineProperty(navigator, "deviceMemory", { value: 8, configurable: true });
      window.__cuepointStageConfig = { allowSoftwareGL: true };
    });
    await openScenePage(page);
    expect(await prefetched(page, 2500)).toBe(false);
    await expect(page.locator(CANVAS)).toHaveCount(0);
    await expectStillShown(page);
  });

  test("a slow first half second stops the scene early and keeps the still", async ({ page }) => {
    await capableDevice(page, { minFps: 30 });
    // frames arrive at about 10 per second, and the floor is the real one
    await page.addInitScript(() => {
      window.requestAnimationFrame = (cb) => window.setTimeout(() => cb(performance.now()), 100);
    });
    await openScenePage(page);
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(CANVAS)).toHaveCount(0, { timeout: 15_000 });
    expect((await debug(page))?.reason).toBe("slow");
    expect((await debug(page))?.contextLost).toBe(true);
    await expectStillShown(page);
  });

  test("on pagehide the canvas goes and the WebGL context is released", async ({ page }) => {
    await capableDevice(page);
    await openScenePage(page);
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 20_000 });
    expect((await debug(page))?.contextLost).toBe(false);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide")));
    expect((await debug(page))?.contextLost).toBe(true);
    expect((await debug(page))?.status).toBe("disposed");
    await expect(page.locator(CANVAS)).toHaveCount(0);
  });

  test("entering the back/forward cache only sleeps; coming back wakes it", async ({ page }) => {
    await capableDevice(page);
    await openScenePage(page);
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
    let state = await debug(page);
    expect(state?.status).toBe("sleeping");
    expect(state?.contextLost).toBe(false);
    await expect(page.locator(CANVAS)).toHaveCount(1);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    state = await debug(page);
    expect(state?.status).toBe("running");
    const before = await frames(page);
    await page.mouse.wheel(0, 150);
    await expect.poll(() => frames(page)).toBeGreaterThan(before);
  });

  test("a context the browser took while the page was cached is made again on pageshow", async ({ page }) => {
    await capableDevice(page);
    await openScenePage(page);
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => {
      const gl = (document.querySelector("[data-scene] canvas") as HTMLCanvasElement).getContext("webgl2")!;
      gl.getExtension("WEBGL_lose_context")!.loseContext();
    });
    await expect(page.locator(CANVAS)).toHaveCount(0);
    expect((await debug(page))?.reason).toBe("context-lost");
    await expect(first(page)).toHaveAttribute("data-scene-state", "stopped");
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 20_000 });
    expect((await debug(page))?.status).toBe("running");
  });

  test("after navigating away the context was released", async ({ page }) => {
    await capableDevice(page);
    await openScenePage(page);
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 20_000 });
    expect(await page.evaluate((k) => sessionStorage.getItem(k), RELEASED_KEY)).toBeNull();
    await expectOk(page, ""); // the home page has no scene
    await expect(page.locator(CANVAS)).toHaveCount(0);
    expect(await page.evaluate((k) => sessionStorage.getItem(k), RELEASED_KEY)).toBe("1");
  });
});
