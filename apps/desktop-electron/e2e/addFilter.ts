import type { Page } from "@playwright/test";

/**
 * Opens the Library's Add filter form. A filter row too narrow for Tags… folds it into Add filter,
 * which is then a menu of the two (item 12): the form is its first entry.
 */
export async function openAddFilter(window: Page): Promise<void> {
  await window.getByRole("button", { name: "Add filter" }).click();
  const entry = window.getByRole("menuitem", { name: "Add a filter…" });
  if (await entry.isVisible().catch(() => false)) await entry.click();
}
