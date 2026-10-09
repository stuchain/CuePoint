import { expect, test, type Page } from "@playwright/test";
import { FOOTER_GROUPS } from "../src/data/nav";

/**
 * The inner pages' reading and wayfinding (the pages pass after SITE-06): the guide's contents, the FAQ's
 * jump list, the footer's groups, the sticky header, the motion and the page transition, llms.txt.
 */

test.describe("the guide's contents", () => {
  test("on a wide screen: the pages in a sidebar, 'On this page' as a rail beside the page, every link landing on its heading", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("guide/getting-started/");
    const rail = page.getByRole("navigation", { name: "On this page" });
    await expect(rail).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Guide pages" })).toBeVisible();
    // the rail is to the right of the article, and the article's title comes before the rail in height
    const railBox = (await rail.boundingBox())!;
    const article = (await page.locator("article.prose").boundingBox())!;
    expect(railBox.x).toBeGreaterThan(article.x + article.width - 1);
    const links = rail.getByRole("link");
    expect(await links.count()).toBeGreaterThan(3);
    for (const href of await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")!))) {
      await expect(page.locator(`[id="${decodeURIComponent(href.slice(1))}"]`), href).toHaveCount(1);
    }
    // a jump lands below the sticky header, and the rail marks the section being read
    const last = links.last();
    await last.click();
    const target = page.locator(`[id="${decodeURIComponent((await last.getAttribute("href"))!.slice(1))}"]`);
    const headerBottom = (await page.locator("header.header").boundingBox())!.height;
    await expect.poll(async () => (await target.boundingBox())!.y).toBeGreaterThanOrEqual(headerBottom - 1);
    await expect(rail.locator('a[aria-current="location"]')).toHaveCount(1);
  });

  test("on a phone: the page comes first, the page list and 'On this page' folded above it", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("guide/getting-started/");
    await expect(page.locator("details.pages")).not.toHaveAttribute("open", "");
    await expect(page.locator("details.toc")).not.toHaveAttribute("open", "");
    await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
    await page.getByText("On this page", { exact: true }).first().click();
    await expect(page.getByRole("navigation", { name: "On this page" }).getByRole("link").first()).toBeVisible();
  });

  test("the search box is the first thing in the reading column", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("guide/clean/");
    const search = (await page.getByLabel("Search the guide").boundingBox())!;
    const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
    expect(search.y).toBeLessThan(title.y);
    await expect(page.getByLabel("Search the guide")).toBeInViewport();
  });

  test("keys in the guide are key caps, with the text as written", async ({ page }) => {
    await page.goto("guide/getting-started/");
    const keys = page.locator("article .keys", { hasText: "Ctrl+K" }).first();
    await expect(keys.locator("kbd")).toHaveText(["Ctrl", "K"]);
    await expect(keys).toHaveText("Ctrl+K");
  });

  test("a guide page is a TechArticle", async ({ page }) => {
    await page.goto("guide/clean/");
    const blocks = (await page.locator('script[type="application/ld+json"]').allTextContents()).map((t) => JSON.parse(t));
    const article = blocks.find((b) => b["@type"] === "TechArticle");
    expect(article.headline).toBe("Clean");
    expect(article.url).toMatch(/\/guide\/clean\/$/);
  });
});

test.describe("the FAQ", () => {
  test("lists every question at the top, and each one jumps to its answer", async ({ page }) => {
    await page.goto("faq/");
    const jump = page.getByRole("navigation", { name: "The questions" });
    const links = jump.getByRole("link");
    const questions = page.locator("section.qa h2");
    await expect(links).toHaveCount(await questions.count());
    expect(await questions.count()).toBeGreaterThan(5);
    const href = (await links.nth(4).getAttribute("href"))!;
    await links.nth(4).click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.locator(href)).toBeInViewport();
    await expect(page.locator(href)).toHaveText(await links.nth(4).innerText());
  });
});

test.describe("the footer", () => {
  test("groups the links under Product, Help and Legal", async ({ page }) => {
    await page.goto("features/");
    const footer = page.locator("footer");
    await expect(footer.getByRole("heading")).toHaveText(FOOTER_GROUPS.map((g) => g.label));
    for (const g of FOOTER_GROUPS) await expect(footer.locator(`[data-footer-group="${g.id}"] a`).first()).toBeVisible();
    await expect(footer.locator('[data-footer-group="legal"] a')).toHaveText(["Privacy", "Terms"]);
  });
});

test.describe("the header", () => {
  test("stays at the top of an inner page, and draws its edge only once the page has scrolled", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("faq/");
    const chrome = page.locator("header .chrome");
    const edge = () => chrome.evaluate((el) => getComputedStyle(el).borderBottomColor);
    expect(await edge()).toBe("rgba(0, 0, 0, 0)");
    await page.mouse.wheel(0, 1600);
    await expect.poll(async () => (await page.locator("header.header").boundingBox())!.y).toBe(0);
    await expect.poll(edge).toBe("rgb(0, 0, 0)");
  });

  test("marks the current page with a block under its link, not an underline", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("faq/");
    const current = page.locator('nav[aria-label="Main"] a[aria-current]');
    await expect(current).toHaveText("FAQ");
    const mark = await current.evaluate((a) => {
      const s = getComputedStyle(a, "::after");
      return { height: s.height, transform: s.transform, decoration: getComputedStyle(a).textDecorationLine };
    });
    expect(mark.height).toBe("4px");
    expect(mark.transform).toBe("none");
    expect(mark.decoration).toBe("none");
  });

  test("is one row on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("faq/");
    const bar = (await page.locator("header .bar").boundingBox())!;
    expect(bar.height).toBeLessThan(64);
  });
});

test.describe("motion", () => {
  const hoverStyle = async (page: Page, selector: string) => {
    const el = page.locator(selector).first();
    await el.scrollIntoViewIfNeeded();
    await el.hover();
    await page.waitForTimeout(250);
    return el.evaluate((e) => {
      const s = getComputedStyle(e);
      return { translate: s.translate, color: s.color, backgroundSize: s.backgroundSize };
    });
  };

  test("a button lifts on hover and goes down when pressed; a text link's pixel bar steps in", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("features/");
    const link = await hoverStyle(page, ".crumbs a");
    expect(link.backgroundSize).toMatch(/^100%/);
    // the press must not leave the page under test
    await page.evaluate(() => document.addEventListener("click", (e) => e.preventDefault(), true));
    expect((await hoverStyle(page, "main [data-primary-action]")).translate).toBe("-2px -2px");
    await page.mouse.down();
    await page.waitForTimeout(200);
    expect(await page.locator("main [data-primary-action]").evaluate((e) => getComputedStyle(e).translate)).toBe("2px 2px");
    await page.mouse.up();
  });

  test("keyboard focus draws the ring", async ({ page }) => {
    await page.goto("features/");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(ring).toBe("solid");
  });

  test("with reduced motion a button does not move", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto("features/");
    expect((await hoverStyle(page, "main [data-primary-action]")).translate).toBe("none");
    await context.close();
  });

  test("blocks below the first screen fade up once as they come into view; none on the first screen waits", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("guide/");
    const pending = page.locator('[data-reveal="pending"]');
    expect(await pending.count()).toBeGreaterThan(0);
    for (const el of await pending.all()) expect((await el.boundingBox())!.y).toBeGreaterThanOrEqual(900);
    // the first block that waits, held by its place among all the blocks (its attribute changes)
    const states = await page.locator("[data-reveal]").evaluateAll((els) => els.map((e) => e.getAttribute("data-reveal")));
    const first = page.locator("[data-reveal]").nth(states.indexOf("pending"));
    await first.scrollIntoViewIfNeeded();
    await expect(first).toHaveAttribute("data-reveal", "shown");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(first).toHaveAttribute("data-reveal", "shown"); // once only
  });
});

test.describe("the page transition", () => {
  const recordReveal = (page: Page) =>
    page.addInitScript(() => {
      window.addEventListener("pagereveal", (e) => {
        (window as unknown as { __vt: string }).__vt = (e as Event & { viewTransition: unknown }).viewTransition ? "yes" : "no";
      });
    });

  test("going to another page cross-fades, with the header its own still layer", async ({ page }) => {
    await recordReveal(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("features/");
    const name = await page.locator("header.header").evaluate((h) => getComputedStyle(h).viewTransitionName);
    expect(name).toBe("site-header");
    // A cross-document transition is best effort: the browser skips it when a frame is late,
    // which happens on a busy test machine. Allow a few tries; one has to cross-fade.
    let seen = "no";
    for (let attempt = 0; attempt < 4 && seen !== "yes"; attempt++) {
      if (attempt > 0) await page.goto("features/");
      await page.waitForLoadState("load");
      await page.locator('nav[aria-label="Main"] a', { hasText: "FAQ" }).click();
      await page.waitForURL(/\/faq\/$/);
      await expect.poll(() => page.evaluate(() => (window as unknown as { __vt?: string }).__vt)).toBeTruthy();
      seen = await page.evaluate(() => (window as unknown as { __vt?: string }).__vt ?? "no");
    }
    expect(seen).toBe("yes");
    expect(await page.locator("header.header").evaluate((h) => getComputedStyle(h).viewTransitionName)).toBe("site-header");
  });

  test("with reduced motion there is no transition", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await recordReveal(page);
    await page.goto("features/");
    await page.locator('nav[aria-label="Main"] a', { hasText: "FAQ" }).click();
    await page.waitForURL(/\/faq\/$/);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __vt?: string }).__vt)).toBe("no");
    await context.close();
  });
});

test("llms.txt lists the site's pages as plain text", async ({ request }) => {
  const res = await request.get("llms.txt");
  expect(res.ok()).toBe(true);
  const text = await res.text();
  expect(text).toMatch(/^# CuePoint\n/);
  for (const path of ["features/clean/", "guide/getting-started/", "faq/", "download/"]) expect(text).toContain(`${path})`);
  expect(text).not.toContain("thank-you");
  expect(text).not.toContain("styleguide");
});
