/**
 * DEC-022: the sidebar has two states, expanded or an icon-only rail, and
 * remembers which.
 *
 * Two fixed widths rather than a drag handle is the decision, not a shortcut:
 * predictable widths let the rail be drawn at exact pixel sizes, which
 * arbitrary resizing would undermine for pixel art, and it avoids a second
 * draggable edge competing with the Inspector's.
 *
 * Reads follow the shape the rest of the shell uses: never trust storage, and
 * fall back to a default rather than throw.
 */
export const SIDEBAR_COLLAPSED_STORAGE_KEY = "cuepoint-ui-shell-sidebar-collapsed";

export function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    // Storage can throw outright where site data is disabled.
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // A forgotten sidebar state is not worth breaking the toggle over.
  }
}
