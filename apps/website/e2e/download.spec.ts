import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, join, normalize } from "node:path";
import type { AddressInfo } from "node:net";

/**
 * SITE-07: the download page in both states, whatever GitHub holds today. `npm run test:e2e` first
 * builds dist-none/ (no normal release, so "1.0.0 is coming") and dist-fixture/ (a recorded release)
 * with scripts/build-fixture.mjs, and each is served here on a port the system picks.
 */
const ROOT = join(import.meta.dirname, "..");
const RELEASE = JSON.parse(readFileSync(join(ROOT, "e2e/fixtures/releases-with-release.json"), "utf8")) as {
  release: { version: string; notesUrl: string };
  files: { name: string; system: string; chip: string; size: number; sha256: string; url: string }[];
};
const RELEASES_PAGE = "https://github.com/stuchain/CuePoint/releases";
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".xml": "application/xml",
  ".ico": "image/x-icon",
};

function serve(dir: string): Promise<{ server: Server; url: string }> {
  const root = join(ROOT, dir);
  if (!existsSync(join(root, "download", "index.html"))) {
    throw new Error(`${dir}/ is not built: run \`npm run build:fixture\` (npm run test:e2e does it first)`);
  }
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/")).replace(/^(\.\.[/\\])+/, "");
    let file = join(root, path);
    if (existsSync(file) && !extname(file)) file = join(file, "index.html");
    if (!existsSync(file) || !file.startsWith(root)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` }));
  });
}

/** What a browser says about itself: the user agent, and the client hints Chromium offers. */
interface Env {
  name: string;
  userAgent: string;
  hints?: { platform: string; architecture: string; bitness: string; mobile: boolean };
  mobile?: boolean;
}
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const CHROME_LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

const defineEnvs = <T extends Record<string, Env>>(t: T): { [K in keyof T]: Env & T[K] } => t as { [K in keyof T]: Env & T[K] };
const ENVS = defineEnvs({
  macArm: { name: "Apple Silicon Mac in Chrome", userAgent: CHROME_MAC, hints: { platform: "macOS", architecture: "arm", bitness: "64", mobile: false } },
  macIntel: { name: "Intel Mac in Chrome", userAgent: CHROME_MAC, hints: { platform: "macOS", architecture: "x86", bitness: "64", mobile: false } },
  macSafari: { name: "Mac in Safari", userAgent: SAFARI_MAC },
  windows: { name: "Windows x64", userAgent: CHROME_WIN, hints: { platform: "Windows", architecture: "x86", bitness: "64", mobile: false } },
  windowsArm: { name: "Windows on Arm", userAgent: CHROME_WIN, hints: { platform: "Windows", architecture: "arm", bitness: "64", mobile: false } },
  linux: { name: "Linux x64", userAgent: CHROME_LINUX, hints: { platform: "Linux", architecture: "x86", bitness: "64", mobile: false } },
  iphone: { name: "iPhone", userAgent: IPHONE, mobile: true },
});

async function open(browser: Browser, base: string, env: Env, width = 1280): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    userAgent: env.userAgent,
    viewport: { width, height: 900 },
    ...(env.mobile ? { isMobile: true, hasTouch: true } : {}),
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  await page.addInitScript(
    ({ hints }) => {
      // Chromium on Linux has no client hints for the pretend system: answer as the real browser would.
      Object.defineProperty(navigator, "userAgentData", {
        configurable: true,
        value: hints
          ? { platform: hints.platform, mobile: hints.mobile, getHighEntropyValues: async () => ({ ...hints }) }
          : undefined,
      });
      // layout shifts, summed (the CLS), and the download events
      const w = window as unknown as { __cls: number; __downloads: unknown[] };
      w.__cls = 0;
      w.__downloads = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
          if (!entry.hadRecentInput) w.__cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
      document.addEventListener("cuepoint:download", (e) => w.__downloads.push((e as CustomEvent).detail));
      // a click on a file link must not leave the page under test
      document.addEventListener("click", (e) => e.preventDefault());
    },
    { hints: env.hints ?? null },
  );
  await page.goto(`${base}download/`);
  return { context, page };
}

const ready = (page: Page, env: Env) =>
  env.mobile ? page.locator("[data-layer=mobile][data-on]").waitFor() : page.locator("a.js-download[data-system]").first().waitFor({ state: "attached" });

test.describe("before 1.0.0 (no normal release)", () => {
  let served: { server: Server; url: string };
  test.beforeAll(async () => {
    served = await serve("dist-none");
  });
  test.afterAll(() => {
    served.server.close();
  });

  test("says 1.0.0 is coming, links GitHub's releases, and offers no download", async ({ page }) => {
    await page.goto(`${served.url}download/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("CuePoint 1.0 is coming");
    const main = page.locator("main");
    await expect(main.getByRole("link", { name: "Get notified of 1.0" })).toBeVisible();
    await expect(main.locator(`a[href="${RELEASES_PAGE}"]`).first()).toBeVisible();
    await expect(main.getByText("What CuePoint runs on")).toBeVisible();
    // no download button, no file, no system named on a button
    await expect(page.locator("a.js-download")).toHaveCount(0);
    await expect(page.getByText(/Download for/)).toHaveCount(0);
    await expect(page.locator('a[href$=".exe"], a[href$=".dmg"], a[href$=".AppImage"]')).toHaveCount(0);
    await expect(page.locator("script#cp-releases")).toHaveCount(0);
    // the header's primary action stays "Get notified of 1.0"
    await expect(page.locator("header").getByRole("link", { name: "Get notified of 1.0" })).toBeVisible();
  });

  for (const width of [375, 1280]) {
    test(`has no axe violations at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${served.url}download/`);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }
});

test.describe("with a normal release", () => {
  let served: { server: Server; url: string };
  test.beforeAll(async () => {
    served = await serve("dist-fixture");
  });
  test.afterAll(() => {
    served.server.close();
  });

  test("lists every file once, and each link is the release asset's URL", async ({ page }) => {
    await page.goto(`${served.url}download/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Download CuePoint");
    const hrefs = await page.locator("#all-downloads .files a").evaluateAll((links) => links.map((a) => a.getAttribute("href")));
    expect(hrefs.sort()).toEqual(RELEASE.files.map((f) => f.url).sort());
    for (const f of RELEASE.files) {
      const card = page.locator("#all-downloads .files li", { has: page.locator(`a[href="${f.url}"]`) });
      await expect(card).toContainText(f.name);
      await expect(card).toContainText(f.sha256);
      await expect(card).toContainText(`${Math.round(f.size / 1048576)} MB`);
    }
    await expect(page.locator(`main a[href="${RELEASE.release.notesUrl}"]`).first()).toBeVisible();
    // the three "what happens next" sections
    for (const id of ["windows", "macos", "linux"]) await expect(page.locator(`#${id}`)).toBeVisible();
    await expect(page.locator("#windows ~ ol").first()).toContainText("More info");
    await expect(page.locator("#macos ~ ol").first()).toContainText("xattr -cr /Applications/CuePoint.app");
    await expect(page.locator("#linux ~ ol").first()).toContainText("chmod +x");
  });

  test("shows a neutral Download, linked to the page and the list, when JavaScript is off", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto(`${served.url}download/`);
    await expect(page.locator("header a.js-download")).toHaveAccessibleName("Download");
    await expect(page.locator("header a.js-download")).toHaveAttribute("href", "/download/");
    await expect(page.locator("[data-hero] a.js-download")).toHaveAttribute("href", "#all-downloads");
    await context.close();
  });

  const cases: { env: Env; label: string | null; file: string | null; system: string; note?: RegExp; alt?: string }[] = [
    { env: ENVS.macArm, label: "Download for Mac", system: "macos", file: "mac-arm64.dmg", note: /Apple silicon/, alt: "mac-x64.dmg" },
    { env: ENVS.macIntel, label: "Download for Mac", system: "macos", file: "mac-x64.dmg", note: /Intel chip/, alt: "mac-arm64.dmg" },
    { env: ENVS.macSafari, label: "Download for Mac", system: "macos", file: "mac-arm64.dmg", note: /does not say which chip/, alt: "mac-x64.dmg" },
    { env: ENVS.windows, label: "Download for Windows", system: "windows", file: "win-x64-setup.exe", note: /64-bit Windows/ },
    { env: ENVS.windowsArm, label: "Download for Windows", system: "windows", file: "win-x64-setup.exe", note: /Arm chip.*x64/ },
    { env: ENVS.linux, label: "Download for Linux", system: "linux", file: "linux-x86_64.AppImage", note: /AppImage/ },
  ];

  for (const c of cases) {
    test(`${c.env.name}: names the system and links its file`, async ({ browser }) => {
      const { context, page } = await open(browser, served.url, c.env);
      await ready(page, c.env);
      const header = page.locator("header a.js-download");
      await expect(header).toHaveAccessibleName(c.label ?? "");
      // the header names the system but opens that system's "What happens next"; only the hero is the file
      await expect(header).toHaveAttribute("href", new RegExp(`/download/#${c.system}$`));
      const hero = page.locator("[data-hero] a.js-download");
      await expect(hero).toHaveAccessibleName(c.label ?? "");
      await expect(hero).toHaveAttribute("href", new RegExp(`${c.file}$`));
      const note = page.locator("[data-hero] [data-note][data-on]");
      await expect(note).toHaveCount(1);
      await expect(note).toBeVisible();
      await expect(note).toContainText(c.note ?? /./);
      if (c.alt) {
        const alt = note.locator("[data-alt]");
        await expect(alt).toHaveAttribute("href", new RegExp(`${c.alt}$`));
        await expect(alt).toHaveText(/Intel Mac\?|Apple silicon Mac\?/);
      }
      // the button names one system, and only the visible label is read
      await expect(page.locator("[data-hero] a.js-download")).toHaveAccessibleName(c.label ?? "");
      await context.close();
    });
  }

  test("a click on a download dispatches cuepoint:download with the system and chip", async ({ browser }) => {
    const { context, page } = await open(browser, served.url, ENVS.macArm);
    await ready(page, ENVS.macArm);
    await page.locator("[data-hero] a.js-download").click();
    // a click in the main box shows what to expect for that system
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("#macos");
    await page.locator("[data-hero] [data-note][data-on] [data-alt]").click();
    await page.locator("#all-downloads .files a", { hasText: "Download" }).nth(0).click();
    // a middle click on a file link counts too
    await page.locator("#all-downloads .files a", { hasText: "Download" }).nth(0).click({ button: "middle" });
    const events = await page.evaluate(() => (window as unknown as { __downloads: unknown[] }).__downloads);
    expect(events).toEqual([
      { system: "macos", chip: "arm64" },
      { system: "macos", chip: "x64" },
      { system: "windows", chip: "x64" },
      { system: "windows", chip: "x64" },
    ]);
    await context.close();
  });

  test("a phone gets 'runs on Windows, macOS and Linux' and a share button, no download", async ({ browser }) => {
    const { context, page } = await open(browser, served.url, ENVS.iphone, 390);
    await ready(page, ENVS.iphone);
    const hero = page.locator("[data-hero]");
    await expect(hero.getByText("CuePoint runs on Windows, macOS and Linux")).toBeVisible();
    await expect(hero.getByRole("button", { name: "Send me the link" })).toBeVisible();
    await expect(hero.locator("a.js-download")).toBeHidden();
    await expect(page.locator("header a.js-download")).toHaveAccessibleName("Download");
    await hero.getByRole("button", { name: "Send me the link" }).click();
    await expect(hero.getByRole("status")).toContainText("Link copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${served.url}download/`);
    await context.close();
  });

  for (const env of Object.values(ENVS)) {
    for (const width of [375, 1280]) {
      test(`${env.name} at ${width}px: detection does not shift the layout`, async ({ browser }) => {
        const { context, page } = await open(browser, served.url, env, width);
        await ready(page, env);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(600);
        const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
        expect(cls, "cumulative layout shift").toBeLessThan(0.01);
        // and nothing needs sideways scrolling
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
        await context.close();
      });
    }
  }

  for (const env of [ENVS.windows, ENVS.macSafari, ENVS.iphone]) {
    test(`${env.name}: no axe violations once detection has run`, async ({ browser }) => {
      const { context, page } = await open(browser, served.url, env, env.mobile ? 390 : 1280);
      await ready(page, env);
      const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
      await context.close();
    });
  }

  test("every Download button on another page names the system too", async ({ browser }) => {
    const { context, page } = await open(browser, served.url, ENVS.windows);
    await ready(page, ENVS.windows);
    await page.goto(served.url);
    await expect(page.locator("header a.js-download")).toHaveAccessibleName("Download for Windows");
    await context.close();
  });
});
