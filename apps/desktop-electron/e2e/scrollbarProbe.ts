import type { Page } from "@playwright/test";

/**
 * The themed scrollbar (tokens/scrollbars.css: 6 wide, a transparent track, an --border-muted thumb; P5) on one scroll container, and whether the page
 * itself scrolls. With `scale`, the interface is set to that scale for the probe and put back,
 * which grows a panel that fits at 1x until it overflows, so its bar width can be asserted.
 *
 * A pointer resting over a scroller reads back the thumb's hover colour: callers park the
 * mouse away (`await page.mouse.move(0, 0)`) first.
 */
export async function probeScrollbar(page: Page, selector: string, options: { scale?: number } = {}) {
  const previous = await page.evaluate(() => ({
    data: document.documentElement.dataset.scale ?? null,
    inline: document.documentElement.style.getPropertyValue("--scale"),
  }));
  if (options.scale !== undefined) await page.evaluate((scale) => {
    document.documentElement.dataset.scale = scale;
    document.documentElement.style.setProperty("--scale", scale);
  }, String(options.scale));
  try {
    return await page.locator(selector).first().evaluate((el) => {
      const resolve = (token: string) => {
        const probe = document.createElement("i");
        probe.style.color = `var(${token})`;
        document.body.appendChild(probe);
        const colour = getComputedStyle(probe).color;
        probe.remove();
        return colour;
      };
      const style = getComputedStyle(el);
      const doc = document.scrollingElement!;
      return {
        overflows: el.scrollHeight > el.clientHeight,
        overflowY: style.overflowY,
        pageScrolls: doc.scrollHeight !== doc.clientHeight,
        thumb: getComputedStyle(el, "::-webkit-scrollbar-thumb").backgroundColor,
        track: getComputedStyle(el, "::-webkit-scrollbar-track").backgroundColor,
        expectedThumb: resolve("--border-muted"),
        expectedTrack: resolve("--scrollbar-track"),
        scrollbarColor: style.scrollbarColor,
        scrollbarWidth: style.scrollbarWidth,
        // The bar's own width: the rule's colours read back even when Chromium draws its
        // standard bar instead, but its width does not.
        barWidth:
          (el as HTMLElement).offsetWidth - el.clientWidth - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth),
        expectedWidth: 6 * parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--scale")),
      };
    });
  } finally {
    if (options.scale !== undefined) {
      await page.evaluate((p) => {
        const root = document.documentElement;
        if (p.data === null) delete root.dataset.scale;
        else root.dataset.scale = p.data;
        if (p.inline) root.style.setProperty("--scale", p.inline);
        else root.style.removeProperty("--scale");
      }, previous);
    }
  }
}
