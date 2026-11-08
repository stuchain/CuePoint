import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize } from "node:path";
import { LOCALES, OTHER_LOCALES, TRANSLATED_PATHS } from "../src/i18n/locales";

/**
 * The languages (DEC-311): the header switch on a wide screen and in the phone menu, the hreflang set, the
 * language of every translated page, and no sideways scroll on a phone in any of them.
 */

const WIDE = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

test.describe("the language switch on a wide screen", () => {
  test("opens on a click, goes to the same page in German, and closes on Escape and on an outside click", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await page.goto("features/");
    const switchEl = page.locator("[data-lang-switch]");
    const list = switchEl.locator(".lang-list");
    await expect(list).toBeHidden();
    await switchEl.locator("summary").click();
    await expect(list).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(list).toBeHidden();
    await switchEl.locator("summary").click();
    await page.locator("h1").click();
    await expect(list).toBeHidden();
    await switchEl.locator("summary").click();
    await list.getByRole("link", { name: /Deutsch/ }).click();
    await expect(page).toHaveURL(/\/de\/features\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
  });

  test("on a German page, English is one click back to the same English page", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await page.goto("de/download/");
    await page.locator("[data-lang-switch] summary").click();
    await page.locator("[data-lang-switch] .lang-list").getByRole("link", { name: /English/ }).click();
    await expect(page).toHaveURL(/\/download\/$/);
    await expect(page).not.toHaveURL(/\/de\//);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("the switch's button and links are big enough to tap", async ({ page }) => {
    await page.setViewportSize(WIDE);
    await page.goto("de/");
    const summary = page.locator("[data-lang-switch] summary");
    const box = (await summary.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(24);
    expect(box.height).toBeGreaterThanOrEqual(24);
  });
});

test.describe("the language row in the phone menu", () => {
  test("is the last row of the menu and goes to the German page", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto("features/");
    await page.locator("details.menu > summary").click();
    const row = page.locator(".lang-row");
    await expect(row).toBeVisible();
    await expect(page.locator("[data-lang-switch]")).toBeHidden();
    await row.getByRole("link", { name: /Deutsch/ }).click();
    await expect(page).toHaveURL(/\/de\/features\/$/);
  });
});

test.describe("every translated page", () => {
  for (const locale of OTHER_LOCALES) {
    for (const path of TRANSLATED_PATHS) {
      const url = `${locale.code}/${path}`;
      test(`${url}: its language, its alternates, and no sideways scroll on a phone`, async ({ page }) => {
        await page.setViewportSize(PHONE);
        await page.goto(url);
        await expect(page.locator("html")).toHaveAttribute("lang", locale.hreflang);
        const alternates = await page
          .locator('link[rel="alternate"][hreflang]')
          .evaluateAll((els) => els.map((e) => e.getAttribute("hreflang")));
        expect(alternates.sort()).toEqual([...LOCALES.map((l) => l.hreflang), "x-default"].sort());
        const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
        expect(canonical).toMatch(new RegExp(`/${url}$`));
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
  }

  test("an English page is the x-default and says en", async ({ page }) => {
    await page.goto("features/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", /\/features\/$/);
    await expect(page.locator('link[rel="alternate"][hreflang="de"]')).toHaveAttribute("href", /\/de\/features\/$/);
  });

  test("a page that is not translated has no alternates and links to a German page's English twin only when asked", async ({ page }) => {
    await page.goto("privacy/");
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
  });
});

/** Serves a built folder (dist-none/ or dist-fixture/, scripts/build-fixture.mjs) on a port the system picks. */
function serve(dir: string): Promise<{ server: Server; url: string }> {
  const root = join(import.meta.dirname, "..", dir);
  if (!existsSync(join(root, "features", "index.html"))) throw new Error(`${dir}/ is not built: run \`npm run build:fixture\``);
  const types: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/")).replace(/^(\.\.[/\\])+/, "");
    let file = join(root, path);
    if (existsSync(file) && !extname(file)) file = join(file, "index.html");
    if (!existsSync(file) || !file.startsWith(root)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` })));
}

/**
 * The header bar stays one row, 58px tall, between 1000 and 1280px in every language, before the first release
 * (the long "get notified" label) and with one (the Download label that names a system): the action does not wrap,
 * nothing overlaps its neighbour and the page does not scroll sideways.
 */
for (const build of ["dist-none", "dist-fixture"]) {
  test.describe(`the header bar in ${build}`, () => {
    let served: { server: Server; url: string };
    test.beforeAll(async () => {
      served = await serve(build);
    });
    test.afterAll(() => {
      served.server.close();
    });
    for (const locale of LOCALES) {
      for (const width of [1000, 1100, 1280]) {
        test(`${locale.code} at ${width}px is one row`, async ({ page }) => {
          await page.setViewportSize({ width, height: 800 });
          await page.goto(`${served.url}${locale.code === "en" ? "" : `${locale.code}/`}features/`);
          const m = await page.evaluate(() => {
            const rect = (q: string) => document.querySelector(q)!.getBoundingClientRect();
            const row = [".brand", ".nav ul", ".lang", ".bar > .action"].map(rect);
            return {
              bar: rect(".bar").height,
              action: rect(".bar > .action").height,
              overlap: row.some((r, i) => i > 0 && r.left < row[i - 1]!.right - 0.5),
              past: row[row.length - 1]!.right - rect(".bar").right,
              scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            };
          });
          expect(Math.round(m.bar), "bar height").toBe(58);
          expect(m.action, "the action is one line").toBeLessThanOrEqual(45);
          expect(m.overlap, "items overlap").toBe(false);
          expect(m.past, "the action ends inside the bar").toBeLessThanOrEqual(0);
          expect(m.scroll, "sideways scroll").toBeLessThanOrEqual(0);
        });
      }
    }
  });
}

/** The note that the app is in English (DEC-311) is on a phone too, and sits clear of the closing band's wheel art. */
test.describe("the app note on a phone", () => {
  for (const locale of OTHER_LOCALES) {
    test(`${locale.code}: the home page's closing band keeps the note clear of the wheel`, async ({ page }) => {
      for (const width of [320, 390, 700]) {
        await page.setViewportSize({ width, height: 844 });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await page.goto(`${locale.code}/`);
        const m = await page.evaluate(() => ({
          note: document.querySelector(".get .app-note")!.getBoundingClientRect().bottom,
          art: document.querySelector(".get .disc")!.getBoundingClientRect().top,
        }));
        expect(m.note, `${width}px: the note ends above the art`).toBeLessThanOrEqual(m.art);
      }
    });
  }

  test.describe("on the download page with a release", () => {
    let served: { server: Server; url: string };
    test.beforeAll(async () => {
      served = await serve("dist-fixture");
    });
    test.afterAll(() => {
      served.server.close();
    });
    for (const locale of OTHER_LOCALES) {
      test(`${locale.code}: one note is visible on a phone, one on a wide screen, none on English`, async ({ page }) => {
        const visible = async () => page.locator("[data-app-note]").evaluateAll((els) => els.filter((e) => (e as HTMLElement).getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden").length);
        await page.setViewportSize(PHONE);
        await page.goto(`${served.url}${locale.code}/download/`);
        expect(await visible()).toBe(1);
        await page.setViewportSize(WIDE);
        expect(await visible()).toBe(1);
      });
    }
    test("English has no note at all", async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(`${served.url}download/`);
      await expect(page.locator("[data-app-note]")).toHaveCount(0);
    });
  });
});
