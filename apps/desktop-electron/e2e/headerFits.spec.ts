/**
 * A page header holds everything in it, however its buttons wrap (B20).
 *
 * With the queue open on a small window, a header's buttons wrap to a second line. The header must
 * grow for them: on Statistics it was squeezed back to its least height instead, and the tabs drew
 * over the first lines of the page. This opens the queue at the app's smallest width and checks every
 * destination: nothing in the header reaches past the header's own bottom edge.
 */
import { test, expect } from "@playwright/test";
import { DESTINATIONS, importCollection, launch, makeWorkspace, openDestination, ready, settle, writeExport } from "./a11yHarness";
import { setInnerSize } from "./windowSizes";

const ws = makeWorkspace();
test.afterAll(() => ws.cleanup());

test("every header holds its tabs at 1024 x 700 with the queue open", async () => {
  test.setTimeout(300_000);
  const app = await launch(ws);
  const failures: string[] = [];
  try {
    const window = await ready(app);
    await importCollection(window, writeExport(ws.workspace));
    await setInnerSize(app, window, { width: 1024, height: 700 });
    // The player bar, and with it the queue button, appears once a track is first queued (DEC-053).
    await openDestination(window, DESTINATIONS[0]);
    await window.getByRole("grid", { name: "Library tracks" }).locator('[role="row"][data-index]').first().click({ button: "right" });
    await window.getByRole("menu").getByRole("menuitem", { name: "Add to queue" }).click();
    await window.getByRole("button", { name: /show the queue/i }).click();
    await expect(window.getByRole("button", { name: /hide the queue/i })).toBeVisible();
    for (const destination of DESTINATIONS) {
      await openDestination(window, destination);
      await settle(window);
      const overflow = await window.evaluate(() => {
        const header = [...document.querySelectorAll<HTMLElement>("main.app-main .cp-screen-header")].find((el) => el.offsetParent);
        if (!header) return null;
        const bottom = header.getBoundingClientRect().bottom;
        const deepest = Math.max(...[...header.querySelectorAll("*")].map((el) => el.getBoundingClientRect().bottom));
        return Math.round(deepest - bottom);
      });
      if (overflow !== null && overflow > 0) failures.push(`${destination.link}: header content ${overflow}px past its bottom edge`);
    }
  } finally {
    await app.close();
  }
  expect(failures).toEqual([]);
});
