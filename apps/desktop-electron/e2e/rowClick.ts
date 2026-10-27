import { expect, type Locator, type Page } from "@playwright/test";

/**
 * A mouse click at a track table row's left part, where nothing is an editor, as a person
 * makes it: the row scrolled into the table's view first, below its sticky header.
 *
 * A row's box is where the row is, not what is drawn there. The table scrolls inside the
 * page, so a row past the last one it shows sits under whatever is below the table (the
 * source panel, the transition strip), and a row scrolled past the top sits under the
 * header. The windows on macOS and Windows are shorter inside than Linux's under xvfb
 * (see windowSizes.ts), so a row Linux shows can be one of those there, and a click at its
 * box lands on something else and selects nothing. The click is refused when the point
 * is not on the row, so a miss fails here and not several steps later.
 */
export async function clickRowAt(
  page: Page,
  row: Locator,
  options: { x?: number; button?: "left" | "right"; clickCount?: number } = {},
): Promise<void> {
  const { x = 60, button = "left", clickCount = 1 } = options;
  await row.evaluate((element) => {
    const scroll = element.closest<HTMLElement>(".track-table__scroll");
    if (!scroll) return;
    const header = scroll.querySelector<HTMLElement>(".track-table__header");
    const view = scroll.getBoundingClientRect();
    const top = view.top + scroll.clientTop + (header?.getBoundingClientRect().height ?? 0);
    const bottom = view.top + scroll.clientTop + scroll.clientHeight;
    const box = element.getBoundingClientRect();
    // Vertical only: a click at the row's left needs the table's left edge, which the
    // callers keep in view.
    if (box.top < top) scroll.scrollTop -= top - box.top;
    else if (box.bottom > bottom) scroll.scrollTop += box.bottom - bottom;
  });
  // Where the click goes, once the row is what is drawn there (the scroll above settles first).
  const found: { at: { x: number; y: number } | null } = { at: null };
  await expect
    .poll(
      async () => {
        found.at = await row.evaluate((element, left) => {
          const box = element.getBoundingClientRect();
          const at = { x: box.x + left, y: box.y + box.height / 2 };
          return element.contains(document.elementFromPoint(at.x, at.y)) ? at : null;
        }, x);
        return found.at !== null;
      },
      { message: "the row is what is drawn where the click goes", timeout: 5_000 },
    )
    .toBe(true);
  await page.mouse.click(found.at!.x, found.at!.y, { button, clickCount });
}

/**
 * Brings Track details into view after a row was selected. A selection opens it a moment later,
 * but in a window too narrow for the table beside it the panel folds itself (D11, D16), and the
 * page header's Details button, shown only while the panel is hidden, brings it back.
 */
export async function showTrackDetails(page: Page): Promise<Locator> {
  const panel = page.locator(".cp-track-detail:visible").first();
  const toggle = page.locator('button[aria-label="Track details"]:visible').first();
  await expect(panel.or(toggle)).toBeVisible({ timeout: 15_000 });
  // The panel opens 250 ms after a selection; past that, a hidden panel stays folded.
  await page.waitForTimeout(500);
  if (!(await panel.isVisible())) await toggle.click();
  await expect(panel).toBeVisible({ timeout: 15_000 });
  return panel;
}
