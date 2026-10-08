/** The app's five themes (theme.ts: BUILT_IN_THEME_OPTIONS), offered by the header's switch (DEC-190). */
export const THEMES = [
  { id: "neoDark", label: "Neo dark" },
  { id: "retro16", label: "Retro 16-bit" },
  { id: "qtEvolved", label: "Classic" },
  { id: "clubNeon", label: "Club neon" },
  { id: "mutedPro", label: "Muted" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "neoDark";

/** The key the choice is kept under in the visitor's browser. */
export const THEME_STORAGE_KEY = "cuepoint-site-theme";

/** The event the switch fires on `document` when the theme changes; SITE-05's 3D listens. */
export const THEME_EVENT = "cuepoint:theme";

export interface ThemeEventDetail {
  theme: ThemeId;
}

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

/** The remembered theme; storage that throws or holds junk reads as the default. */
export function readStoredTheme(): ThemeId {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeId(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** Sets the theme on <html>, remembers it, and tells the page. */
export function applyTheme(theme: ThemeId): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* blocked storage: the choice just is not remembered */
  }
  document.dispatchEvent(new CustomEvent<ThemeEventDetail>(THEME_EVENT, { detail: { theme } }));
}

/** The tiny script in <head> that sets the stored theme before first paint. */
export function themeInitScript(): string {
  const ids = JSON.stringify(THEMES.map((t) => t.id));
  return `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${ids}.indexOf(t)>-1)document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
}
