/**
 * Every text field, search box and select shows as a box, in every theme, on every page (B18, B19).
 *
 * The field look is "sunken, no frame until hover or focus" (P31, P49): a field is told from what is
 * behind it only by its fill (`--field-fill`, D8). A surface whose ground is the field's own tone and
 * that does not set `--field-fill` leaves its fields as bare text. That went unseen on Settings and on
 * Keys' Sources pane in four of the five themes. This walks each destination and each of its tabs in
 * each theme (its header tabs), and fails on any field whose fill and frame both match the ground behind it.
 */
import { test, expect, type Page } from "@playwright/test";
import { DESTINATIONS, THEMES, importCollection, launch, makeWorkspace, openDestination, ready, setLook, settle, writeExport } from "./a11yHarness";

const ws = makeWorkspace();
test.afterAll(() => ws.cleanup());

/** The visible fields whose box cannot be seen: fill equals the ground and the frame is clear. */
async function hiddenFields(window: Page): Promise<string[]> {
  return window.evaluate(() => {
    const clear = (colour: string) => colour === "transparent" || /rgba\([^)]*,\s*0\)$/.test(colour);
    const ground = (from: Element): string => {
      for (let el = from.parentElement; el; el = el.parentElement) {
        const bg = getComputedStyle(el).backgroundColor;
        if (!clear(bg)) return bg;
      }
      return getComputedStyle(document.body).backgroundColor;
    };
    const found: string[] = [];
    const fields = document.querySelectorAll("main.app-main .cp-select__control, main.app-main .cp-search-field__input, main.app-main .cp-textfield__input");
    for (const field of fields) {
      const box = field.getBoundingClientRect();
      if (!(field as HTMLElement).offsetParent || box.width < 10 || box.height < 10) continue;
      const style = getComputedStyle(field);
      if (!clear(style.borderTopColor) && style.borderTopWidth !== "0px") continue;
      if (style.backgroundColor === ground(field)) {
        const label = field.getAttribute("aria-label") ?? field.closest(".cp-field, .cp-select, label")?.querySelector("label, .cp-field__label")?.textContent ?? "";
        found.push(`${field.className.split(" ")[0]} "${label.trim().slice(0, 40)}"`);
      }
    }
    return found;
  });
}

test("every field shows a box in every theme on every page", async () => {
  test.setTimeout(600_000);
  const app = await launch(ws);
  const failures: string[] = [];
  try {
    const window = await ready(app);
    await importCollection(window, writeExport(ws.workspace));
    for (const theme of THEMES) {
      await setLook(window, { theme });
      for (const destination of DESTINATIONS) {
        await openDestination(window, destination);
        // The page's own tabs, in its header (a tab inside a hidden panel cannot be clicked).
        const tabs = await window.locator("main.app-main .screen:visible .cp-screen-header__tabs [role=tab]").all();
        const places: (string | null)[] = tabs.length ? [] : [null];
        for (const tab of tabs) places.push((await tab.innerText()).split("\n")[0]!.trim());
        for (let i = 0; i < places.length; i++) {
          if (places[i] !== null) {
            await tabs[i]!.click();
            await settle(window);
          }
          for (const field of await hiddenFields(window)) {
            failures.push(`${theme} ${destination.link}${places[i] ? ` > ${places[i]}` : ""}: ${field}`);
          }
        }
      }
    }
  } finally {
    await app.close();
  }
  expect(failures, "fields drawn in the colour behind them").toEqual([]);
});
