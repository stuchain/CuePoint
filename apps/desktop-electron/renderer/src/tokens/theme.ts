import {
  getCustomTheme,
  listCustomThemes,
  parseCustomThemeId,
  toCustomThemeId,
  type CustomTheme,
  type CustomThemeColors,
} from "./customThemes";
import {
  applyThemeTokensToDocument,
  clearThemeTokenOverrides,
  deriveThemeTokens,
} from "./themeDerivation";

export const BUILT_IN_THEME_OPTIONS = [
  { id: "neoDark", label: "Neo dark" },
  { id: "retro16", label: "Retro 16-bit" },
  { id: "qtEvolved", label: "Classic" },
  { id: "clubNeon", label: "Club neon" },
  { id: "mutedPro", label: "Muted" },
] as const;

export type BuiltInThemeId = (typeof BUILT_IN_THEME_OPTIONS)[number]["id"];
type CustomThemeId = `custom:${string}`;
export type ThemeId = BuiltInThemeId | CustomThemeId;

export interface ThemeOption {
  id: ThemeId;
  label: string;
  builtIn: boolean;
}

const STORAGE_KEY = "cuepoint-ui-lab-theme";
export const DEFAULT_THEME: BuiltInThemeId = "neoDark";

function isBuiltInThemeId(value: string): value is BuiltInThemeId {
  return BUILT_IN_THEME_OPTIONS.some((t) => t.id === value);
}

export function isCustomThemeId(value: string): value is CustomThemeId {
  return value.startsWith("custom:");
}

export function getAllThemeOptions(): ThemeOption[] {
  const builtIn: ThemeOption[] = BUILT_IN_THEME_OPTIONS.map((t) => ({
    id: t.id,
    label: t.label,
    builtIn: true,
  }));
  const custom: ThemeOption[] = listCustomThemes().map((t) => ({
    id: toCustomThemeId(t.id) as CustomThemeId,
    label: t.name,
    builtIn: false,
  }));
  return [...builtIn, ...custom];
}

/**
 * The remembered theme. Storage that throws — disabled, or a private window —
 * reads as the default: the app must start without it.
 */
export function getStoredThemeId(): ThemeId {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return DEFAULT_THEME;
  }
  if (!raw) return DEFAULT_THEME;
  if (isBuiltInThemeId(raw)) return raw;
  if (isCustomThemeId(raw)) {
    const bare = parseCustomThemeId(raw);
    if (bare && getCustomTheme(bare)) return raw;
  }
  return DEFAULT_THEME;
}

/** Remember the theme where storage allows; `setTheme` applies it either way. */
export function persistThemeId(themeId: ThemeId): void {
  try {
    localStorage.setItem(STORAGE_KEY, themeId);
  } catch {
    // Not remembered across a restart; still applied for this session.
  }
}

function applyBuiltInTheme(themeId: BuiltInThemeId): void {
  clearThemeTokenOverrides();
  document.documentElement.dataset.theme = themeId;
}

function applyCustomTheme(theme: CustomTheme): void {
  document.documentElement.dataset.theme = toCustomThemeId(theme.id);
  applyThemeTokensToDocument(deriveThemeTokens(theme.colors));
}

export function applyCustomThemeColors(colors: CustomThemeColors, previewId = "preview"): void {
  document.documentElement.dataset.theme = toCustomThemeId(previewId);
  applyThemeTokensToDocument(deriveThemeTokens(colors));
}

export function applyTheme(themeId: ThemeId): void {
  if (isBuiltInThemeId(themeId)) {
    applyBuiltInTheme(themeId);
    return;
  }
  const bare = parseCustomThemeId(themeId);
  const theme = bare ? getCustomTheme(bare) : undefined;
  if (theme) {
    applyCustomTheme(theme);
  } else {
    applyBuiltInTheme(DEFAULT_THEME);
  }
}

export function setTheme(themeId: ThemeId): void {
  persistThemeId(themeId);
  applyTheme(themeId);
}

export function initTheme(): ThemeId {
  const themeId = getStoredThemeId();
  applyTheme(themeId);
  return themeId;
}

export function getThemeBackground(themeId: ThemeId): string {
  if (isCustomThemeId(themeId)) {
    const theme = getCustomTheme(parseCustomThemeId(themeId) ?? "");
    return theme?.colors.bgApp ?? "#18181b";
  }
  const map: Record<BuiltInThemeId, string> = {
    retro16: "#1a1a2e",
    neoDark: "#18181b",
    qtEvolved: "#1e1e1e",
    clubNeon: "#0a0a0f",
    mutedPro: "#1c1f26",
  };
  return map[themeId as BuiltInThemeId] ?? "#18181b";
}

/** Restore active theme after closing custom-theme preview editor. */
export function reapplyStoredTheme(): ThemeId {
  const themeId = getStoredThemeId();
  applyTheme(themeId);
  return themeId;
}
