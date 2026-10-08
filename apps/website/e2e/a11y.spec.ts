import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PUBLIC } from "../site.config";
import { distPages } from "./pages";

/** The viewports DEC-141 names: phone, tablet, desktop. */
const WIDTHS = [375, 768, 1440] as const;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const THEMES = ["neoDark", "retro16", "qtEvolved", "clubNeon", "mutedPro"] as const;
const THEME_KEY = "cuepoint-site-theme";
const pages = distPages();

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `    ${n.target.join(" ")}\n    ${n.failureSummary?.split("\n").join("\n    ")}`).join("\n")}`,
  );
  expect(summary, "axe violations").toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, "document.documentElement.scrollWidth vs clientWidth").toBeLessThanOrEqual(clientWidth);
}

/**
 * WCAG 2.5.8 Target Size (Minimum): every visible target is at least 24x24 CSS px, or is an inline link
 * in a sentence (exempt), or passes the spacing exception: a 24 px circle centred on the target touches
 * no other target and no other undersized target's circle. Disabled controls are not targets.
 */
async function undersizedTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const SELECTOR =
      'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
    const MIN = 24;
    type Box = { el: Element; left: number; top: number; right: number; bottom: number; w: number; h: number };
    const boxes: Box[] = [];
    for (const el of document.querySelectorAll(SELECTOR)) {
      if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true") continue;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 1 && r.height <= 1) continue; // visually hidden text
      boxes.push({ el, left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height });
    }
    const label = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).join(".") : ""} "${(el.textContent ?? "").trim().slice(0, 30)}"`;
    const small = (b: Box) => b.w < MIN - 0.01 || b.h < MIN - 0.01;
    const centre = (b: Box) => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });
    const circleHitsBox = (c: { x: number; y: number }, b: Box) => {
      const dx = Math.max(b.left - c.x, 0, c.x - b.right);
      const dy = Math.max(b.top - c.y, 0, c.y - b.bottom);
      return Math.hypot(dx, dy) < MIN / 2;
    };
    const failures: string[] = [];
    for (const b of boxes) {
      if (!small(b)) continue;
      // inline links inside a sentence: the block must hold text outside its links (a list item or a block of
      // nothing but links is a row of targets, not a sentence)
      if (b.el.tagName === "A" && getComputedStyle(b.el).display === "inline") {
        const block = b.el.closest("p, dd, figcaption, blockquote");
        if (block) {
          const clone = block.cloneNode(true) as Element;
          clone.querySelectorAll("a").forEach((a) => a.remove());
          if ((clone.textContent ?? "").trim().length > 0) continue;
        }
      }
      const c = centre(b);
      const clash = boxes.find((o) => {
        if (o === b || o.el.contains(b.el) || b.el.contains(o.el)) return false;
        if (small(o)) return Math.hypot(centre(o).x - c.x, centre(o).y - c.y) < MIN;
        return circleHitsBox(c, o);
      });
      failures.push(`${label(b.el)} is ${Math.round(b.w)}x${Math.round(b.h)}px${clash ? ` and its 24px circle meets ${label(clash.el)}` : " (spacing exception holds)"}`);
      if (!clash) failures.pop();
    }
    return failures;
  });
}

async function expectPageOk(page: Page) {
  await expectAccessible(page);
  await expectNoHorizontalScroll(page);
  expect(await undersizedTargets(page), "targets under 24x24 px without spacing").toEqual([]);
}

// Every page at the three widths in the default theme.
for (const width of WIDTHS) {
  test.describe(`${width}px wide`, () => {
    test.use({ viewport: { width, height: 900 } });

    for (const path of pages) {
      test(`/${path} has no axe violations, no horizontal scroll and big enough targets`, async ({ page }) => {
        await page.goto(path);
        await expectPageOk(page);
      });
    }
  });
}

// Every page in each of the five themes, at the desktop width.
test.describe("every theme at 1440px", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  for (const theme of THEMES) {
    for (const path of pages) {
      test(`/${path} in the ${theme} theme`, async ({ page }) => {
        await page.addInitScript(([key, value]) => localStorage.setItem(key!, value!), [THEME_KEY, theme]);
        await page.goto(path);
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        await expectPageOk(page);
      });
    }
  }
});

// The style guide shows every component, so it must be built while the site is a preview.
test("the style guide is built while PUBLIC is false", () => {
  if (!PUBLIC) expect(pages, "dist/ pages").toContain("styleguide/");
});
