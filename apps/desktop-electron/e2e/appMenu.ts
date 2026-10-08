/**
 * Driving CuePoint's native menu bar from a spec (FLW-20).
 *
 * The menu is Electron's, not part of the page, so Playwright cannot click it. An item is
 * chosen through the application menu in main, which is the same `click` a person's choice
 * runs: it sends the item's command to the page.
 */
import type { ElectronApplication } from "@playwright/test";

/** Choose the menu item with this id (`import`, `report-problem`, `size:2`, ...). */
export async function chooseMenuItem(app: ElectronApplication, id: string): Promise<void> {
  const found = await app.evaluate(({ Menu }, itemId) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(itemId);
    if (!item) return false;
    item.click();
    return true;
  }, id);
  if (!found) throw new Error(`no menu item "${id}"`);
}

/** Every item in the menu bar, depth first, as plain data. */
export async function menuItems(
  app: ElectronApplication,
): Promise<Array<{ id: string; label: string; role: string; accelerator: string; checked: boolean }>> {
  return app.evaluate(({ Menu }) => {
    type Item = Electron.MenuItem;
    const out: Array<{ id: string; label: string; role: string; accelerator: string; checked: boolean }> = [];
    const walk = (items: Item[]) => {
      for (const item of items) {
        out.push({
          id: item.id ?? "",
          label: item.label,
          role: String(item.role ?? ""),
          accelerator: String(item.accelerator ?? ""),
          checked: item.checked,
        });
        if (item.submenu) walk(item.submenu.items);
      }
    };
    walk(Menu.getApplicationMenu()?.items ?? []);
    return out;
  });
}
