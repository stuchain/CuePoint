/**
 * The window's colours follow the app's theme (M492, M495, M496).
 *
 * The page knows the theme; the frame around it is the system's. Without this the window flashes
 * white before the page draws (nothing told it the colour), Windows in light mode draws a white
 * title bar and menu bar over a dark UI, and Classic gets a dark bar it did not ask for.
 *
 * The page sends `{ background, scheme }` (`setWindowTheme`): its `--bg-app` and its
 * `color-scheme`. Main applies them to the live window (`setBackgroundColor`, and
 * `nativeTheme.themeSource`, which the title bar and the native menu follow), and remembers them,
 * so the *next* launch opens already in them: `backgroundColor` is set when the window is made,
 * before a single page byte has loaded.
 *
 * The page is not trusted: anything that is not a hex colour and one of the two schemes is
 * refused, because it is handed to the window and written to the settings file.
 */

export type WindowScheme = "dark" | "light";

export interface WindowTheme {
  /** `#rrggbb`, lower case. */
  background: string;
  scheme: WindowScheme;
}

/** Neo dark, the app's default theme, which is what a first launch opens in. */
export const DEFAULT_WINDOW_THEME: WindowTheme = { background: "#18181b", scheme: "dark" };

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#rgb` or `#rrggbb` as `#rrggbb`, lower case; null for anything else. */
export function normalizeHexColour(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!HEX.test(text)) return null;
  const digits = text.slice(1).toLowerCase();
  return `#${digits.length === 3 ? [...digits].map((d) => d + d).join("") : digits}`;
}

/** The theme as it must be, or null when it is not one. */
export function parseWindowTheme(value: unknown): WindowTheme | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { background, scheme } = value as { background?: unknown; scheme?: unknown };
  const colour = normalizeHexColour(background);
  if (colour === null || (scheme !== "dark" && scheme !== "light")) return null;
  return { background: colour, scheme };
}

/** What the window applies the theme to, handed in so a test can stand in. */
export interface WindowThemeTargets {
  /** `nativeTheme`: the title bar and the native menu follow `themeSource`. */
  nativeTheme: { themeSource: "system" | "light" | "dark" };
  /** The live window, when there is one. */
  window: () => { setBackgroundColor: (colour: string) => void; isDestroyed: () => boolean } | null;
  /** Where the theme is remembered for the next launch. */
  remember: (theme: WindowTheme) => void;
}

/**
 * Apply a theme the page sent. Returns whether it was one; a refusal changes nothing. Applying is
 * best effort (a destroyed window, a settings file that cannot be written) and never throws, so a
 * theme change in the page is never failed by the frame.
 */
export function applyWindowTheme(targets: WindowThemeTargets, value: unknown): boolean {
  const theme = parseWindowTheme(value);
  if (theme === null) return false;
  targets.nativeTheme.themeSource = theme.scheme;
  try {
    const win = targets.window();
    if (win && !win.isDestroyed()) win.setBackgroundColor(theme.background);
  } catch {
    // The window is going; the next one opens in the remembered colour.
  }
  try {
    targets.remember(theme);
  } catch {
    // Not remembered: the next launch opens in the default and the page corrects it.
  }
  return true;
}
