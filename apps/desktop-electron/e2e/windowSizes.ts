import { expect, type ElectronApplication, type Page } from "@playwright/test";

/**
 * The window a person on Windows really has. It is 1,280 × 800 outside; the frame and the
 * menu bar take 16 px of width and 65 px of height, so the page inside is 1,264 × 735. Linux
 * under xvfb has no such frame, so a spec that measures layout measures both: the window as
 * it opens, then this inner size.
 */
export const WINDOWS_INNER = { width: 1264, height: 735 } as const;

/** Sets the page's inner size (not the window's outer one) and waits for the page to be that size. */
export async function setInnerSize(
  app: ElectronApplication,
  page: Page,
  size: { width: number; height: number } = WINDOWS_INNER,
): Promise<void> {
  await app.evaluate(({ BrowserWindow }, { width, height }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(width, height);
  }, size);
  await expect
    .poll(() => page.evaluate(() => [window.innerWidth, window.innerHeight]), {
      message: `the page is ${size.width} × ${size.height} inside`,
    })
    .toEqual([size.width, size.height]);
  // Layout settles on the frame after the resize.
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}
