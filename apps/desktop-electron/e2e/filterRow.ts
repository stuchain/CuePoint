import type { Page } from "@playwright/test";

/**
 * Presses one of the Library filter row's actions (Save as Smart Collection…, Clear all filters): on
 * the row when it has room, otherwise in the menu the row folds it into (W1), More, or Filters once
 * More has folded too.
 */
export async function pressFilterRowAction(window: Page, name: string | RegExp): Promise<void> {
  const button = window.locator(".library-screen .cp-filter-bar__row").getByRole("button", { name, exact: typeof name === "string" });
  if (await button.count()) {
    await button.click();
    return;
  }
  await window.locator(".library-screen .cp-filter-bar__row").getByRole("button", { name: /^(More|Filters)/ }).last().click();
  await window.getByRole("menuitem", { name, exact: typeof name === "string" }).click();
}

/**
 * Selects everything the Library's view matches. The filter row's Select all is gone (M116: it is
 * "Select all N" in the selection bar once something is selected), so this presses Ctrl+A, the
 * Library's own key for it, with focus off any field.
 */
export async function selectAllMatching(window: Page): Promise<void> {
  await window.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await window.keyboard.press("ControlOrMeta+a");
}
