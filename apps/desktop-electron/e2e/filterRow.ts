import type { Page } from "@playwright/test";

/**
 * Presses one of the Library filter row's actions (Select all, Save as Smart Collection…, Clear all
 * filters): on the row when it has room, otherwise in the menu the row folds it into (W1), More, or
 * Filters once More has folded too.
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
