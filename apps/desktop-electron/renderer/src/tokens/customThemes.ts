/** User-editable color slots for custom themes. */
export interface CustomThemeColors {
  bgApp: string;
  bgPanel: string;
  bgInput: string;
  fgPrimary: string;
  fgMuted: string;
  accentPrimary: string;
  accentSuccess: string;
  accentWarning: string;
  accentDanger: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  colors: CustomThemeColors;
  createdAt: string;
  updatedAt: string;
}

export const CUSTOM_THEMES_STORAGE_KEY = "cuepoint-ui-lab-custom-themes";

export function createCustomThemeId(): string {
  return crypto.randomUUID();
}

export function toCustomThemeId(id: string): string {
  return id.startsWith("custom:") ? id : `custom:${id}`;
}

export function parseCustomThemeId(themeId: string): string | null {
  if (!themeId.startsWith("custom:")) return null;
  return themeId.slice("custom:".length);
}

export function listCustomThemes(): CustomTheme[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CustomTheme[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getCustomTheme(id: string): CustomTheme | undefined {
  const bare = parseCustomThemeId(id) ?? id;
  return listCustomThemes().find((t) => t.id === bare);
}

export function saveCustomTheme(theme: CustomTheme): CustomTheme {
  const themes = listCustomThemes();
  const idx = themes.findIndex((t) => t.id === theme.id);
  const next = { ...theme, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    themes[idx] = next;
  } else {
    themes.push(next);
  }
  localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes));
  return next;
}

export function deleteCustomTheme(id: string): void {
  const bare = parseCustomThemeId(id) ?? id;
  const themes = listCustomThemes().filter((t) => t.id !== bare);
  localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(themes));
}

export function createEmptyCustomTheme(name: string, colors: CustomThemeColors): CustomTheme {
  const now = new Date().toISOString();
  return {
    id: createCustomThemeId(),
    name,
    colors,
    createdAt: now,
    updatedAt: now,
  };
}

/** Default editor seed — neoDark palette. */
export const NEO_DARK_EDITOR_COLORS: CustomThemeColors = {
  bgApp: "#18181b",
  bgPanel: "#27272a",
  bgInput: "#18181b",
  fgPrimary: "#fafafa",
  fgMuted: "#a1a1aa",
  accentPrimary: "#8b5cf6",
  accentSuccess: "#22c55e",
  accentWarning: "#eab308",
  accentDanger: "#ef4444",
};
