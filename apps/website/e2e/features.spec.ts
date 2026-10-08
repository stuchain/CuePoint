import { expect, test } from "@playwright/test";
import { COMPARE_TOOLS } from "../src/data/compare";
import { FEATURE_PAGES, shippedPages } from "../src/data/features";

/**
 * SITE-08: the feature pages and the comparison pages. SITE-03's e2e (a11y.spec.ts) already opens every
 * built page at 375, 768 and 1440 px with axe; these check what is particular to these pages.
 */

test.describe("the header", () => {
  // Features made the navigation longer (SITE-08): the bar folds into the Menu until it fits on one row.
  const barHeight = async (page: import("@playwright/test").Page, width: number) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("");
    return page.locator("header .bar").evaluate((el) => el.getBoundingClientRect().height);
  };
  for (const width of [641, 800, 1000]) {
    test(`is one row at ${width}px`, async ({ page }) => {
      const wide = await barHeight(page, 1440);
      const here = await barHeight(page, width);
      expect(here, `the header is ${here}px tall at ${width}px and ${wide}px at 1440px`).toBeLessThanOrEqual(wide + 2);
    });
  }
});

test.describe("feature pages", () => {
  for (const p of FEATURE_PAGES) {
    test(`${p.slug}: one h1, the guide, two related pages, the download action, and a labelled placeholder`, async ({ page }) => {
      await page.goto(`features/${p.slug}/`);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toHaveText(p.heading);
      const main = page.locator("main");
      if (p.guide) await expect(main.getByRole("link", { name: p.guide.label })).toHaveAttribute("href", new RegExp(`/guide/${p.guide.page}/$`));
      else await expect(main.locator('a[href*="/guide/"]')).toHaveCount(0); // no guide page yet: link nothing
      // a page or section for a feature the app does not ship yet says so, with the step
      const pending = [p.unshipped?.step, ...p.how.map((h) => h.unshipped?.step)].filter(Boolean);
      await expect(main.locator("[data-unshipped]")).toHaveCount(pending.length);
      for (const slug of p.related) await expect(main.locator(`a[href$="/features/${slug}/"]`)).toHaveCount(1);
      await expect(main.locator("[data-primary-action]")).toHaveCount(1);
      // until SITE-04 captures the app, the picture is a placeholder that says so, never a made-up screenshot
      await expect(main.locator("[data-app-shot]")).toHaveAttribute("data-placeholder", "true");
      await expect(main.locator("[data-app-shot]")).toHaveCount(1);
      await expect(main.locator("[data-app-shot] figcaption")).toContainText("Screenshot placeholder");
      await expect(page.locator('script[type="application/ld+json"]').first()).toBeAttached();
    });
  }

  test("the overview links every feature page and lists them as the app's features", async ({ page }) => {
    await page.goto("features/");
    await expect(page.locator("h1")).toHaveCount(1);
    for (const p of FEATURE_PAGES) await expect(page.locator(`main a[href$="/features/${p.slug}/"]`)).toHaveCount(1);
    const schemas = await page.locator('script[type="application/ld+json"]').allTextContents();
    const app = schemas.map((s) => JSON.parse(s)).find((o) => o["@type"] === "SoftwareApplication");
    expect(app.featureList).toHaveLength(shippedPages().length); // unshipped features are left out
  });

  test("the header links Features", async ({ page }) => {
    await page.goto("");
    await expect(page.locator('nav[aria-label="Main"] a[href$="/features/"]')).toHaveCount(1);
  });
});

test.describe("comparison pages", () => {
  for (const t of COMPARE_TOOLS) {
    test(`${t.slug}: every fact about the other tool is linked and dated, and CuePoint's gaps are listed`, async ({ page }) => {
      await page.goto(`compare/${t.slug}/`);
      await expect(page.locator("h1")).toHaveCount(1);
      const sources = page.locator("[data-compare-source]");
      await expect(sources).toHaveCount(t.rows.length);
      for (let i = 0; i < t.rows.length; i++) {
        const source = sources.nth(i);
        await expect(source.locator("a")).toHaveAttribute("href", t.rows[i]!.other.source.url);
        await expect(source.locator("time")).toHaveAttribute("datetime", t.rows[i]!.other.checked);
      }
      await expect(page.getByRole("heading", { name: "What CuePoint does not do" })).toBeVisible();
      await expect(page.locator("#not li")).toHaveCount(t.cuepointDoesNot.length);
    });
  }

  test("the index links every comparison and the footer links the index", async ({ page }) => {
    await page.goto("compare/");
    for (const t of COMPARE_TOOLS) await expect(page.locator(`main a[href$="/compare/${t.slug}/"]`)).toHaveCount(1);
    await expect(page.locator('footer a[href$="/compare/"]')).toHaveCount(1);
  });
});
