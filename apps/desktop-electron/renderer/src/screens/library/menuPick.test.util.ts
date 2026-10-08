/**
 * Reaching an entry of the right-click menu in a test (FLW-8).
 *
 * The menu shows the selection bar's groups as submenus, so most entries sit
 * one level down — Rate two. A test names the entry, not the way to it: this
 * opens parents until the entry is on screen and hands it back.
 */
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type Name = string | RegExp;

const shown = (name: Name) => screen.queryAllByRole("menuitem", { name });

/** The entry, opening parents as needed; null when no list holds it. */
export async function findMenuItem(
  name: Name,
  // Whatever opened the menu, evaluated first; only there to be awaited.
  opened?: unknown,
  depth = 0,
): Promise<HTMLElement | null> {
  void opened;
  const here = shown(name);
  if (here.length > 0) return here[0]!;
  if (depth > 3) return null;
  const parents = screen
    .queryAllByRole("menuitem")
    .filter((item) => item.getAttribute("aria-haspopup") === "menu" && item.getAttribute("aria-expanded") === "false");
  for (const parent of parents) {
    // eslint-disable-next-line no-await-in-loop
    await userEvent.click(parent);
    // eslint-disable-next-line no-await-in-loop
    const found = await findMenuItem(name, undefined, depth + 1);
    if (found) return found;
  }
  return null;
}

/** The entry, or a failure naming it. */
export async function menuItem(name: Name, opened?: unknown): Promise<HTMLElement> {
  const found = await findMenuItem(name, opened);
  if (!found) throw new Error(`No menu entry named ${String(name)}`);
  return found;
}

/** Choose an entry wherever it is. */
export async function pickMenuItem(name: Name): Promise<void> {
  await userEvent.click(await menuItem(name));
}
