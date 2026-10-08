import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";
import type { AddressInfo } from "node:net";
import { HANDOFF_FROM, STEP_SPANS, stepMid, type StepId } from "../src/three/phases";

/**
 * SITE-06: the home page. The default build is "before 1.0.0" (no release); dist-fixture/ (built by
 * scripts/build-fixture.mjs from a recorded release) is the page once a release exists.
 *
 * The 3D comes from SwiftShader here, which the software-GL gate would block: capableDevice() opts in
 * through the preview-only __cuepointStageConfig, as e2e/three.spec.ts does.
 */
const ROOT = join(import.meta.dirname, "..");
const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const SCENE = "[data-scene='opening']";
const CANVAS = "[data-scene='opening'] canvas";
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".ico": "image/x-icon",
};

function serve(dir: string): Promise<{ server: Server; url: string }> {
  const root = join(ROOT, dir);
  if (!existsSync(join(root, "index.html"))) throw new Error(`${dir}/ is not built: run \`npm run build:fixture\``);
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/")).replace(/^(\.\.[/\\])+/, "");
    let file = join(root, path);
    if (existsSync(file) && !extname(file)) file = join(file, "index.html");
    if (!existsSync(file) || !file.startsWith(root)) return void res.writeHead(404).end("not found");
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` }));
  });
}

async function capableDevice(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "hardwareConcurrency", { value: 8, configurable: true });
    Object.defineProperty(navigator, "deviceMemory", { value: 8, configurable: true });
    window.__cuepointStageConfig = { minFps: 1, allowSoftwareGL: true };
  });
}

test.describe("above the fold", () => {
  for (const [width, height] of [
    [375, 667],
    [768, 1024],
    [1440, 900],
  ] as const) {
    test(`the h1 and the primary button are visible without scrolling at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("");
      const h1 = page.getByRole("heading", { level: 1 });
      await expect(h1).toHaveCount(1);
      await expect(h1).toBeVisible();
      const primary = page.locator("main [data-primary-action]");
      await expect(primary).toBeVisible();
      for (const box of [await h1.boundingBox(), await primary.boundingBox()]) {
        expect(box).not.toBeNull();
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(height);
      }
      // one primary action on the page above the footer, and a secondary that scrolls
      await expect(page.locator("main [data-primary-action]")).toHaveCount(1);
      const secondary = page.getByRole("link", { name: "See how it works" });
      await expect(secondary).toBeVisible();
      await expect(secondary).toHaveAttribute("href", /^#/);
    });
  }

  test("before 1.0.0 the primary button is the header's 'Get notified of 1.0', to the same place", async ({ page }) => {
    await page.goto("");
    const primary = page.locator("main [data-primary-action]");
    await expect(primary).toHaveText("Get notified of 1.0");
    const header = page.locator("header").getByRole("link", { name: "Get notified of 1.0" });
    expect(await primary.getAttribute("href")).toBe(await header.getAttribute("href"));
    await expect(page.locator("a.js-download")).toHaveCount(0);
  });

  test("the opening scene's still is in the first screen, a fixed-size pixel picture", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("");
    const still = page.locator(`${SCENE} .still img:visible`);
    await expect(still).toHaveCount(1);
    await expect(still).toHaveAttribute("width", "320");
    await expect(still).toHaveAttribute("height", "180");
    await expect(still).toHaveAttribute("fetchpriority", "high");
    const box = await still.boundingBox();
    expect(box!.y).toBeLessThan(900);
    expect(box!.width).toBeGreaterThan(300);
  });
});

test.describe("the phone's first screen", () => {
  test("shows the h1, the primary button and at least 40% of the scene's still in 375 x 667", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("");
    const still = (await page.locator(`${SCENE} .still img:visible`).boundingBox())!;
    const inside = Math.max(0, Math.min(still.y + still.height, 667) - Math.max(still.y, 0));
    expect(inside / still.height).toBeGreaterThanOrEqual(0.4);
    const primary = (await page.locator("main [data-primary-action]").boundingBox())!;
    expect(primary.y + primary.height).toBeLessThanOrEqual(667);
  });

  test("the header is one row: the mark and a Menu; the home page's call to action is not repeated there", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("");
    const header = page.locator("header");
    expect((await header.boundingBox())!.height).toBeLessThan(80);
    await expect(header.getByRole("link", { name: "Get notified of 1.0" })).toBeHidden();
    await expect(header.getByRole("link", { name: "Guide" })).toBeHidden();
    await expect(header.locator("[data-theme-switch]")).toBeHidden();
  });

  test("the menu opens and closes, with JavaScript off too, and holds the nav and the theme switch", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    await page.goto("");
    const header = page.locator("header");
    await header.getByText("Menu", { exact: true }).click();
    await expect(header.getByRole("link", { name: "Guide" })).toBeVisible();
    await expect(header.locator("[data-theme-switch]")).toBeVisible();
    await header.getByText("Menu", { exact: true }).click();
    await expect(header.getByRole("link", { name: "Guide" })).toBeHidden();
    await context.close();
  });

  test("on a wide screen the nav and the theme switch are in the bar, with no Menu button", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("");
    const header = page.locator("header");
    await expect(header.getByRole("link", { name: "Guide" })).toBeVisible();
    await expect(header.locator("[data-theme-switch]")).toBeVisible();
    await expect(header.getByText("Menu", { exact: true })).toBeHidden();
  });

  test("'See how it works' lands on the first step, clear of the stuck scene", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("");
    await page.getByRole("link", { name: "See how it works" }).click();
    await page.waitForTimeout(400);
    const step = (await page.locator("#story").boundingBox())!;
    const stage = (await page.locator("[data-stage]").boundingBox())!;
    expect(step.y).toBeGreaterThanOrEqual(stage.y + stage.height - 2);
    expect(step.y + step.height).toBeLessThanOrEqual(667);
  });
});

test.describe("the steps and the scene", () => {
  for (const [width, height] of [
    [375, 667],
    [1440, 900],
  ] as const) {
    test(`each step is centered on the screen at the middle of its span, at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto("");
      const trackTop = await page.locator("#story-track").evaluate((el) => el.getBoundingClientRect().top + scrollY);
      const trackHeight = await page.locator("#story-track").evaluate((el) => el.getBoundingClientRect().height);
      for (const id of Object.keys(STEP_SPANS) as StepId[]) {
        // the scene's progress is 0 with the track's top at the middle of the screen and 1 with its bottom there
        await page.evaluate((y) => window.scrollTo(0, y), trackTop - height / 2 + stepMid(id) * trackHeight);
        await page.waitForTimeout(150);
        const box = (await page.locator(`[data-step="${id}"]`).boundingBox())!;
        expect(Math.abs(box.y + box.height / 2 - height / 2), `${id} at ${width}px`).toBeLessThan(40);
      }
    });
  }

  test("no step overlaps the stuck scene or the hero at the top of the page", async ({ page }) => {
    for (const [width, height] of [
      [375, 667],
      [1440, 900],
    ] as const) {
      await page.setViewportSize({ width, height });
      await page.goto("");
      const stage = (await page.locator("[data-stage]").boundingBox())!;
      const hero = (await page.locator(".hero").boundingBox())!;
      for (const step of await page.locator("[data-step]").all()) {
        const b = (await step.boundingBox())!;
        const overlapsStage = b.x < stage.x + stage.width && b.x + b.width > stage.x && b.y < stage.y + stage.height && b.y + b.height > stage.y;
        expect(overlapsStage, `a step overlaps the scene at ${width}px`).toBe(false);
        expect(b.y, `a step starts above the end of the hero at ${width}px`).toBeGreaterThanOrEqual(hero.y + hero.height - 2);
      }
    }
  });

  test("the stuck scene cross-fades into the app window's slot in the last phase, and only then", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await capableDevice(page);
    await page.goto("");
    await page.keyboard.press("Shift");
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 20_000 });
    const trackTop = await page.locator("#story-track").evaluate((el) => el.getBoundingClientRect().top + scrollY);
    const trackHeight = await page.locator("#story-track").evaluate((el) => el.getBoundingClientRect().height);
    const opacityAt = async (p: number) => {
      await page.evaluate((y) => window.scrollTo(0, y), trackTop - 450 + p * trackHeight);
      await page.waitForTimeout(400);
      return Number(await page.locator("[data-handoff]").evaluate((el) => getComputedStyle(el).opacity));
    };
    expect(await opacityAt(0.5)).toBe(0);
    expect(await opacityAt(HANDOFF_FROM - 0.02)).toBe(0);
    expect(await opacityAt(0.97)).toBeGreaterThan(0.4);
    expect(await opacityAt(1)).toBeGreaterThan(0.9);
    await expect(page.locator("[data-handoff]")).toHaveAttribute("aria-hidden", "true");
  });

  test("without 3D the cross-fade never shows and the slot below the scene is the window", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("");
    await page.evaluate(() => window.scrollTo(0, 2500));
    await page.waitForTimeout(300);
    expect(Number(await page.locator("[data-handoff]").evaluate((el) => getComputedStyle(el).opacity))).toBe(0);
    await expect(page.locator("#window [data-app-shot]").first()).toBeVisible();
  });
});

test.describe("once a release exists", () => {
  let served: { server: Server; url: string };
  test.beforeAll(async () => {
    served = await serve("dist-fixture");
  });
  test.afterAll(() => served.server.close());

  async function openAs(browser: Browser, userAgent: string, platform: string) {
    const context = await browser.newContext({ userAgent, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.addInitScript((hints) => {
      Object.defineProperty(navigator, "userAgentData", {
        configurable: true,
        value: { platform: hints.platform, mobile: false, getHighEntropyValues: async () => ({ ...hints }) },
      });
    }, { platform, architecture: "x86", bitness: "64", mobile: false });
    await page.goto(served.url);
    return { context, page };
  }

  test("the primary button names the detected system and opens that system's page", async ({ browser }) => {
    const { context, page } = await openAs(browser, CHROME_WIN, "Windows");
    const primary = page.locator("main [data-primary-action]");
    await expect(primary).toHaveClass(/js-download/);
    await expect(primary).toHaveAttribute("data-system", "windows");
    await expect(primary).toHaveAccessibleName("Download for Windows");
    await expect(primary).toHaveAttribute("href", /\/download\/#windows$/);
    await expect(page.getByText("Get notified of 1.0")).toHaveCount(0);
    await context.close();
  });

  test("the button does not change width when the system is named", async ({ browser }) => {
    const context = await browser.newContext({ userAgent: CHROME_WIN, viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(served.url);
    const primary = page.locator("main [data-primary-action]");
    const before = (await primary.boundingBox())!.width;
    await expect(primary).toHaveAttribute("data-system", /./);
    expect((await primary.boundingBox())!.width).toBeCloseTo(before, 0);
    await context.close();
  });
});

test.describe("the scenes and their pictures", () => {
  test("with reduced motion every scene is its still and no canvas is made", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await capableDevice(page);
    await page.goto("");
    await page.keyboard.press("Shift");
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(1500);
    await expect(page.locator("canvas")).toHaveCount(0);
    for (const scene of await page.locator("[data-scene]").all()) {
      const img = scene.locator(".still img:visible");
      await expect(img).toHaveCount(1);
      await expect(img).toHaveJSProperty("complete", true);
      expect(await img.evaluate((i) => (i as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    }
    // nothing is only in the 3D: the story is in the text
    await expect(page.getByText("A messy library")).toBeVisible();
    await context.close();
  });

  test("with saveData, or without WebGL, no canvas is made and the still stays", async ({ browser }) => {
    for (const setup of [
      () => Object.defineProperty(navigator, "connection", { value: { saveData: true }, configurable: true }),
      () => {
        const real = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
          return type.startsWith("webgl") ? null : (real as (...a: unknown[]) => unknown).call(this, type, ...rest);
        } as typeof real;
      },
    ]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();
      await capableDevice(page);
      await page.addInitScript(setup);
      await page.goto("");
      await page.keyboard.press("Shift");
      await page.waitForTimeout(1200);
      await expect(page.locator("canvas")).toHaveCount(0);
      await expect(page.locator(`${SCENE} .still img:visible`)).toHaveCount(1);
      await context.close();
    }
  });

  test("starts only on the first gesture, then draws over the still and follows the scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await capableDevice(page);
    await page.goto("");
    await page.waitForTimeout(1500);
    await expect(page.locator(CANVAS)).toHaveCount(0);
    await expect(page.locator(SCENE)).toHaveAttribute("data-scene-state", "waiting");
    await page.keyboard.press("Shift");
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(`${SCENE} .still img:visible`)).toHaveCount(1);
    await expect(page.locator(CANVAS)).toHaveAttribute("aria-hidden", "true");
    await page.waitForTimeout(2500);
    const before = await page.evaluate(() => window.__cuepointStage?.frames ?? -1);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => page.evaluate(() => window.__cuepointStage?.frames ?? -1)).toBeGreaterThan(before);
  });

  test("the scene stays in view while its story plays (the section is tall and the scene sticks)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("");
    const scene = page.locator(SCENE);
    await page.evaluate(() => window.scrollTo(0, 700));
    const a = (await scene.boundingBox())!;
    await page.evaluate(() => window.scrollTo(0, 1300));
    const b = (await scene.boundingBox())!;
    expect(a.y).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  });

  test("every place the spec puts an app picture is a labelled placeholder of the right size", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("");
    const slots = page.locator("[data-app-shot]");
    expect(await slots.count()).toBeGreaterThanOrEqual(8); // the window at the end of the scene + seven sections
    for (const slot of await slots.all()) {
      await expect(slot).toHaveAttribute("data-placeholder", "true");
      await expect(slot).toContainText(/screenshot/i);
      const box = (await slot.locator("[data-slot-frame]").boundingBox())!;
      expect(box.width / box.height).toBeCloseTo(1280 / 800, 1);
    }
    await expect(page.locator("main img[src*='/app/']")).toHaveCount(0);
  });

  test("the sound button is not there until the loop file exists, and nothing plays", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __audio: number };
      w.__audio = 0;
      const Real = window.AudioContext;
      window.AudioContext = class extends Real {
        constructor(...a: ConstructorParameters<typeof Real>) {
          super(...a);
          w.__audio += 1;
        }
      };
    });
    await page.goto("");
    await expect(page.locator("[data-sound-toggle]")).toHaveCount(0);
    await page.keyboard.press("Shift");
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { __audio: number }).__audio)).toBe(0);
    await expect(page.locator("audio")).toHaveCount(0);
  });
});

test.describe("the page as a document", () => {
  test("describes the app to search engines: SoftwareApplication, Organization, WebSite", async ({ page }) => {
    await page.goto("");
    const blocks = await page.locator('script[type="application/ld+json"]').evaluateAll((els) => els.map((e) => JSON.parse(e.textContent ?? "{}")));
    const by = (type: string) => blocks.find((b) => b["@type"] === type);
    const app = by("SoftwareApplication");
    expect(app).toBeDefined();
    expect(app.name).toBe("CuePoint");
    expect(app.applicationCategory).toBe("MultimediaApplication");
    expect(app.offers.price).toBe("0");
    expect(app.operatingSystem).toMatch(/Windows/);
    expect(app.operatingSystem).toMatch(/macOS/);
    // no rating or review is made up
    expect(JSON.stringify(app)).not.toMatch(/aggregateRating|"review"/);
    expect(by("Organization")?.name).toBeTruthy();
    expect(by("WebSite")?.url).toMatch(/^https:\/\//);
  });

  test("has one h1, headings in order, and every section links to a guide page", async ({ page }) => {
    await page.goto("");
    await expect(page.locator("h1")).toHaveCount(1);
    const levels = await page.locator("main h1, main h2, main h3").evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    for (let i = 1; i < levels.length; i++) expect(levels[i]! - levels[i - 1]!).toBeLessThanOrEqual(1);
    for (const id of ["clean", "library", "keys", "discover", "prepare", "statistics", "export"]) {
      const section = page.locator(`#feature-${id}`);
      await expect(section.getByRole("heading")).toHaveCount(1);
      // Keys and Statistics have no guide page yet, so they link nothing rather than something untrue
      const links = section.getByRole("link", { name: /Read the guide/ });
      if (id === "keys" || id === "statistics") await expect(links).toHaveCount(0);
      else await expect(links).toHaveAttribute("href", /\/guide\//);
    }
  });

  for (const width of [375, 1440]) {
    test(`has no axe violations at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("");
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
});
