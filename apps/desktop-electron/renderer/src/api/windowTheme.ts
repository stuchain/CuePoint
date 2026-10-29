/**
 * Tells main what colour the app is, so the frame around the page matches it (M492, M495, M496).
 *
 * The window's background (what shows before the page has drawn and behind a resize), the title
 * bar and the native menu are the system's. Main sets them from the app's `--bg-app` and
 * `color-scheme`, which only the page knows: this reads them after every theme change (a theme
 * picked, a custom theme edited, the editor's live preview) and sends them through
 * `setWindowTheme`, once per change. Without the shell (a browser tab, a test), nothing happens.
 */
import type { WindowThemeChoice } from "./cuepointBridge.types";

/** `#rrggbb` for a CSS colour text of the forms a theme uses; null for anything else. */
export function cssColourToHex(text: string): string | null {
  const value = text.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(value);
  if (hex) {
    const digits = value.slice(1);
    if (digits.length === 3) {
      return `#${[...digits].map((d) => d + d).join("")}`;
    }
    return `#${digits.slice(0, 6)}`;
  }
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/.exec(value);
  if (rgb) {
    const parts = [rgb[1], rgb[2], rgb[3]].map(Number);
    if (parts.some((part) => part > 255)) return null;
    return `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}

/** Perceived brightness of a `#rrggbb`, 0 (black) to 1 (white). */
function brightness(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * The theme on screen as the window needs it, or null when the page has no `--bg-app` it can
 * read as a colour. The scheme is the theme's own `--color-scheme`; a theme that does not say is
 * read from its background.
 */
export function readWindowTheme(root: HTMLElement = document.documentElement): WindowThemeChoice | null {
  const style = getComputedStyle(root);
  const raw = style.getPropertyValue("--bg-app");
  let background = cssColourToHex(raw);
  if (background === null && raw.trim() !== "") {
    // A colour written another way (a `color-mix`, a name): the browser resolves it to rgb().
    const probe = document.createElement("span");
    probe.style.cssText = `position:absolute;visibility:hidden;background:${raw.trim()}`;
    root.appendChild(probe);
    background = cssColourToHex(getComputedStyle(probe).backgroundColor);
    probe.remove();
  }
  if (background === null) return null;
  const declared = style.getPropertyValue("--color-scheme").trim().toLowerCase();
  const scheme = declared === "light" || declared === "dark" ? declared : brightness(background) > 0.5 ? "light" : "dark";
  return { background, scheme };
}

/** The longest lead a title carries; a track with a very long name is cut, not run under the window buttons. */
const TITLE_MAX = 120;

/**
 * The window's title (M501): "Library — CuePoint", or the track that is playing, "Title — Artist —
 * CuePoint". The shell sets `document.title` to it, which is what the window and the task bar show.
 * Control characters and runs of spaces are cleaned, and a long name is cut with an ellipsis.
 */
export function windowTitle(
  page: string | null | undefined,
  playing?: { title?: string | null; artist?: string | null } | null,
): string {
  const clean = (text: string | null | undefined): string =>
    (text ?? "")
      // oxlint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const track = [clean(playing?.title), clean(playing?.artist)].filter((part) => part !== "").join(" - ");
  const lead = track !== "" ? track : clean(page);
  const cut = lead.length > TITLE_MAX ? `${lead.slice(0, TITLE_MAX - 1).trimEnd()}…` : lead;
  return cut === "" ? "CuePoint" : `${cut} - CuePoint`;
}

const SETTLE_MS = 120;

/**
 * Send the theme now and again whenever it changes. Returns the function that stops. A change is
 * sent once it has settled, and one that changes nothing is not sent: the editor's live preview
 * moves a colour on every drag.
 */
export function startWindowThemeSync(
  root: HTMLElement = document.documentElement,
  send: (theme: WindowThemeChoice) => unknown = (theme) => window.cuepoint?.setWindowTheme?.(theme),
): () => void {
  let last = "";
  let timer: ReturnType<typeof setTimeout> | null = null;

  const push = (): void => {
    timer = null;
    const theme = readWindowTheme(root);
    if (theme === null) return;
    const key = `${theme.background}|${theme.scheme}`;
    if (key === last) return;
    last = key;
    // Main answering late, or refusing, changes nothing the person sees in the page.
    void Promise.resolve(send(theme)).catch(() => undefined);
  };

  const schedule = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(push, SETTLE_MS);
  };

  push();
  if (typeof MutationObserver === "undefined") return () => undefined;
  const observer = new MutationObserver(schedule);
  observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "style"] });
  return () => {
    observer.disconnect();
    if (timer !== null) clearTimeout(timer);
  };
}
