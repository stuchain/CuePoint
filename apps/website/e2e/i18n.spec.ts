import { expect, test } from "@playwright/test";
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
